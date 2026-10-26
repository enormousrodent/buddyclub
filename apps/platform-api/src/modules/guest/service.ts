import type {
  ClaimPreview,
  ClaimResult,
  GuestMe,
  GuestScope,
  GuestSession,
} from '@buddyclub/shared-types';
import type { Actor } from '../../platform/actor.js';
import type { CommandContext } from '../organisations/service.js';
import type { Db } from '../../db/index.js';
import { recordAudit } from '../../platform/audit.js';
import type { GuestTokenService } from '../../platform/guest-token.js';
import { hashToken, toIso } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { GuestContext } from '../../plugins/guest.js';

/** Exchanges a guest link token for a short-lived guest credential (ADR-008). */
export async function redeemGuestLink(
  db: Db,
  guestTokens: GuestTokenService,
  token: string,
  correlationId: string,
): Promise<GuestSession> {
  return db.transaction().execute(async (trx) => {
    const grant = await trx
      .selectFrom('identity.guest_grants')
      .select([
        'id',
        'participant_id',
        'scopes',
        'expires_at',
        'revoked_at',
        'redeem_count',
        'max_redeems',
      ])
      .where('token_hash', '=', hashToken(token))
      .forUpdate()
      .executeTakeFirst();
    if (!grant) throw notFound('Guest link not found');
    if (grant.revoked_at) throw new AppError(409, 'CONFLICT', 'Guest link has been revoked');
    if (grant.expires_at.getTime() <= Date.now())
      throw new AppError(409, 'CONFLICT', 'Guest link has expired');
    if (grant.redeem_count >= grant.max_redeems) {
      throw new AppError(
        409,
        'CONFLICT',
        'Guest link has been used too many times',
        'Ask the organiser for a new link',
      );
    }

    const participant = await trx
      .selectFrom('identity.participants as p')
      .innerJoin('community.organisations as o', 'o.id', 'p.organisation_id')
      .select([
        'p.id',
        'p.display_name',
        'p.archived_at',
        'o.id as organisation_id',
        'o.name as organisation_name',
      ])
      .where('p.id', '=', grant.participant_id)
      .executeTakeFirstOrThrow();
    if (participant.archived_at) throw new AppError(409, 'CONFLICT', 'Participant is archived');

    await trx
      .updateTable('identity.guest_grants')
      .set((eb) => ({ redeem_count: eb('redeem_count', '+', 1), redeemed_at: new Date() }))
      .where('id', '=', grant.id)
      .execute();
    await recordAudit(trx, {
      entityType: 'guest_grant',
      entityId: grant.id,
      operation: 'redeem',
      actor: { type: 'guest', id: participant.id },
      correlationId,
    });

    const scopes = grant.scopes as GuestScope[];
    const issued = await guestTokens.issue({
      participantId: participant.id,
      organisationId: participant.organisation_id,
      grantId: grant.id,
      scopes,
      grantExpiresAt: grant.expires_at,
    });
    return {
      accessToken: issued.token,
      expiresAt: toIso(issued.expiresAt),
      participant: { id: participant.id, displayName: participant.display_name },
      organisation: { id: participant.organisation_id, name: participant.organisation_name },
      scopes,
    };
  });
}

export async function guestMe(db: Db, guest: GuestContext): Promise<GuestMe> {
  const row = await db
    .selectFrom('identity.participants as p')
    .innerJoin('community.organisations as o', 'o.id', 'p.organisation_id')
    .select(['p.id', 'p.display_name', 'o.id as organisation_id', 'o.name as organisation_name'])
    .where('p.id', '=', guest.participantId)
    .executeTakeFirst();
  if (!row) throw notFound('Participant not found');
  return {
    participant: { id: row.id, displayName: row.display_name },
    organisation: { id: row.organisation_id, name: row.organisation_name },
    scopes: guest.scopes,
    grantExpiresAt: toIso(guest.grantExpiresAt),
  };
}

type ClaimRow = {
  grant_id: string;
  revoked_at: Date | null;
  expires_at: Date;
  participant_id: string;
  display_name: string;
  user_profile_id: string | null;
  archived_at: Date | null;
  organisation_id: string;
  organisation_name: string;
};

