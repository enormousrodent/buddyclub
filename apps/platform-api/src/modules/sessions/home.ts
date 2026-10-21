import type { MySession, Preset, ScheduledSession } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { canManageSeries, canOrgAction } from '../../platform/authz.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { nextStartOf, ROUND_COLUMNS, scheduleOf, timerFor, type DbOrTrx } from './common.js';

/** Rally home read models (Addendum 1.1, section 6): what is live now, and what can be started. */

async function liveSummary(
  db: DbOrTrx,
  occurrenceId: string,
  now: Date,
): Promise<NonNullable<MySession['live']>> {
  const rounds = await db
    .selectFrom('activities.social_rounds')
    .select(ROUND_COLUMNS)
    .where('occurrence_id', '=', occurrenceId)
    .where('status', '!=', 'cancelled')
    .orderBy('sequence_no')
    .execute();
  const current =
    rounds.find((r) => r.status === 'in_progress' || r.status === 'paused') ??
    rounds.find((r) => r.status === 'published') ??
    null;
  const [courts, here] = await Promise.all([
    current
      ? db
          .selectFrom('matches.matches')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('social_round_id', '=', current.id)
          .where('state', 'in', ['scheduled', 'in_progress'])
          .executeTakeFirst()
      : Promise.resolve({ n: '0' }),
    db
      .selectFrom('activities.session_entries')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('occurrence_id', '=', occurrenceId)
      .where('attendance_status', '=', 'checked_in')
      .executeTakeFirst(),
  ]);
  return {
    roundNo: current?.sequence_no ?? null,
    roundStatus: current?.status ?? null,
    timer: current ? timerFor(current, now) : null,
    courtsInPlay: Number(courts?.n ?? 0),
    playersHere: Number(here?.n ?? 0),
    serverTime: toIso(now),
  };
}

/** Adds the live summary to open and live sessions. */
export async function withLive(db: DbOrTrx, sessions: MySession[]): Promise<MySession[]> {
  const now = new Date();
  return Promise.all(
    sessions.map(async (s) =>
      s.state === 'open' || s.state === 'live'
        ? { ...s, live: await liveSummary(db, s.occurrenceId, now) }
        : { ...s, live: null },
    ),
  );
}

/** How far a night may sit from a scheduled date and still count as that date's night. */
const SAME_DATE_MS = 6 * 3600 * 1000;

interface PendingNight {
  id: string;
  starts_at: Date;
  state: 'draft' | 'open' | 'live';
}

/** Nights not yet over, per series: planned, open or live, ending after now. */
async function pendingNights(
  db: DbOrTrx,
  seriesIds: string[],
  now: Date,
): Promise<Map<string, PendingNight[]>> {
  const map = new Map<string, PendingNight[]>();
  if (!seriesIds.length) return map;
  const rows = await db
    .selectFrom('activities.session_occurrences')
    .select(['id', 'series_id', 'starts_at', 'state'])
    .where('series_id', 'in', seriesIds)
    .where('state', 'in', ['draft', 'open', 'live'])
    .where('ends_at', '>=', now)
    .orderBy('starts_at')
    .execute();
  for (const r of rows) {
    const list = map.get(r.series_id) ?? [];
    list.push({ id: r.id, starts_at: r.starts_at, state: r.state as PendingNight['state'] });
    map.set(r.series_id, list);
  }
  return map;
}

/**
 * The night that stands for a scheduled date: one starting within a few hours of it. An ad hoc
 * night on another day never hides the scheduled one.
 */
function nightFor(nights: PendingNight[] | undefined, at: Date | null): PendingNight | null {
  if (!nights || !at) return null;
  return nights.find((n) => Math.abs(n.starts_at.getTime() - at.getTime()) <= SAME_DATE_MS) ?? null;
}

/**
 * Sessions the caller can run: every series in a club where they organise, plus the ones they
 * host elsewhere (Addendum 1.2). Newest activity first.
 */
