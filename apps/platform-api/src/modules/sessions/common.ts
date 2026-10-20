import type {
  Assignment,
  Entry,
  NamedParticipantSchema,
  Occurrence,
  PairLock,
  Round,
  SessionCourt,
  SessionSeries,
  Timer,
} from '@buddyclub/shared-types';
import type { Transaction } from 'kysely';
import type { z } from 'zod';
import type { Database, Db } from '../../db/index.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';

export type DbOrTrx = Db | Transaction<Database>;
export type NamedParticipant = z.infer<typeof NamedParticipantSchema>;

export const SERIES_COLUMNS = [
  'id',
  'organisation_id',
  'group_id',
  'venue_id',
  'sport_id',
  'owner_scope',
  'buddy_group_id',
  'name',
  'description',
  'recurrence_rrule',
  'default_ruleset_id',
  'default_rules_json',
  'default_duration_minutes',
  'default_round_minutes',
  'archived_at',
  'version',
  'created_at',
] as const;

export interface SeriesRow {
  id: string;
  organisation_id: string;
  group_id: string | null;
  venue_id: string | null;
  sport_id: string;
  owner_scope: 'personal' | 'organisation' | 'buddy_group';
  buddy_group_id: string | null;
  name: string;
  description: string | null;
  recurrence_rrule: string | null;
  default_ruleset_id: string | null;
  default_rules_json: Record<string, unknown> | null;
  default_duration_minutes: number;
  default_round_minutes: number;
  archived_at: Date | null;
  version: number;
  created_at: Date;
}

export function toSeries(row: SeriesRow): SessionSeries {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    groupId: row.group_id,
    venueId: row.venue_id,
    sportId: row.sport_id,
    ownerScope: row.owner_scope,
    buddyGroupId: row.buddy_group_id,
    name: row.name,
    description: row.description,
    recurrenceRrule: row.recurrence_rrule,
    defaultRulesetId: row.default_ruleset_id,
    defaultRules: row.default_rules_json,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultRoundMinutes: row.default_round_minutes,
    archivedAt: toIsoOrNull(row.archived_at),
    version: row.version,
    createdAt: toIso(row.created_at),
  };
}

export async function loadSeries(db: DbOrTrx, seriesId: string): Promise<SeriesRow> {
  const row = await db
    .selectFrom('activities.session_series')
    .select(SERIES_COLUMNS)
    .where('id', '=', seriesId)
    .executeTakeFirst();
  if (!row) throw notFound('Session not found');
  return row;
}

export const OCCURRENCE_COLUMNS = [
  'id',
  'series_id',
  'organisation_id',
  'venue_id',
  'starts_at',
  'ends_at',
  'state',
  'rules_json',
  'rules_schema_version',
  'ruleset_id',
  'round_duration_seconds',
  'notes',
  'public_slug',
  'version',
  'opened_at',
  'started_at',
  'completed_at',
  'cancelled_at',
  'created_at',
] as const;

export interface OccurrenceRow {
  id: string;
  series_id: string;
  organisation_id: string;
  venue_id: string | null;
  starts_at: Date;
  ends_at: Date;
  state: Occurrence['state'];
  rules_json: Record<string, unknown>;
  rules_schema_version: number;
  ruleset_id: string | null;
  round_duration_seconds: number;
  notes: string | null;
  public_slug: string | null;
  version: number;
  opened_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

export async function loadOccurrence(
  db: DbOrTrx,
  occurrenceId: string,
  forUpdate = false,
): Promise<OccurrenceRow> {
  let q = db
    .selectFrom('activities.session_occurrences')
    .select(OCCURRENCE_COLUMNS)
    .where('id', '=', occurrenceId);
  if (forUpdate) q = q.forUpdate();
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Session occurrence not found');
  return row;
}

export async function bumpOccurrenceVersion(trx: DbOrTrx, occurrenceId: string): Promise<number> {
  const row = await trx
    .updateTable('activities.session_occurrences')
    .set((eb) => ({ version: eb('version', '+', 1) }))
    .where('id', '=', occurrenceId)
    .returning('version')
    .executeTakeFirstOrThrow();
  return row.version;
}

export async function loadSessionCourts(
  db: DbOrTrx,
  occurrenceId: string,
): Promise<SessionCourt[]> {
  const rows = await db
    .selectFrom('activities.session_courts as sc')
    .innerJoin('facilities.courts as c', 'c.id', 'sc.court_id')
    .select(['sc.court_id', 'c.code', 'c.label', 'sc.sort_order', 'sc.active'])
    .where('sc.occurrence_id', '=', occurrenceId)
    .orderBy('sc.sort_order')
    .orderBy('c.code')
    .execute();
  return rows.map((r) => ({
    courtId: r.court_id,
    code: r.code,
    label: r.label,
    sortOrder: r.sort_order,
    active: r.active,
  }));
}

export async function loadEntries(db: DbOrTrx, occurrenceId: string): Promise<Entry[]> {
  const rows = await db
    .selectFrom('activities.session_entries as e')
    .innerJoin('identity.participants as p', 'p.id', 'e.participant_id')
    .leftJoin('identity.user_profiles as u', 'u.id', 'p.user_profile_id')
    .select([
      'e.participant_id',
      'p.display_name',
      'u.avatar_url',
      'p.source',
      'p.skill_rating',
      'e.attendance_status',
      'e.joined_at',
      'e.check_in_at',
      'e.left_at',
    ])
    .where('e.occurrence_id', '=', occurrenceId)
    .orderBy('p.display_name')
    .execute();
  return rows.map((r) => ({
    participantId: r.participant_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
    source: r.source,
    skillRating: r.skill_rating === null ? null : Number(r.skill_rating),
    attendanceStatus: r.attendance_status,
    joinedAt: toIso(r.joined_at),
    checkInAt: toIsoOrNull(r.check_in_at),
    leftAt: toIsoOrNull(r.left_at),
  }));
}

export async function loadPairLocks(db: DbOrTrx, occurrenceId: string): Promise<PairLock[]> {
  const rows = await db
    .selectFrom('activities.pair_locks')
    .select(['id', 'participant_a', 'participant_b', 'kind', 'until_round', 'created_at'])
    .where('occurrence_id', '=', occurrenceId)
    .where('released_at', 'is', null)
    .orderBy('created_at')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    participantA: r.participant_a,
    participantB: r.participant_b,
    kind: r.kind,
    untilRound: r.until_round,
    createdAt: toIso(r.created_at),
  }));
}

