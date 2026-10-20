import type {
  JoinResult,
  PublicAccess,
  PublicBoard,
  PublicEvent,
  PublicMeetBoard,
  PublicSessionBoard,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction } from '../../platform/authz.js';
import { toIso } from '../../platform/tokens.js';
import { AppError, forbidden, notFound } from '../../problems.js';
import { loadMeet, loadSeason, randomSlug, type DbOrTrx } from '../competitions/common.js';
import { listFixtures } from '../competitions/meets.js';
import { computeMeet } from '../competitions/standings.js';
import type { CommandContext } from '../organisations/service.js';
import {
  bumpOccurrenceVersion,
  loadOccurrence,
  loadSeries,
  ownParticipantId,
  ROUND_COLUMNS,
  toRoundDto,
} from '../sessions/common.js';

/**
 * Public, redacted projections (ADR-016). Everything here is served by the API with service
 * credentials and filtered by hand: nothing reads through RLS as `anon`.
 */

type EventRef =
  | { kind: 'session'; occurrenceId: string; organisationId: string }
  | { kind: 'meet'; meetId: string; organisationId: string };

async function findEvent(db: DbOrTrx, slug: string): Promise<EventRef> {
  const occ = await db
    .selectFrom('activities.session_occurrences')
    .select(['id', 'organisation_id'])
    .where('public_slug', '=', slug)
    .executeTakeFirst();
  if (occ) return { kind: 'session', occurrenceId: occ.id, organisationId: occ.organisation_id };
  const meet = await db
    .selectFrom('competition.meets')
    .select(['id', 'season_id'])
    .where('public_slug', '=', slug)
    .executeTakeFirst();
  if (meet) {
    const season = await loadSeason(db, meet.season_id);
    return { kind: 'meet', meetId: meet.id, organisationId: season.organisation_id };
  }
  throw notFound('No public event with this code');
}

async function orgName(db: DbOrTrx, organisationId: string): Promise<string> {
  const org = await db
    .selectFrom('community.organisations')
    .select('name')
    .where('id', '=', organisationId)
    .executeTakeFirst();
  return org?.name ?? 'Club';
}

async function venueName(db: DbOrTrx, venueId: string | null): Promise<string | null> {
  if (!venueId) return null;
  const v = await db
    .selectFrom('facilities.venues')
    .select('name')
    .where('id', '=', venueId)
    .executeTakeFirst();
  return v?.name ?? null;
}

export async function publicEvent(db: Db, slug: string, actor: Actor | null): Promise<PublicEvent> {
  const ref = await findEvent(db, slug);
  const organisationName = await orgName(db, ref.organisationId);
  const membership = actor?.memberships.get(ref.organisationId);
  const member = !!membership && membership.status === 'active';
  if (ref.kind === 'meet') {
    const meet = await loadMeet(db, ref.meetId);
    return {
      slug,
      kind: 'meet',
      name: meet.name,
      organisationName,
      venueName: await venueName(db, meet.venue_id),
      startsAt: toIso(meet.starts_at),
      state: meet.state,
      viewer: actor ? { member, participantStatus: null, canJoin: false } : null,
    };
  }
  const occ = await loadOccurrence(db, ref.occurrenceId);
  const series = await loadSeries(db, occ.series_id);
  let participantStatus: string | null = null;
  if (actor && member) {
    const pid = await ownParticipantId(db, ref.organisationId, actor.profileId);
    if (pid) {
      const entry = await db
        .selectFrom('activities.session_entries')
        .select('attendance_status')
        .where('occurrence_id', '=', occ.id)
        .where('participant_id', '=', pid)
        .executeTakeFirst();
      participantStatus = entry?.attendance_status ?? null;
    }
  }
  const joinable = occ.state === 'draft' || occ.state === 'open' || occ.state === 'live';
  return {
    slug,
    kind: 'session',
    name: series.name,
    organisationName,
    venueName: await venueName(db, occ.venue_id),
    startsAt: toIso(occ.starts_at),
    state: occ.state,
    viewer: actor
      ? {
          member,
          participantStatus,
          canJoin: member && joinable && participantStatus !== 'checked_in',
        }
      : null,
  };
}

