import type {
  CreateGuestGrantBody,
  CreateParticipantBody,
  GuestGrant,
  GuestGrantCreated,
  GuestScope,
  Participant,
  UpdateParticipantBody,
} from '@buddyclub/shared-types';
import { DeclaredAttributesSchema } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { generateOpaqueToken, hashToken, toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';

interface ParticipantRow {
  id: string;
  organisation_id: string;
  user_profile_id: string | null;
  display_name: string;
  source: Participant['source'];
  declared_attributes: Record<string, unknown>;
  skill_rating: string | null;
  archived_at: Date | null;
  version: number;
  created_at: Date;
}

const PARTICIPANT_COLUMNS = [
  'id',
  'organisation_id',
  'user_profile_id',
  'display_name',
  'source',
  'declared_attributes',
  'skill_rating',
  'archived_at',
  'version',
  'created_at',
] as const;

function toParticipant(row: ParticipantRow): Participant {
  const declared = DeclaredAttributesSchema.safeParse(row.declared_attributes);
  return {
    id: row.id,
    organisationId: row.organisation_id,
    displayName: row.display_name,
    source: row.source,
    userProfileId: row.user_profile_id,
    skillRating: row.skill_rating === null ? null : Number(row.skill_rating),
    declaredAttributes: declared.success ? declared.data : {},
    archivedAt: toIsoOrNull(row.archived_at),
    version: row.version,
    createdAt: toIso(row.created_at),
  };
}

export async function createParticipant(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateParticipantBody,
  ctx: CommandContext,
): Promise<Participant> {
  assertOrgAction(actor, organisationId, 'participants.manage');
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('identity.participants')
      .values({
        organisation_id: organisationId,
        user_profile_id: null,
        display_name: body.displayName,
        source: 'guest',
        skill_rating: body.skillRating ?? null,
        declared_attributes: JSON.stringify(body.declaredAttributes ?? {}),
        created_by_profile_id: actor.profileId,
      })
      .returning(PARTICIPANT_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'participant',
      entityId: row.id,
      operation: 'create_guest',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, displayName: row.display_name },
    });
    return toParticipant(row);
  });
}

export async function listParticipants(
  db: Db,
  actor: Actor,
  organisationId: string,
  includeArchived: boolean,
): Promise<Participant[]> {
  assertOrgMember(actor, organisationId);
  let query = db
    .selectFrom('identity.participants')
    .select(PARTICIPANT_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .orderBy('display_name');
  if (!includeArchived) query = query.where('archived_at', 'is', null);
  return (await query.execute()).map(toParticipant);
}

export async function getParticipant(
  db: Db,
  actor: Actor,
  organisationId: string,
  id: string,
): Promise<Participant> {
  assertOrgMember(actor, organisationId);
  const row = await db
    .selectFrom('identity.participants')
    .select(PARTICIPANT_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw notFound('Participant not found');
  return toParticipant(row);
}

export async function updateParticipant(
  db: Db,
  actor: Actor,
  organisationId: string,
  id: string,
  body: UpdateParticipantBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Participant> {
  assertOrgAction(actor, organisationId, 'participants.manage');
  return db.transaction().execute(async (trx) => {
    const before = await trx
      .selectFrom('identity.participants')
      .select(PARTICIPANT_COLUMNS)
      .where('organisation_id', '=', organisationId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!before) throw notFound('Participant not found');
    if (expectedVersion !== null && before.version !== expectedVersion)
      throw versionConflict('Participant');

    const row = await trx
      .updateTable('identity.participants')
      .set({
        ...(body.displayName !== undefined ? { display_name: body.displayName } : {}),
        ...(body.skillRating !== undefined ? { skill_rating: body.skillRating } : {}),
        ...(body.declaredAttributes !== undefined
          ? { declared_attributes: JSON.stringify(body.declaredAttributes) }
          : {}),
        version: before.version + 1,
      })
      .where('id', '=', id)
      .returning(PARTICIPANT_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'participant',
      entityId: id,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { displayName: before.display_name, skillRating: before.skill_rating },
      after: { displayName: row.display_name, skillRating: row.skill_rating },
    });
    return toParticipant(row);
  });
}

export async function archiveParticipant(
  db: Db,
  actor: Actor,
  organisationId: string,
  id: string,
  ctx: CommandContext,
): Promise<Participant> {
  assertOrgAction(actor, organisationId, 'participants.manage');
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('identity.participants')
      .set((eb) => ({ archived_at: new Date(), version: eb('version', '+', 1) }))
      .where('organisation_id', '=', organisationId)
      .where('id', '=', id)
      .where('archived_at', 'is', null)
      .returning(PARTICIPANT_COLUMNS)
      .executeTakeFirst();
    if (!row) throw notFound('Participant not found or already archived');
    await trx
      .updateTable('identity.guest_grants')
      .set({ revoked_at: new Date() })
      .where('participant_id', '=', id)
      .where('revoked_at', 'is', null)
      .execute();
    await recordAudit(trx, {
      entityType: 'participant',
      entityId: id,
      operation: 'archive',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
    });
    return toParticipant(row);
  });
}

