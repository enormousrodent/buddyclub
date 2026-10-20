import type {
  Competition,
  CreateCompetitionBody,
  CreateSeasonBody,
  Season,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { isPgCode, PG_FOREIGN_KEY_VIOLATION } from '../../platform/pg-errors.js';
import { toIso } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { loadSeason, parseLeagueRules, toSeasonDto } from './common.js';

const COMPETITION_COLUMNS = [
  'id',
  'organisation_id',
  'type',
  'sport_id',
  'name',
  'description',
  'version',
  'created_at',
] as const;

interface CompetitionRow {
  id: string;
  organisation_id: string;
  type: Competition['type'];
  sport_id: string;
  name: string;
  description: string | null;
  version: number;
  created_at: Date;
}

function toCompetition(row: CompetitionRow): Competition {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    type: row.type,
    sportId: row.sport_id,
    name: row.name,
    description: row.description,
    version: row.version,
    createdAt: toIso(row.created_at),
  };
}

export async function createCompetition(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateCompetitionBody,
  ctx: CommandContext,
): Promise<Competition> {
  assertOrgAction(actor, organisationId, 'competition.manage');
  return db.transaction().execute(async (trx) => {
    let row: CompetitionRow;
    try {
      row = await trx
        .insertInto('competition.competitions')
        .values({
          organisation_id: organisationId,
          type: body.type,
          sport_id: body.sportId,
          name: body.name,
          description: body.description ?? null,
          created_by_profile_id: actor.profileId,
        })
        .returning(COMPETITION_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_FOREIGN_KEY_VIOLATION))
        throw new AppError(400, 'VALIDATION_FAILED', 'Unknown sport', undefined, [
          { path: 'body/sportId', message: 'unknown sport' },
        ]);
      throw error;
    }
    await recordAudit(trx, {
      entityType: 'competition',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, name: body.name, type: body.type },
    });
    return toCompetition(row);
  });
}

export async function listCompetitions(
  db: Db,
  actor: Actor,
  organisationId: string,
): Promise<Competition[]> {
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('competition.competitions')
    .select(COMPETITION_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .orderBy('name')
    .execute();
  return rows.map(toCompetition);
}

export async function getCompetition(
  db: Db,
  actor: Actor,
  competitionId: string,
): Promise<Competition & { seasons: Season[] }> {
  const row = await db
    .selectFrom('competition.competitions')
    .select(COMPETITION_COLUMNS)
    .where('id', '=', competitionId)
    .executeTakeFirst();
  if (!row) throw notFound('Competition not found');
  assertOrgMember(actor, row.organisation_id);
  const seasonIds = await db
    .selectFrom('competition.seasons')
    .select('id')
    .where('competition_id', '=', competitionId)
    .orderBy('starts_at', 'desc')
    .execute();
  const seasons = await Promise.all(
    seasonIds.map(async (s) => toSeasonDto(db, await loadSeason(db, s.id))),
  );
  return { ...toCompetition(row), seasons };
}

export async function createSeason(
  db: Db,
  actor: Actor,
  competitionId: string,
  body: CreateSeasonBody,
  ctx: CommandContext,
): Promise<Season> {
  const comp = await db
    .selectFrom('competition.competitions')
    .select(['id', 'organisation_id'])
    .where('id', '=', competitionId)
    .executeTakeFirst();
  if (!comp) throw notFound('Competition not found');
  assertOrgAction(actor, comp.organisation_id, 'competition.manage');
  const rules = parseLeagueRules(body.rules ?? {});
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (endsAt <= startsAt)
    throw new AppError(400, 'VALIDATION_FAILED', 'Season end must be after start', undefined, [
      { path: 'body/endsAt', message: 'must be after startsAt' },
    ]);
  return db.transaction().execute(async (trx) => {
    const season = await trx
      .insertInto('competition.seasons')
      .values({
        competition_id: competitionId,
        name: body.name,
        starts_at: startsAt,
        ends_at: endsAt,
        rules_json: JSON.stringify(rules),
        rules_schema_version: rules.schemaVersion,
        created_by_profile_id: actor.profileId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('competition.divisions')
      .values(
        body.divisions.map((d, i) => ({
          season_id: season.id,
          ordinal: i + 1,
          name: d.name,
          capacity: d.capacity,
        })),
      )
      .execute();
    await recordAudit(trx, {
      entityType: 'season',
      entityId: season.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { competitionId, name: body.name, divisions: body.divisions.length, rules },
    });
    return toSeasonDto(trx, await loadSeason(trx, season.id));
  });
}

export async function getSeason(db: Db, actor: Actor, seasonId: string): Promise<Season> {
  const row = await loadSeason(db, seasonId);
  assertOrgMember(actor, row.organisation_id);
  return toSeasonDto(db, row);
}