async function sessionBoard(
  db: Db,
  slug: string,
  occurrenceId: string,
  organisationId: string,
): Promise<PublicSessionBoard> {
  const occ = await loadOccurrence(db, occurrenceId);
  const series = await loadSeries(db, occ.series_id);
  const now = new Date();
  const rounds = await db
    .selectFrom('activities.social_rounds')
    .select(ROUND_COLUMNS)
    .where('occurrence_id', '=', occurrenceId)
    .where('status', '!=', 'cancelled')
    .orderBy('sequence_no')
    .execute();
  const active = rounds.find((r) => r.status === 'in_progress' || r.status === 'paused') ?? null;
  const published = rounds.filter((r) => r.status === 'published');
  const currentRow =
    active ?? published[0] ?? rounds.filter((r) => r.status === 'completed').at(-1) ?? null;
  const nextRow = currentRow
    ? (published.find((r) => r.sequence_no > currentRow.sequence_no) ?? null)
    : null;
  const current = currentRow ? await toRoundDto(db, currentRow, now) : null;
  const next = nextRow ? await toRoundDto(db, nextRow, now) : null;
  const courtsOf = (r: NonNullable<typeof current>) =>
    r.assignments.map((a) => ({
      code: a.courtCode,
      sides: a.teams.map((t) => t.map((p) => p.displayName)),
      label: null,
      score: null,
    }));
  const here = await db
    .selectFrom('activities.session_entries')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('occurrence_id', '=', occurrenceId)
    .where('attendance_status', '=', 'checked_in')
    .executeTakeFirst();
  return {
    kind: 'session',
    slug,
    name: series.name,
    organisationName: await orgName(db, organisationId),
    venueName: await venueName(db, occ.venue_id),
    state: occ.state,
    serverTime: toIso(now),
    round: current
      ? { sequenceNo: current.sequenceNo, status: current.status, timer: current.timer }
      : null,
    courts: current ? courtsOf(current) : [],
    resting: current ? current.resting.map((p) => p.displayName) : [],
    next: next
      ? {
          sequenceNo: next.sequenceNo,
          courts: courtsOf(next),
          resting: next.resting.map((p) => p.displayName),
        }
      : null,
    playersHere: Number(here?.n ?? 0),
  };
}

function scoreText(r: {
  result: { games: [number, number][]; forfeitedBy: 'home' | 'away' | null } | null;
}): string | null {
  if (!r.result) return null;
  if (r.result.forfeitedBy) return `forfeit (${r.result.forfeitedBy})`;
  return r.result.games.map((g) => g.join('-')).join(', ');
}

async function meetBoard(
  db: Db,
  slug: string,
  meetId: string,
  organisationId: string,
): Promise<PublicMeetBoard> {
  const meet = await loadMeet(db, meetId);
  const season = await loadSeason(db, meet.season_id);
  const fixtures = await listFixtures(db, meetId);
  const { divisions } = await computeMeet(db, meetId);
  const teamIds = [...new Set(divisions.flatMap((d) => d.rows.map((r) => r.teamId)))];
  const names = new Map(
    teamIds.length
      ? (
          await db
            .selectFrom('competition.teams')
            .select(['id', 'name'])
            .where('id', 'in', teamIds)
            .execute()
        ).map((t) => [t.id, t.name])
      : [],
  );
  const pools = await db
    .selectFrom('facilities.court_pools as p')
    .innerJoin('facilities.court_pool_members as m', 'm.court_pool_id', 'p.id')
    .innerJoin('facilities.courts as c', 'c.id', 'm.court_id')
    .select(['p.division_id', 'c.code'])
    .where('p.meet_id', '=', meetId)
    .orderBy('c.code')
    .execute();
  const nowPlaying: PublicMeetBoard['nowPlaying'] = [];
  const upNext: PublicMeetBoard['upNext'] = [];
  for (const f of fixtures) {
    for (const r of f.rubbers) {
      const sides = [[f.home?.name ?? 'TBC'], [f.away?.name ?? 'TBC']];
      const label = `${f.bracket ? f.bracket.label : (f.divisionName ?? '')} · ${r.label}`;
      if (r.state === 'in_progress' && r.courtCode)
        nowPlaying.push({ code: r.courtCode, sides, label, score: null });
      else if (r.state === 'scheduled' && r.calledAt && r.courtCode)
        nowPlaying.push({ code: r.courtCode, sides, label: `${label} (called)`, score: null });
    }
    if (f.status === 'scheduled' && f.home && f.away && f.rubbers.every((r) => !r.calledAt))
      upNext.push({
        label: f.bracket ? f.bracket.label : `Round ${f.roundNo}`,
        home: f.home.name,
        away: f.away.name,
        division: f.divisionName,
      });
  }
  nowPlaying.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return {
    kind: 'meet',
    slug,
    name: meet.name,
    competitionName: season.competition_name,
    organisationName: await orgName(db, organisationId),
    venueName: await venueName(db, meet.venue_id),
    state: meet.state,
    format: meet.format,
    serverTime: toIso(new Date()),
    nowPlaying,
    upNext: upNext.slice(0, 12),
    divisions: divisions
      .filter((d) => d.rows.length > 0)
      .map((d) => ({
        name: d.divisionName,
        courts: pools.filter((p) => p.division_id === d.divisionId).map((p) => p.code),
        rows: d.rows.map((r) => ({
          rank: r.rank,
          team: names.get(r.teamId) ?? '?',
          played: r.played,
          won: r.fixtureWins,
          drawn: r.fixtureDraws,
          lost: r.fixtureLosses,
          rubbers: `${r.rubbersWon}-${r.rubbersLost}`,
          difference: r.pointsDifference,
          tied: r.tiedWith.length > 0,
        })),
        pendingFixtures: d.pendingFixtures,
      })),
    knockout: fixtures
      .filter((f) => f.stage === 'knockout' && f.bracket)
      .map((f) => ({
        round: f.bracket!.round,
        slot: f.bracket!.slot,
        label: f.bracket!.label,
        home: f.home?.name ?? null,
        away: f.away?.name ?? null,
        status: f.status,
        score: f.outcome
          ? `${f.outcome.rubbersWon.join('-')} rubbers`
          : (f.rubbers.map(scoreText).find((s) => s) ?? null),
        winner: f.winnerTeamId
          ? f.winnerTeamId === f.home?.teamId
            ? f.home.name
            : (f.away?.name ?? null)
          : null,
      })),
  };
}

