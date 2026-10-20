import type {
  CreateTeamBody,
  RosterEntry,
  Team,
  TeamDetail,
  UpdateTeamBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { isPgCode, PG_UNIQUE_VIOLATION } from '../../platform/pg-errors.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import type { DbOrTrx } from './common.js';

const TEAM_COLUMNS = [
  'id',
  'organisation_id',
  'name',
  'short_name',
  'captain_participant_id',
  'archived_at',
  'version',
  'created_at',
] as const;

interface TeamRow {
  id: string;
  organisation_id: string;
  name: string;
  short_name: string | null;
  captain_participant_id: string | null;
  archived_at: Date | null;
  version: number;
  created_at: Date;
}

async function rosterCount(db: DbOrTrx, teamId: string): Promise<number> {
  const r = await db
    .selectFrom('competition.team_roster')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('team_id', '=', teamId)
    .where('valid_to', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

async function toTeam(db: DbOrTrx, row: TeamRow): Promise<Team> {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    shortName: row.short_name,
    captainParticipantId: row.captain_participant_id,
    rosterCount: await rosterCount(db, row.id),
    archivedAt: toIsoOrNull(row.archived_at),
    version: row.version,
    createdAt: toIso(row.created_at),
  };
}

export async function loadTeam(db: DbOrTrx, teamId: string, forUpdate = false): Promise<TeamRow> {
  let q = db.selectFrom('competition.teams').select(TEAM_COLUMNS).where('id', '=', teamId);
  if (forUpdate) q = q.forUpdate();
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Team not found');
  return row;
}

export async function loadRoster(
  db: DbOrTrx,
  teamId: string,
  captainId: string | null,
): Promise<RosterEntry[]> {
  const rows = await db
    .selectFrom('competition.team_roster as r')
    .innerJoin('identity.participants as p', 'p.id', 'r.participant_id')
    .select(['r.participant_id', 'p.display_name', 'r.valid_from', 'r.valid_to'])
    .where('r.team_id', '=', teamId)
    .where('r.valid_to', 'is', null)
    .orderBy('p.display_name')
    .execute();
  return rows.map((r) => ({
    participantId: r.participant_id,
    displayName: r.display_name,
    validFrom: toIso(r.valid_from),
    validTo: toIsoOrNull(r.valid_to),
    isCaptain: r.participant_id === captainId,
  }));
}

async function assertParticipant(
  db: DbOrTrx,
  organisationId: string,
  participantId: string,
): Promise<void> {
  const p = await db
    .selectFrom('identity.participants')
    .select('id')
    .where('id', '=', participantId)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!p)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown participant', undefined, [
      { path: 'body/participantId', message: 'not an active participant of this organisation' },
    ]);
}

export async function createTeam(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateTeamBody,
  ctx: CommandContext,
): Promise<Team> {
  assertOrgAction(actor, organisationId, 'competition.manage');
  if (body.captainParticipantId)
    await assertParticipant(db, organisationId, body.captainParticipantId);
  return db.transaction().execute(async (trx) => {
    let row: TeamRow;
    try {
      row = await trx
        .insertInto('competition.teams')
        .values({
          organisation_id: organisationId,
          name: body.name,
          short_name: body.shortName ?? null,
          captain_participant_id: body.captainParticipantId ?? null,
          created_by_profile_id: actor.profileId,
        })
        .returning(TEAM_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_UNIQUE_VIOLATION))
        throw new AppError(409, 'CONFLICT', 'A team with that name already exists');
      throw error;
    }
    if (body.captainParticipantId) {
      await trx
        .insertInto('competition.team_roster')
        .values({
          team_id: row.id,
          participant_id: body.captainParticipantId,
          created_by_profile_id: actor.profileId,
        })
        .execute();
    }
    await recordAudit(trx, {
      entityType: 'team',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, name: body.name },
    });
    return toTeam(trx, row);
  });
}

