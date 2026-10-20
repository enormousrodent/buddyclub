import { randomBytes } from 'node:crypto';
import {
  LeagueRulesetSchema,
  REFERENCE_FOUR_RUBBER_TEMPLATE,
  type LeagueRuleset,
} from '@buddyclub/rules-schema';
import type { Division, Meet, Season } from '@buddyclub/shared-types';
import type { Transaction } from 'kysely';
import type { Database, Db } from '../../db/index.js';
import { toIso } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';

export type DbOrTrx = Db | Transaction<Database>;

/** Validates opaque league rules, filling the safe defaults (ADR-009). */
export function parseLeagueRules(definition: unknown): LeagueRuleset {
  const base =
    definition && typeof definition === 'object' ? (definition as Record<string, unknown>) : {};
  const parsed = LeagueRulesetSchema.safeParse({
    schemaVersion: 1,
    kind: 'league',
    scoring: {},
    rubberTemplate: REFERENCE_FOUR_RUBBER_TEMPLATE,
    ...base,
  });
  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Invalid league rules',
      undefined,
      parsed.error.issues.map((i) => ({
        path: `body/rules/${i.path.join('/')}`,
        message: i.message,
      })),
    );
  }
  return parsed.data;
}

export const DEFAULT_LEAGUE_RULES: LeagueRuleset = parseLeagueRules({});

export interface SeasonRow {
  id: string;
  competition_id: string;
  competition_name: string;
  organisation_id: string;
  name: string;
  starts_at: Date;
  ends_at: Date;
  state: Season['state'];
  rules_json: Record<string, unknown>;
  rules_schema_version: number;
  version: number;
  created_at: Date;
}

export async function loadSeason(
  db: DbOrTrx,
  seasonId: string,
  forUpdate = false,
): Promise<SeasonRow> {
  let q = db
    .selectFrom('competition.seasons as s')
    .innerJoin('competition.competitions as c', 'c.id', 's.competition_id')
    .select([
      's.id',
      's.competition_id',
      'c.name as competition_name',
      'c.organisation_id',
      's.name',
      's.starts_at',
      's.ends_at',
      's.state',
      's.rules_json',
      's.rules_schema_version',
      's.version',
      's.created_at',
    ])
    .where('s.id', '=', seasonId);
  if (forUpdate) q = q.forUpdate('s');
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Season not found');
  return row;
}

export async function loadDivisions(db: DbOrTrx, seasonId: string): Promise<Division[]> {
  const rows = await db
    .selectFrom('competition.divisions')
    .select(['id', 'season_id', 'ordinal', 'name', 'capacity'])
    .where('season_id', '=', seasonId)
    .orderBy('ordinal')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    seasonId: r.season_id,
    ordinal: r.ordinal,
    name: r.name,
    capacity: r.capacity,
  }));
}

export async function toSeasonDto(db: DbOrTrx, row: SeasonRow): Promise<Season> {
  return {
    id: row.id,
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    organisationId: row.organisation_id,
    name: row.name,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    state: row.state,
    rules: row.rules_json,
    rulesSchemaVersion: row.rules_schema_version,
    version: row.version,
    divisions: await loadDivisions(db, row.id),
    createdAt: toIso(row.created_at),
  };
}

export interface MeetRow {
  id: string;
  season_id: string;
  venue_id: string | null;
  name: string;
  sequence_no: number;
  starts_at: Date;
  ends_at: Date;
  state: Meet['state'];
  format: Meet['format'];
  public_slug: string | null;
  rules_json: Record<string, unknown> | null;
  rules_schema_version: number | null;
  version: number;
  created_at: Date;
}

export const MEET_COLUMNS = [
  'id',
  'season_id',
  'venue_id',
  'name',
  'sequence_no',
  'starts_at',
  'ends_at',
  'state',
  'format',
  'public_slug',
  'rules_json',
  'rules_schema_version',
  'version',
  'created_at',
] as const;