export async function publicBoard(db: Db, slug: string): Promise<PublicBoard> {
  const ref = await findEvent(db, slug);
  return ref.kind === 'session'
    ? sessionBoard(db, slug, ref.occurrenceId, ref.organisationId)
    : meetBoard(db, slug, ref.meetId, ref.organisationId);
}

/**
 * QR registration for club members: creates the member's participant record if needed and
 * registers or checks them in. Non-members are refused; guests go through the organiser
 * (ADR-008).
 */
export async function joinEvent(
  db: Db,
  actor: Actor,
  slug: string,
  ctx: CommandContext,
): Promise<JoinResult> {
  return db.transaction().execute(async (trx) => {
    const ref = await findEvent(trx, slug);
    if (ref.kind !== 'session')
      throw new AppError(409, 'CONFLICT', 'Only sessions can be joined from a code');
    const membership = actor.memberships.get(ref.organisationId);
    if (!membership || membership.status !== 'active')
      throw forbidden('Join this club first, or ask the organiser to add you as a guest');
    const occ = await loadOccurrence(trx, ref.occurrenceId, true);
    if (!['draft', 'open', 'live'].includes(occ.state))
      throw new AppError(409, 'CONFLICT', `Session is ${occ.state}`);
    let participantId = await ownParticipantId(trx, ref.organisationId, actor.profileId);
    if (!participantId) {
      const created = await trx
        .insertInto('identity.participants')
        .values({
          organisation_id: ref.organisationId,
          user_profile_id: actor.profileId,
          display_name: actor.displayName,
          source: 'registered',
          declared_attributes: '{}',
          created_by_profile_id: actor.profileId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      participantId = created.id;
    }
    const now = new Date();
    const checkIn = occ.state === 'open' || occ.state === 'live';
    const status = checkIn ? 'checked_in' : 'registered';
    await trx
      .insertInto('activities.session_entries')
      .values({
        occurrence_id: occ.id,
        participant_id: participantId,
        attendance_status: status,
        joined_at: now,
        check_in_at: checkIn ? now : null,
        created_by_profile_id: actor.profileId,
      })
      .onConflict((oc) =>
        oc.columns(['occurrence_id', 'participant_id']).doUpdateSet({
          attendance_status: status,
          check_in_at: checkIn ? now : null,
          left_at: null,
          left_reason: null,
        }),
      )
      .execute();
    await bumpOccurrenceVersion(trx, occ.id);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occ.id,
      operation: 'qr_join',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId, status },
    });
    return { participantId, attendanceStatus: status, occurrenceId: occ.id };
  });
}

export async function setOccurrencePublicAccess(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  enabled: boolean,
  ctx: CommandContext,
): Promise<PublicAccess> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertOrgAction(actor, occ.organisation_id, 'session.manage');
    const slug = enabled ? (occ.public_slug ?? randomSlug()) : null;
    await trx
      .updateTable('activities.session_occurrences')
      .set({ public_slug: slug })
      .where('id', '=', occurrenceId)
      .execute();
    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: enabled ? 'public_enable' : 'public_disable',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { enabled },
    });
    return { slug };
  });
}