export async function toOccurrenceDto(db: DbOrTrx, row: OccurrenceRow): Promise<Occurrence> {
  const [series, venue, counts, courts] = await Promise.all([
    db
      .selectFrom('activities.session_series')
      .select('name')
      .where('id', '=', row.series_id)
      .executeTakeFirstOrThrow(),
    row.venue_id
      ? db
          .selectFrom('facilities.venues')
          .select('name')
          .where('id', '=', row.venue_id)
          .executeTakeFirst()
      : Promise.resolve(undefined),
    db
      .selectFrom('activities.session_occurrences as o')
      .select((eb) => [
        eb
          .selectFrom('activities.session_entries as e')
          .select((e2) => e2.fn.countAll<string>().as('n'))
          .whereRef('e.occurrence_id', '=', 'o.id')
          .where('e.attendance_status', 'in', ['registered', 'checked_in'])
          .as('entries'),
        eb
          .selectFrom('activities.session_entries as e')
          .select((e2) => e2.fn.countAll<string>().as('n'))
          .whereRef('e.occurrence_id', '=', 'o.id')
          .where('e.attendance_status', '=', 'checked_in')
          .as('checked_in'),
        eb
          .selectFrom('activities.social_rounds as r')
          .select((e2) => e2.fn.countAll<string>().as('n'))
          .whereRef('r.occurrence_id', '=', 'o.id')
          .where('r.status', '!=', 'cancelled')
          .as('rounds'),
      ])
      .where('o.id', '=', row.id)
      .executeTakeFirstOrThrow(),
    loadSessionCourts(db, row.id),
  ]);
  return {
    id: row.id,
    seriesId: row.series_id,
    seriesName: series.name,
    organisationId: row.organisation_id,
    venueId: row.venue_id,
    venueName: venue?.name ?? null,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    state: row.state,
    roundDurationSeconds: row.round_duration_seconds,
    rules: row.rules_json,
    rulesSchemaVersion: row.rules_schema_version,
    notes: row.notes,
    version: row.version,
    openedAt: toIsoOrNull(row.opened_at),
    startedAt: toIsoOrNull(row.started_at),
    completedAt: toIsoOrNull(row.completed_at),
    cancelledAt: toIsoOrNull(row.cancelled_at),
    createdAt: toIso(row.created_at),
    counts: {
      entries: Number(counts.entries ?? 0),
      checkedIn: Number(counts.checked_in ?? 0),
      rounds: Number(counts.rounds ?? 0),
    },
    courts,
  };
}

export const ROUND_COLUMNS = [
  'id',
  'occurrence_id',
  'sequence_no',
  'status',
  'duration_seconds',
  'started_at',
  'paused_at',
  'paused_total_seconds',
  'completed_at',
  'cancelled_at',
  'revision',
  'algorithm_version',
  'seed',
  'metrics_json',
  'warnings_json',
] as const;

