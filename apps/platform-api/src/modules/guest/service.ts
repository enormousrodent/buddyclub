import type { GuestMe, GuestScope, GuestSession } from '@buddyclub/shared-types';
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