export async function listTeams(db: Db, actor: Actor, organisationId: string): Promise<Team[]> {
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('competition.teams')
    .select(TEAM_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .orderBy('name')
    .execute();
  return Promise.all(rows.map((r) => toTeam(db, r)));
}

export async function getTeam(db: Db, actor: Actor, teamId: string): Promise<TeamDetail> {
  const row = await loadTeam(db, teamId);
  assertOrgMember(actor, row.organisation_id);
  return {
    ...(await toTeam(db, row)),
    roster: await loadRoster(db, teamId, row.captain_participant_id),
  };
}

export async function updateTeam(
  db: Db,
  actor: Actor,
  teamId: string,
  body: UpdateTeamBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Team> {
  return db.transaction().execute(async (trx) => {
    const before = await loadTeam(trx, teamId, true);
    assertOrgAction(actor, before.organisation_id, 'competition.manage');
    if (expectedVersion !== null && before.version !== expectedVersion)
      throw versionConflict('Team');
    if (body.captainParticipantId) {
      await assertParticipant(trx, before.organisation_id, body.captainParticipantId);
      await trx
        .insertInto('competition.team_roster')
        .values({
          team_id: teamId,
          participant_id: body.captainParticipantId,
          created_by_profile_id: actor.profileId,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
    let row: TeamRow;
    try {
      row = await trx
        .updateTable('competition.teams')
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.shortName !== undefined ? { short_name: body.shortName } : {}),
          ...(body.captainParticipantId !== undefined
            ? { captain_participant_id: body.captainParticipantId }
            : {}),
          version: before.version + 1,
        })
        .where('id', '=', teamId)
        .returning(TEAM_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_UNIQUE_VIOLATION))
        throw new AppError(409, 'CONFLICT', 'A team with that name already exists');
      throw error;
    }
    await recordAudit(trx, {
      entityType: 'team',
      entityId: teamId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { name: before.name, captain: before.captain_participant_id },
      after: { name: row.name, captain: row.captain_participant_id },
    });
    return toTeam(trx, row);
  });
}

export async function addToRoster(
  db: Db,
  actor: Actor,
  teamId: string,
  participantId: string,
  ctx: CommandContext,
): Promise<TeamDetail> {
  await db.transaction().execute(async (trx) => {
    const team = await loadTeam(trx, teamId, true);
    assertOrgAction(actor, team.organisation_id, 'competition.manage');
    await assertParticipant(trx, team.organisation_id, participantId);
    await trx
      .insertInto('competition.team_roster')
      .values({
        team_id: teamId,
        participant_id: participantId,
        created_by_profile_id: actor.profileId,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
    await recordAudit(trx, {
      entityType: 'team',
      entityId: teamId,
      operation: 'roster_add',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId },
    });
  });
  return getTeam(db, actor, teamId);
}

export async function removeFromRoster(
  db: Db,
  actor: Actor,
  teamId: string,
  participantId: string,
  ctx: CommandContext,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const team = await loadTeam(trx, teamId, true);
    assertOrgAction(actor, team.organisation_id, 'competition.manage');
    const updated = await trx
      .updateTable('competition.team_roster')
      .set({ valid_to: new Date() })
      .where('team_id', '=', teamId)
      .where('participant_id', '=', participantId)
      .where('valid_to', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Participant is not on the roster');
    if (team.captain_participant_id === participantId) {
      await trx
        .updateTable('competition.teams')
        .set({ captain_participant_id: null })
        .where('id', '=', teamId)
        .execute();
    }
    await recordAudit(trx, {
      entityType: 'team',
      entityId: teamId,
      operation: 'roster_remove',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { participantId },
    });
  });
}

/** True when the actor's own participant is the captain of the team. */
export async function isCaptainOf(
  db: DbOrTrx,
  actor: Actor,
  team: { organisation_id: string; captain_participant_id: string | null },
): Promise<boolean> {
  if (!team.captain_participant_id) return false;
  const mine = await db
    .selectFrom('identity.participants')
    .select('id')
    .where('id', '=', team.captain_participant_id)
    .where('user_profile_id', '=', actor.profileId)
    .executeTakeFirst();
  return !!mine;
}