export interface RoundRow {
  id: string;
  occurrence_id: string;
  sequence_no: number;
  status: Round['status'];
  duration_seconds: number;
  started_at: Date | null;
  paused_at: Date | null;
  paused_total_seconds: number;
  completed_at: Date | null;
  cancelled_at: Date | null;
  revision: number;
  algorithm_version: string;
  seed: string;
  metrics_json: Record<string, number>;
  warnings_json: Array<{ code: string; detail: string }>;
}

export async function loadRound(
  db: DbOrTrx,
  roundId: string,
  forUpdate = false,
): Promise<RoundRow> {
  let q = db.selectFrom('activities.social_rounds').select(ROUND_COLUMNS).where('id', '=', roundId);
  if (forUpdate) q = q.forUpdate();
  const row = await q.executeTakeFirst();
  if (!row) throw notFound('Round not found');
  return row;
}

/** Server-authoritative timer (spec section 10). */
export function timerFor(row: RoundRow, now: Date): Timer {
  if (!row.started_at) {
    return {
      startedAt: null,
      pausedAt: null,
      pausedTotalSeconds: row.paused_total_seconds,
      durationSeconds: row.duration_seconds,
      endsAt: null,
      remainingSeconds: null,
    };
  }
  const pausedNow = row.paused_at
    ? Math.max(0, (now.getTime() - row.paused_at.getTime()) / 1000)
    : 0;
  const pausedTotal = row.paused_total_seconds + pausedNow;
  const endsAt = new Date(row.started_at.getTime() + (row.duration_seconds + pausedTotal) * 1000);
  const remaining =
    row.status === 'completed' || row.status === 'cancelled'
      ? 0
      : Math.max(0, Math.round((endsAt.getTime() - now.getTime()) / 1000));
  return {
    startedAt: toIso(row.started_at),
    pausedAt: toIsoOrNull(row.paused_at),
    pausedTotalSeconds: Math.round(pausedTotal),
    durationSeconds: row.duration_seconds,
    endsAt: toIso(endsAt),
    remainingSeconds: remaining,
  };
}

export interface RoundPlacement {
  assignments: Assignment[];
  resting: NamedParticipant[];
}

export async function loadPlacement(db: DbOrTrx, roundId: string): Promise<RoundPlacement> {
  const rows = await db
    .selectFrom('activities.round_assignments as ra')
    .innerJoin('identity.participants as p', 'p.id', 'ra.participant_id')
    .leftJoin('matches.matches as m', 'm.id', 'ra.match_id')
    .leftJoin('facilities.courts as c', 'c.id', 'm.court_id')
    .select([
      'ra.participant_id',
      'ra.role',
      'ra.match_id',
      'ra.side_no',
      'p.display_name',
      'm.court_id',
      'c.code as court_code',
    ])
    .where('ra.round_id', '=', roundId)
    .orderBy('c.code')
    .orderBy('ra.side_no')
    .orderBy('p.display_name')
    .execute();
  const byMatch = new Map<string, Assignment>();
  const resting: NamedParticipant[] = [];
  for (const r of rows) {
    const named = { participantId: r.participant_id, displayName: r.display_name };
    if (r.role === 'resting' || !r.match_id) {
      resting.push(named);
      continue;
    }
    let a = byMatch.get(r.match_id);
    if (!a) {
      a = {
        courtId: r.court_id ?? '',
        courtCode: r.court_code ?? '?',
        matchId: r.match_id,
        teams: [[], []],
      };
      byMatch.set(r.match_id, a);
    }
    (a.teams[(r.side_no ?? 1) - 1] as NamedParticipant[]).push(named);
  }
  return { assignments: [...byMatch.values()], resting };
}

export async function toRoundDto(db: DbOrTrx, row: RoundRow, now: Date): Promise<Round> {
  const placement = await loadPlacement(db, row.id);
  return {
    id: row.id,
    occurrenceId: row.occurrence_id,
    sequenceNo: row.sequence_no,
    status: row.status,
    revision: row.revision,
    timer: timerFor(row, now),
    completedAt: toIsoOrNull(row.completed_at),
    assignments: placement.assignments,
    resting: placement.resting,
    warnings: row.warnings_json ?? [],
    metrics: row.metrics_json ?? {},
  };
}

export function assertState(
  row: OccurrenceRow,
  allowed: Occurrence['state'][],
  what: string,
): void {
  if (!allowed.includes(row.state)) {
    throw new AppError(
      409,
      'CONFLICT',
      `Cannot ${what} while the session is ${row.state}`,
      `Allowed states: ${allowed.join(', ')}`,
    );
  }
}

/** Finds the actor's own participant record in an organisation, if any. */
export async function ownParticipantId(
  db: DbOrTrx,
  organisationId: string,
  profileId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('identity.participants')
    .select('id')
    .where('organisation_id', '=', organisationId)
    .where('user_profile_id', '=', profileId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  return row?.id ?? null;
}
