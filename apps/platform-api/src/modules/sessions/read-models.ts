import type { Board, MySchedule, MySession, Round } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { assertOrgMember, canManageSeries, canOrgAction } from '../../platform/authz.js';
import { toIso } from '../../platform/tokens.js';
import type { GuestContext } from '../../plugins/guest.js';
import { AppError, forbidden, notFound } from '../../problems.js';
import {
  loadEntries,
  loadOccurrence,
  loadPairLocks,
  loadSessionCourts,
  ROUND_COLUMNS,
  timerFor,
  toRoundDto,
  type DbOrTrx,
  type OccurrenceRow,
  type RoundRow,
} from './common.js';
import { parseSocialRules } from '../rulesets/service.js';
import { withLive } from './home.js';

async function currentAndNext(
  db: DbOrTrx,
  occurrenceId: string,
  now: Date,
): Promise<{ current: Round | null; next: Round | null; completed: number }> {
  const rows = await db
    .selectFrom('activities.social_rounds')
    .select(ROUND_COLUMNS)
    .where('occurrence_id', '=', occurrenceId)
    .where('status', '!=', 'cancelled')
    .orderBy('sequence_no')
    .execute();
  const completed = rows.filter((r) => r.status === 'completed').length;
  const active = rows.find((r) => r.status === 'in_progress' || r.status === 'paused') ?? null;
  const published = rows.filter((r) => r.status === 'published');
  let currentRow: RoundRow | null = active;
  let nextRow: RoundRow | null = null;
  if (currentRow) nextRow = published.find((r) => r.sequence_no > currentRow!.sequence_no) ?? null;
  else currentRow = published[0] ?? rows.filter((r) => r.status === 'completed').at(-1) ?? null;
  return {
    current: currentRow ? await toRoundDto(db, currentRow, now) : null,
    next: nextRow ? await toRoundDto(db, nextRow, now) : null,
    completed,
  };
}

async function occurrenceHeader(db: DbOrTrx, occ: OccurrenceRow) {
  const [series, venue] = await Promise.all([
    db
      .selectFrom('activities.session_series')
      .select(['name', 'check_in_window_minutes'])
      .where('id', '=', occ.series_id)
      .executeTakeFirstOrThrow(),
    occ.venue_id
      ? db
          .selectFrom('facilities.venues')
          .select('name')
          .where('id', '=', occ.venue_id)
          .executeTakeFirst()
      : Promise.resolve(undefined),
  ]);
  return {
    name: series.name,
    venueName: venue?.name ?? null,
    checkInOpensAt: toIso(
      new Date(occ.starts_at.getTime() - series.check_in_window_minutes * 60_000),
    ),
  };
}

export async function board(db: Db, actor: Actor, occurrenceId: string): Promise<Board> {
  const occ = await loadOccurrence(db, occurrenceId);
  assertOrgMember(actor, occ.organisation_id);
  const now = new Date();
  const [header, courts, entries, pairLocks, rounds] = await Promise.all([
    occurrenceHeader(db, occ),
    loadSessionCourts(db, occurrenceId),
    loadEntries(db, occurrenceId),
    loadPairLocks(db, occurrenceId),
    currentAndNext(db, occurrenceId, now),
  ]);
  return {
    serverTime: toIso(now),
    occurrence: {
      id: occ.id,
      organisationId: occ.organisation_id,
      name: header.name,
      state: occ.state,
      version: occ.version,
      roundDurationSeconds: occ.round_duration_seconds,
      publicSlug: occ.public_slug,
      startsAt: toIso(occ.starts_at),
      venueName: header.venueName,
      checkInOpensAt: header.checkInOpensAt,
      mode: parseSocialRules(occ.rules_json).rotation.mode,
      format: parseSocialRules(occ.rules_json).rotation.format,
    },
    canManage: canManageSeries(actor, occ.organisation_id, occ.series_id),
    courts,
    entries,
    pairLocks,
    currentRound: rounds.current,
    nextRound: rounds.next,
    completedRounds: rounds.completed,
  };
}

function gameFor(round: Round, participantId: string): MySchedule['current'] {
  for (const a of round.assignments) {
    for (const [i, team] of a.teams.entries()) {
      if (team.some((p) => p.participantId === participantId)) {
        const other = a.teams[1 - i] ?? [];
        return {
          sequenceNo: round.sequenceNo,
          status: round.status,
          resting: false,
          courtCode: a.courtCode,
          partners: team.filter((p) => p.participantId !== participantId),
          opponents: other,
          timer: round.timer,
        };
      }
    }
  }
  if (round.resting.some((p) => p.participantId === participantId)) {
    return {
      sequenceNo: round.sequenceNo,
      status: round.status,
      resting: true,
      courtCode: null,
      partners: [],
      opponents: [],
      timer: round.timer,
    };
  }
  return null;
}