/** Random public slug for boards and QR join pages: 10 lower-case alphanumerics (~52 bits). */
export function randomSlug(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export async function loadMeet(db: DbOrTrx, meetId: string, forUpdate = false): Promise<MeetRow> {
  let q = db.selectFrom('competition.meets').select(MEET_COLUMNS).where('id', '=', meetId);
  if (forUpdate) q = q.forUpdate();
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Meet not found');
  return row;
}

/** The rules a meet runs under: its own snapshot once published, otherwise the season's. */
export async function meetRules(
  db: DbOrTrx,
  meet: MeetRow,
): Promise<{ rules: LeagueRuleset; version: string }> {
  if (meet.rules_json) {
    return {
      rules: parseLeagueRules(meet.rules_json),
      version: `league@${meet.rules_schema_version ?? 1}:meet:${meet.id}`,
    };
  }
  const season = await loadSeason(db, meet.season_id);
  return {
    rules: parseLeagueRules(season.rules_json),
    version: `league@${season.rules_schema_version}:season:${season.id}:v${season.version}`,
  };
}

export async function toMeetDto(db: DbOrTrx, row: MeetRow): Promise<Meet> {
  const season = await loadSeason(db, row.season_id);
  const [venue, divisions, assignments, pools, counts] = await Promise.all([
    row.venue_id
      ? db
          .selectFrom('facilities.venues')
          .select('name')
          .where('id', '=', row.venue_id)
          .executeTakeFirst()
      : Promise.resolve(undefined),
    loadDivisions(db, row.season_id),
    db
      .selectFrom('competition.division_assignments as da')
      .innerJoin('competition.teams as t', 't.id', 'da.team_id')
      .select(['da.division_id', 'da.team_id', 't.name', 'da.seed'])
      .where('da.meet_id', '=', row.id)
      .orderBy('da.seed')
      .orderBy('t.name')
      .execute(),
    db
      .selectFrom('facilities.court_pools as p')
      .innerJoin('facilities.court_pool_members as m', 'm.court_pool_id', 'p.id')
      .innerJoin('facilities.courts as c', 'c.id', 'm.court_id')
      .select(['p.division_id', 'c.id as court_id', 'c.code'])
      .where('p.meet_id', '=', row.id)
      .orderBy('c.code')
      .execute(),
    db
      .selectFrom('competition.fixtures as f')
      .select((eb) => [
        eb.fn.countAll<string>().as('fixtures'),
        eb.fn
          .count<string>('f.id')
          .filterWhere('f.status', 'in', ['completed', 'needs_review'])
          .as('completed'),
        eb.fn.count<string>('f.id').filterWhere('f.stage', '=', 'knockout').as('knockout'),
        eb.fn
          .count<string>('f.id')
          .filterWhere((w) =>
            w.and([
              w('f.stage', '=', 'knockout'),
              w('f.home_team_id', 'is not', null),
              w('f.away_team_id', 'is not', null),
            ]),
          )
          .as('knockout_resolved'),
      ])
      .where('f.meet_id', '=', row.id)
      .executeTakeFirst(),
  ]);
  const rubberCount = await db
    .selectFrom('matches.matches as m')
    .innerJoin('competition.fixtures as f', 'f.id', 'm.fixture_id')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('f.meet_id', '=', row.id)
    .executeTakeFirst();
  return {
    id: row.id,
    seasonId: row.season_id,
    seasonName: season.name,
    competitionName: season.competition_name,
    organisationId: season.organisation_id,
    venueId: row.venue_id,
    venueName: venue?.name ?? null,
    name: row.name,
    sequenceNo: row.sequence_no,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    state: row.state,
    format: row.format,
    publicSlug: row.public_slug,
    version: row.version,
    divisions: divisions.map((d) => ({
      division: d,
      teams: assignments
        .filter((a) => a.division_id === d.id)
        .map((a) => ({ teamId: a.team_id, name: a.name, seed: a.seed })),
      courts: pools
        .filter((p) => p.division_id === d.id)
        .map((p) => ({ courtId: p.court_id, code: p.code })),
    })),
    counts: {
      fixtures: Number(counts?.fixtures ?? 0),
      rubbers: Number(rubberCount?.n ?? 0),
      completedFixtures: Number(counts?.completed ?? 0),
      knockoutFixtures: Number(counts?.knockout ?? 0),
      knockoutResolved: Number(counts?.knockout_resolved ?? 0),
    },
    createdAt: toIso(row.created_at),
  };
}

/** Organisation that owns the meet (via season and competition). */
export async function meetOrganisation(
  db: DbOrTrx,
  meetId: string,
): Promise<{ meet: MeetRow; organisationId: string }> {
  const meet = await loadMeet(db, meetId);
  const season = await loadSeason(db, meet.season_id);
  return { meet, organisationId: season.organisation_id };
}