export async function myPresets(db: Db, actor: Actor): Promise<Preset[]> {
  const orgIds = [...actor.memberships.entries()]
    .filter(([id, m]) => m.status === 'active' && canOrgAction(actor, id, 'session.manage'))
    .map(([id]) => id);
  const hosted = [...actor.hostedSeries];
  if (orgIds.length === 0 && hosted.length === 0) return [];
  const now = new Date();
  // "Live now" means live, or open and within three hours of its start; a night set up days
  // ahead is upcoming instead.
  const soon = new Date(now.getTime() + 3 * 3600 * 1000);
  const rows = await db
    .selectFrom('activities.session_series as s')
    .innerJoin('community.organisations as o', 'o.id', 's.organisation_id')
    .leftJoin('facilities.venues as v', 'v.id', 's.venue_id')
    .select((eb) => [
      's.id',
      's.name',
      's.organisation_id',
      'o.name as organisation_name',
      'o.kind as organisation_kind',
      's.owner_scope',
      's.sport_id',
      's.venue_id',
      'v.name as venue_name',
      's.default_round_minutes',
      's.default_duration_minutes',
      's.schedule_weekday',
      's.schedule_time',
      's.schedule_timezone',
      eb
        .selectFrom('activities.session_occurrences as oc')
        .select((e) => e.fn.max('oc.starts_at').as('m'))
        .whereRef('oc.series_id', '=', 's.id')
        .where('oc.state', 'in', ['live', 'completed'])
        .as('last_started_at'),
      eb
        .selectFrom('activities.session_occurrences as oc')
        .select('oc.id')
        .whereRef('oc.series_id', '=', 's.id')
        .where((w) =>
          w.or([
            w('oc.state', '=', 'live'),
            w.and([w('oc.state', '=', 'open'), w('oc.starts_at', '<=', soon)]),
          ]),
        )
        .orderBy('oc.starts_at', 'desc')
        .limit(1)
        .as('active_occurrence_id'),
      eb
        .selectFrom('facilities.courts as c')
        .select((e) => e.fn.countAll<string>().as('n'))
        .whereRef('c.venue_id', '=', 's.venue_id')
        .where('c.active', '=', true)
        .as('courts'),
      eb
        .selectFrom('activities.session_regulars as rg')
        .select((e) => e.fn.countAll<string>().as('n'))
        .whereRef('rg.series_id', '=', 's.id')
        .as('regulars'),
      eb
        .selectFrom('activities.session_hosts as h')
        .select((e) => e.fn.countAll<string>().as('n'))
        .whereRef('h.series_id', '=', 's.id')
        .as('hosts'),
    ])
    .where((w) => {
      const any = [];
      if (orgIds.length) any.push(w('s.organisation_id', 'in', orgIds));
      if (hosted.length) any.push(w('s.id', 'in', hosted));
      return w.or(any);
    })
    .where('s.archived_at', 'is', null)
    .orderBy('last_started_at', 'desc')
    .orderBy('s.name')
    .limit(20)
    .execute();
  const pending = await pendingNights(
    db,
    rows.map((r) => r.id),
    now,
  );
  return rows.map((r) => {
    const next = nextStartOf(r, now);
    // With a schedule, "upcoming" is the night for the next date; without one, the earliest
    // night that is not tonight.
    const upcoming = next
      ? nightFor(pending.get(r.id), next)
      : (pending.get(r.id)?.find((n) => n.starts_at > soon && n.state !== 'live') ?? null);
    return {
      seriesId: r.id,
      name: r.name,
      organisationId: r.organisation_id,
      organisationName: r.organisation_name,
      organisationKind: r.organisation_kind,
      ownerScope: r.owner_scope,
      sportId: r.sport_id,
      venueId: r.venue_id,
      venueName: r.venue_name,
      courts: Number(r.courts ?? 0),
      defaultRoundMinutes: r.default_round_minutes,
      defaultDurationMinutes: r.default_duration_minutes,
      lastStartedAt: toIsoOrNull((r.last_started_at as Date | null) ?? null),
      activeOccurrenceId: (r.active_occurrence_id as string | null) ?? null,
      upcomingOccurrenceId: upcoming?.id ?? null,
      upcomingStartsAt: upcoming ? toIso(upcoming.starts_at) : null,
      nextAt: next ? toIso(next) : null,
      schedule: scheduleOf(r),
      regulars: Number(r.regulars ?? 0),
      hosts: Number(r.hosts ?? 0),
      asHost: !canOrgAction(actor, r.organisation_id, 'session.manage'),
    };
  });
}

/**
 * Every scheduled session in the caller's clubs, with its next date and whether that night is
 * set up yet. Members see it in "Tonight and upcoming"; organisers and hosts set it up from there.
 */
export async function myScheduledSessions(db: Db, actor: Actor): Promise<ScheduledSession[]> {
  const orgIds = [...actor.memberships.entries()]
    .filter(([, m]) => m.status === 'active')
    .map(([id]) => id);
  if (orgIds.length === 0) return [];
  const now = new Date();
  const rows = await db
    .selectFrom('activities.session_series as s')
    .innerJoin('community.organisations as o', 'o.id', 's.organisation_id')
    .leftJoin('facilities.venues as v', 'v.id', 's.venue_id')
    .select([
      's.id',
      's.name',
      's.organisation_id',
      'o.name as organisation_name',
      'v.name as venue_name',
      's.schedule_weekday',
      's.schedule_time',
      's.schedule_timezone',
      's.default_duration_minutes',
    ])
    .where('s.organisation_id', 'in', orgIds)
    .where('s.archived_at', 'is', null)
    .where('s.schedule_weekday', 'is not', null)
    .orderBy('s.name')
    .limit(50)
    .execute();
  const pending = await pendingNights(
    db,
    rows.map((r) => r.id),
    now,
  );
  return rows.map((r) => {
    const next = nextStartOf(r, now);
    return {
      seriesId: r.id,
      name: r.name,
      organisationId: r.organisation_id,
      organisationName: r.organisation_name,
      venueName: r.venue_name,
      schedule: scheduleOf(r),
      nextAt: next ? toIso(next) : null,
      nextOccurrenceId: nightFor(pending.get(r.id), next)?.id ?? null,
      canRun: canManageSeries(actor, r.organisation_id, r.id),
    };
  });
}