async function claimRow(
  db: Parameters<typeof recordAudit>[0],
  token: string,
  lock: boolean,
): Promise<ClaimRow | undefined> {
  let q = db
    .selectFrom('identity.guest_grants as g')
    .innerJoin('identity.participants as p', 'p.id', 'g.participant_id')
    .innerJoin('community.organisations as o', 'o.id', 'p.organisation_id')
    .select([
      'g.id as grant_id',
      'g.revoked_at',
      'g.expires_at',
      'p.id as participant_id',
      'p.display_name',
      'p.user_profile_id',
      'p.archived_at',
      'o.id as organisation_id',
      'o.name as organisation_name',
    ])
    .where('g.token_hash', '=', hashToken(token));
  if (lock) q = q.forUpdate('p');
  return q.executeTakeFirst();
}

function claimReason(row: ClaimRow, actor: Actor): string | null {
  if (row.revoked_at) return 'This link has been used or revoked. Ask the organiser for a new one.';
  if (row.expires_at.getTime() <= Date.now())
    return 'This link has expired. Ask the organiser for a new one.';
  if (row.archived_at) return 'This player has been archived by the organiser.';
  if (row.user_profile_id === actor.profileId) return 'This player is already yours.';
  if (row.user_profile_id) return 'Someone has already claimed this player.';
  return null;
}

/** What a claim would do, before the person agrees to it. */
export async function previewClaim(db: Db, actor: Actor, token: string): Promise<ClaimPreview> {
  const row = await claimRow(db, token, false);
  if (!row) throw notFound('Guest link not found');
  const nights = await db
    .selectFrom('activities.session_entries')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('participant_id', '=', row.participant_id)
    .where('check_in_at', 'is not', null)
    .executeTakeFirstOrThrow();
  const reason = claimReason(row, actor);
  return {
    participant: { id: row.participant_id, displayName: row.display_name },
    organisation: { id: row.organisation_id, name: row.organisation_name },
    nightsPlayed: Number(nights.n),
    claimable: reason === null,
    reason,
  };
}

/**
 * Takes over the name-only player the link points at: the record gets the account, the
 * account's name and club membership; its nights, regular status and ratings stay (ADR-003).
 * The link is spent. If the account already had an empty player record in the club, that one
 * goes; if it had played, the claim is refused rather than merged.
 */
export async function claimGuest(
  db: Db,
  actor: Actor,
  token: string,
  ctx: CommandContext,
): Promise<ClaimResult> {
  return db.transaction().execute(async (trx) => {
    const row = await claimRow(trx, token, true);
    if (!row) throw notFound('Guest link not found');
    const reason = claimReason(row, actor);
    if (reason) throw new AppError(409, 'CONFLICT', reason);

    const mine = await trx
      .selectFrom('identity.participants')
      .select('id')
      .where('organisation_id', '=', row.organisation_id)
      .where('user_profile_id', '=', actor.profileId)
      .executeTakeFirst();
    if (mine) {
      const played = await trx
        .selectFrom('activities.session_entries')
        .select('id')
        .where('participant_id', '=', mine.id)
        .limit(1)
        .executeTakeFirst();
      if (played)
        throw new AppError(
          409,
          'CONFLICT',
          'You already play at this club under your own account',
          'Ask the organiser to tidy the two records up',
        );
      await trx
        .deleteFrom('activities.session_regulars')
        .where('participant_id', '=', mine.id)
        .execute();
      await trx.deleteFrom('identity.participants').where('id', '=', mine.id).execute();
    }

    await trx
      .updateTable('identity.participants')
      .set({
        user_profile_id: actor.profileId,
        display_name: actor.displayName,
        source: 'registered',
      })
      .where('id', '=', row.participant_id)
      .execute();
    await trx
      .insertInto('community.memberships')
      .values({
        organisation_id: row.organisation_id,
        user_profile_id: actor.profileId,
        role: 'participant',
      })
      .onConflict((oc) =>
        oc.columns(['organisation_id', 'user_profile_id']).doUpdateSet({ status: 'active' }),
      )
      .execute();
    await trx
      .updateTable('identity.guest_grants')
      .set({ revoked_at: new Date() })
      .where('id', '=', row.grant_id)
      .execute();
    await recordAudit(trx, {
      entityType: 'participant',
      entityId: row.participant_id,
      operation: 'claim',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { displayName: row.display_name, userProfileId: null },
      after: {
        displayName: actor.displayName,
        userProfileId: actor.profileId,
        grantId: row.grant_id,
        consent: true,
        mergedEmptyRecord: Boolean(mine),
      },
    });
    return {
      participant: { id: row.participant_id, displayName: actor.displayName },
      organisation: { id: row.organisation_id, name: row.organisation_name },
    };
  });
}
