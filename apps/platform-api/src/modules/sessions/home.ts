import type { MySession, Preset } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { canOrgAction } from '../../platform/authz.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { ROUND_COLUMNS, timerFor, type DbOrTrx } from './common.js';

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

/** Series the caller can run, across clubs and their personal workspace, newest activity first. */
export async function myPresets(db: Db, actor: Actor): Promise<Preset[]> {
  const orgIds = [...actor.memberships.entries()]
    .filter(([id, m]) => m.status === 'active' && canOrgAction(actor, id, 'session.manage'))
    .map(([id]) => id);
  if (orgIds.length === 0) return [];
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
      eb
        .selectFrom('activities.session_occurrences as oc')
        .select((e) => e.fn.max('oc.starts_at').as('m'))
        .whereRef('oc.series_id', '=', 's.id')
        .as('last_started_at'),
      eb
        .selectFrom('activities.session_occurrences as oc')
        .select('oc.id')
        .whereRef('oc.series_id', '=', 's.id')
        .where('oc.state', 'in', ['open', 'live'])
        .orderBy('oc.starts_at', 'desc')
        .limit(1)
        .as('active_occurrence_id'),
      eb
        .selectFrom('facilities.courts as c')
        .select((e) => e.fn.countAll<string>().as('n'))
        .whereRef('c.venue_id', '=', 's.venue_id')
        .where('c.active', '=', true)
        .as('courts'),
    ])
    .where('s.organisation_id', 'in', orgIds)
    .where('s.archived_at', 'is', null)
    .orderBy('last_started_at', 'desc')
    .orderBy('s.name')
    .limit(20)
    .execute();
  return rows.map((r) => ({
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
  }));
}