interface GrantRow {
  id: string;
  participant_id: string;
  scopes: string[];
  expires_at: Date;
  revoked_at: Date | null;
  redeem_count: number;
  max_redeems: number;
  created_at: Date;
}

const GRANT_COLUMNS = [
  'id',
  'participant_id',
  'scopes',
  'expires_at',
  'revoked_at',
  'redeem_count',
  'max_redeems',
  'created_at',
] as const;

function toGrant(row: GrantRow): GuestGrant {
  return {
    id: row.id,
    participantId: row.participant_id,
    scopes: row.scopes as GuestScope[],
    expiresAt: toIso(row.expires_at),
    revokedAt: toIsoOrNull(row.revoked_at),
    redeemCount: row.redeem_count,
    maxRedeems: row.max_redeems,
    createdAt: toIso(row.created_at),
  };
}

export async function createGuestGrant(
  db: Db,
  actor: Actor,
  organisationId: string,
  participantId: string,
  body: CreateGuestGrantBody,
  ctx: CommandContext,
  sessionOccurrenceId: string | null = null,
): Promise<GuestGrantCreated> {
  assertOrgAction(actor, organisationId, 'participants.manage');
  const token = generateOpaqueToken();
  const row = await db.transaction().execute(async (trx) => {
    const participant = await trx
      .selectFrom('identity.participants')
      .select(['id', 'archived_at'])
      .where('organisation_id', '=', organisationId)
      .where('id', '=', participantId)
      .executeTakeFirst();
    if (!participant) throw notFound('Participant not found');
    if (participant.archived_at) {
      throw new AppError(
        409,
        'CONFLICT',
        'Participant is archived',
        'Restore the participant before issuing a link',
      );
    }
    const inserted = await trx
      .insertInto('identity.guest_grants')
      .values({
        participant_id: participantId,
        session_occurrence_id: sessionOccurrenceId,
        token_hash: hashToken(token),
        scopes: body.scopes,
        expires_at: new Date(Date.now() + body.expiresInHours * 3600 * 1000),
        max_redeems: body.maxRedeems,
        created_by_profile_id: actor.profileId,
      })
      .returning(GRANT_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'guest_grant',
      entityId: inserted.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId, scopes: body.scopes, maxRedeems: body.maxRedeems },
    });
    return inserted;
  });
  return { ...toGrant(row), token };
}

export async function listGuestGrants(
  db: Db,
  actor: Actor,
  organisationId: string,
  participantId: string,
): Promise<GuestGrant[]> {
  assertOrgAction(actor, organisationId, 'participants.manage');
  const rows = await db
    .selectFrom('identity.guest_grants as g')
    .innerJoin('identity.participants as p', 'p.id', 'g.participant_id')
    .select([
      'g.id',
      'g.participant_id',
      'g.scopes',
      'g.expires_at',
      'g.revoked_at',
      'g.redeem_count',
      'g.max_redeems',
      'g.created_at',
    ])
    .where('p.organisation_id', '=', organisationId)
    .where('g.participant_id', '=', participantId)
    .orderBy('g.created_at', 'desc')
    .execute();
  return rows.map(toGrant);
}

export async function revokeGuestGrant(
  db: Db,
  actor: Actor,
  organisationId: string,
  participantId: string,
  grantId: string,
  ctx: CommandContext,
): Promise<void> {
  assertOrgAction(actor, organisationId, 'participants.manage');
  await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable('identity.guest_grants')
      .set({ revoked_at: new Date() })
      .where('id', '=', grantId)
      .where('participant_id', '=', participantId)
      .where('revoked_at', 'is', null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('identity.participants')
            .select('id')
            .where('id', '=', participantId)
            .where('organisation_id', '=', organisationId),
        ),
      )
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Guest link not found or already revoked');
    await recordAudit(trx, {
      entityType: 'guest_grant',
      entityId: grantId,
      operation: 'revoke',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
    });
  });
}