async function scheduleFor(
  db: DbOrTrx,
  occ: OccurrenceRow,
  participantId: string,
): Promise<MySchedule> {
  const now = new Date();
  const [header, participant, entry, rounds] = await Promise.all([
    occurrenceHeader(db, occ),
    db
      .selectFrom('identity.participants')
      .select(['id', 'display_name'])
      .where('id', '=', participantId)
      .executeTakeFirst(),
    db
      .selectFrom('activities.session_entries')
      .select('attendance_status')
      .where('occurrence_id', '=', occ.id)
      .where('participant_id', '=', participantId)
      .executeTakeFirst(),
    currentAndNext(db, occ.id, now),
  ]);
  if (!participant) throw notFound('Participant not found');
  return {
    serverTime: toIso(now),
    occurrence: {
      id: occ.id,
      name: header.name,
      state: occ.state,
      startsAt: toIso(occ.starts_at),
      checkInOpensAt: header.checkInOpensAt,
    },
    participant: { participantId: participant.id, displayName: participant.display_name },
    attendanceStatus: entry?.attendance_status ?? null,
    current: rounds.current ? gameFor(rounds.current, participantId) : null,
    next: rounds.next ? gameFor(rounds.next, participantId) : null,
  };
}

export async function mySchedule(db: Db, actor: Actor, occurrenceId: string): Promise<MySchedule> {
  const occ = await loadOccurrence(db, occurrenceId);
  if (!canOrgAction(actor, occ.organisation_id, 'session.view'))
    throw forbidden('Not a member of this organisation');
  const mine = await db
    .selectFrom('identity.participants')
    .select('id')
    .where('organisation_id', '=', occ.organisation_id)
    .where('user_profile_id', '=', actor.profileId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!mine) throw new AppError(404, 'NOT_FOUND', 'You have no player record in this club yet');
  return scheduleFor(db, occ, mine.id);
}

/** Guest credential scoped to one occurrence (ADR-008): only that occurrence, only their own view. */
export async function guestSchedule(db: Db, guest: GuestContext): Promise<MySchedule> {
  const grant = await db
    .selectFrom('identity.guest_grants')
    .select('session_occurrence_id')
    .where('id', '=', guest.grantId)
    .executeTakeFirstOrThrow();
  if (!grant.session_occurrence_id)
    throw new AppError(404, 'NOT_FOUND', 'This guest link is not tied to a session');
  const occ = await loadOccurrence(db, grant.session_occurrence_id);
  if (occ.organisation_id !== guest.organisationId)
    throw forbidden('Guest link does not match this session');
  return scheduleFor(db, occ, guest.participantId);
}

/** Upcoming and recent sessions across every club the actor belongs to. */
export async function mySessions(db: Db, actor: Actor): Promise<MySession[]> {
  const orgIds = [...actor.memberships.entries()]
    .filter(([, m]) => m.status === 'active')
    .map(([id]) => id);
  if (orgIds.length === 0) return [];
  const since = new Date(Date.now() - 12 * 3600 * 1000);
  const rows = await db
    .selectFrom('activities.session_occurrences as o')
    .innerJoin('activities.session_series as s', 's.id', 'o.series_id')
    .innerJoin('community.organisations as org', 'org.id', 'o.organisation_id')
    .leftJoin('facilities.venues as v', 'v.id', 'o.venue_id')
    .leftJoin('identity.participants as p', (join) =>
      join
        .onRef('p.organisation_id', '=', 'o.organisation_id')
        .on('p.user_profile_id', '=', actor.profileId),
    )
    .leftJoin('activities.session_entries as e', (join) =>
      join.onRef('e.occurrence_id', '=', 'o.id').onRef('e.participant_id', '=', 'p.id'),
    )
    .select([
      'o.id',
      'o.series_id',
      's.name as series_name',
      'o.organisation_id',
      'org.name as organisation_name',
      'v.name as venue_name',
      'o.starts_at',
      'o.ends_at',
      'o.state',
      'e.attendance_status',
    ])
    .where('o.organisation_id', 'in', orgIds)
    .where('o.state', '!=', 'cancelled')
    .where('o.ends_at', '>=', since)
    .orderBy('o.starts_at')
    .limit(50)
    .execute();
  return withLive(
    db,
    rows.map((r) => ({
      occurrenceId: r.id,
      seriesName: r.series_name,
      organisationId: r.organisation_id,
      organisationName: r.organisation_name,
      venueName: r.venue_name,
      startsAt: toIso(r.starts_at),
      endsAt: toIso(r.ends_at),
      state: r.state,
      myAttendance: r.attendance_status ?? null,
      canManage: canManageSeries(actor, r.organisation_id, r.series_id),
      live: null,
    })),
  );
}

export { timerFor };
