import {
  evaluateFixture,
  evaluateRubber,
  forfeitRubber,
  type RubberResult,
} from '@buddyclub/scoring-engine';
import type {
  Dispute,
  Fixture,
  LineupBody,
  ResolveDisputeBody,
  SubmitResultBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgMember, canOrgAction } from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, forbidden, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { loadMeet, loadSeason, meetOrganisation, meetRules, type DbOrTrx } from './common.js';
import { listFixtures, resolveKnockout } from './meets.js';
import { refreshStandings } from './standings.js';
import { isCaptainOf } from './teams.js';

interface FixtureCtx {
  fixture: {
    id: string;
    meet_id: string;
    division_id: string | null;
    stage: 'pool' | 'knockout';
    home_team_id: string | null;
    away_team_id: string | null;
    status: Fixture['status'];
    version: number;
  };
  meetId: string;
  organisationId: string;
}

async function fixtureContext(
  db: DbOrTrx,
  fixtureId: string,
  forUpdate = false,
): Promise<FixtureCtx> {
  let q = db
    .selectFrom('competition.fixtures')
    .select([
      'id',
      'meet_id',
      'division_id',
      'stage',
      'home_team_id',
      'away_team_id',
      'status',
      'version',
    ])
    .where('id', '=', fixtureId);
  if (forUpdate) q = q.forUpdate();
  const fixture = await q.executeTakeFirst();
  if (!fixture) throw notFound('Fixture not found');
  const meet = await loadMeet(db, fixture.meet_id);
  const season = await loadSeason(db, meet.season_id);
  return { fixture, meetId: meet.id, organisationId: season.organisation_id };
}

async function fixtureDto(db: DbOrTrx, fixtureId: string, meetId: string): Promise<Fixture> {
  const f = (await listFixtures(db, meetId)).find((x) => x.id === fixtureId);
  if (!f) throw notFound('Fixture not found');
  return f;
}

async function teamRow(db: DbOrTrx, teamId: string) {
  const t = await db
    .selectFrom('competition.teams')
    .select(['id', 'organisation_id', 'captain_participant_id'])
    .where('id', '=', teamId)
    .executeTakeFirst();
  if (!t) throw notFound('Team not found');
  return t;
}

function assertTeamsKnown(fixture: FixtureCtx['fixture']): { home: string; away: string } {
  if (!fixture.home_team_id || !fixture.away_team_id)
    throw new AppError(409, 'CONFLICT', 'This knockout tie is waiting for its teams');
  return { home: fixture.home_team_id, away: fixture.away_team_id };
}

/** Director/admin, or the captain of this team. */
async function assertLineupRights(
  db: DbOrTrx,
  actor: Actor,
  organisationId: string,
  teamId: string,
): Promise<void> {
  if (canOrgAction(actor, organisationId, 'competition.manage')) return;
  const team = await teamRow(db, teamId);
  if (
    canOrgAction(actor, organisationId, 'team.lineup.submit') &&
    (await isCaptainOf(db, actor, team))
  )
    return;
  throw forbidden('Only the team captain or a competition director can submit this lineup');
}

/** Captains submit lineups per rubber before the rubber is called. */
export async function submitLineup(
  db: Db,
  actor: Actor,
  fixtureId: string,
  teamId: string,
  body: LineupBody,
  ctx: CommandContext,
): Promise<Fixture> {
  return db.transaction().execute(async (trx) => {
    const { fixture, meetId, organisationId } = await fixtureContext(trx, fixtureId, true);
    assertOrgMember(actor, organisationId);
    await assertLineupRights(trx, actor, organisationId, teamId);
    const teams = assertTeamsKnown(fixture);
    if (teamId !== teams.home && teamId !== teams.away)
      throw notFound('Team is not in this fixture');
    const sideNo = teamId === teams.home ? 1 : 2;

    const roster = new Set(
      (
        await trx
          .selectFrom('competition.team_roster')
          .select('participant_id')
          .where('team_id', '=', teamId)
          .where('valid_to', 'is', null)
          .execute()
      ).map((r) => r.participant_id),
    );
    const matches = await trx
      .selectFrom('matches.matches as m')
      .innerJoin('matches.match_sides as s', (join) =>
        join.onRef('s.match_id', '=', 'm.id').on('s.side_no', '=', sideNo),
      )
      .select(['m.id', 'm.rubber_key', 'm.format', 'm.state', 's.id as side_id'])
      .where('m.fixture_id', '=', fixtureId)
      .execute();
    for (const [rubberKey, players] of Object.entries(body.rubbers)) {
      const match = matches.find((m) => m.rubber_key === rubberKey);
      if (!match)
        throw new AppError(400, 'VALIDATION_FAILED', `Unknown rubber ${rubberKey}`, undefined, [
          { path: `body/rubbers/${rubberKey}`, message: 'not a rubber of this fixture' },
        ]);
      if (match.state !== 'scheduled')
        throw new AppError(409, 'CONFLICT', `Rubber ${rubberKey} has already started`);
      const needed = match.format === 'doubles' ? 2 : 1;
      if (players.length !== needed)
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          `Rubber ${rubberKey} needs ${needed} player(s)`,
          undefined,
          [{ path: `body/rubbers/${rubberKey}`, message: `${needed} required` }],
        );
      for (const p of players) {
        if (!roster.has(p))
          throw new AppError(
            400,
            'VALIDATION_FAILED',
            'Player is not on the team roster',
            undefined,
            [{ path: `body/rubbers/${rubberKey}`, message: `${p} not on roster` }],
          );
      }
      await trx
        .deleteFrom('matches.match_side_players')
        .where('match_side_id', '=', match.side_id)
        .execute();
      await trx
        .insertInto('matches.match_side_players')
        .values(players.map((participant_id) => ({ match_side_id: match.side_id, participant_id })))
        .execute();
    }
    await trx
      .updateTable('competition.fixtures')
      .set({ version: fixture.version + 1 })
      .where('id', '=', fixtureId)
      .execute();
    await recordAudit(trx, {
      entityType: 'fixture',
      entityId: fixtureId,
      operation: 'lineup',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { teamId, rubbers: body.rubbers },
    });
    return fixtureDto(trx, fixtureId, meetId);
  });
}

interface MatchRow {
  id: string;
  fixture_id: string | null;
  state: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeited';
  court_id: string | null;
  format: 'singles' | 'doubles';
}

async function loadMatch(
  db: DbOrTrx,
  matchId: string,
): Promise<MatchRow & { fixtureCtx: FixtureCtx }> {
  const m = await db
    .selectFrom('matches.matches')
    .select(['id', 'fixture_id', 'state', 'court_id', 'format'])
    .where('id', '=', matchId)
    .forUpdate()
    .executeTakeFirst();
  if (!m || !m.fixture_id) throw notFound('Rubber not found');
  return { ...m, fixtureCtx: await fixtureContext(db, m.fixture_id, true) };
}

/**
 * Calls a rubber to a court. The court must be in the division's pool (any pool of the meet for
 * knockout ties) or an audited override, free, and none of the players may be in another rubber
 * in progress (spec section 9.4). All checks run inside the transaction that holds the match row
 * lock, so two organisers calling the same court at once get exactly one success.
 */
export async function callToCourt(
  db: Db,
  actor: Actor,
  matchId: string,
  courtId: string,
  overrideReason: string | undefined,
  ctx: CommandContext,
): Promise<Fixture> {
  return db.transaction().execute(async (trx) => {
    const match = await loadMatch(trx, matchId);
    const { fixture, meetId, organisationId } = match.fixtureCtx;
    if (!canOrgAction(actor, organisationId, 'match.operate'))
      throw forbidden('Court operations need an organiser role');
    if (match.state !== 'scheduled')
      throw new AppError(409, 'CONFLICT', `Rubber is ${match.state}`);
    assertTeamsKnown(fixture);

    let poolQuery = trx
      .selectFrom('facilities.court_pools as p')
      .innerJoin('facilities.court_pool_members as m', 'm.court_pool_id', 'p.id')
      .select('m.court_id')
      .where('p.meet_id', '=', meetId);
    if (fixture.division_id) poolQuery = poolQuery.where('p.division_id', '=', fixture.division_id);
    const pool = await poolQuery.execute();
    const inPool = pool.some((p) => p.court_id === courtId);
    if (!inPool && !overrideReason) {
      throw new AppError(
        409,
        'COURT_CONFLICT',
        fixture.division_id
          ? "Court is not in this division's pool"
          : 'Court is not dedicated to this meet',
        'Pick a dedicated court or give an override reason',
      );
    }

    // Serialise on the court row and on the players' rows so two organisers calling at the same
    // moment cannot both pass the occupancy checks (multi-organiser safety, spec section 10).
    const court = await trx
      .selectFrom('facilities.courts')
      .select('id')
      .where('id', '=', courtId)
      .forUpdate()
      .executeTakeFirst();
    if (!court) throw notFound('Court not found');
    const sideIds = (
      await trx
        .selectFrom('matches.match_sides as s')
        .innerJoin('matches.match_side_players as sp', 'sp.match_side_id', 's.id')
        .select('sp.participant_id')
        .where('s.match_id', '=', matchId)
        .orderBy('sp.participant_id')
        .execute()
    ).map((p) => p.participant_id);
    if (sideIds.length)
      await trx
        .selectFrom('identity.participants')
        .select('id')
        .where('id', 'in', sideIds)
        .orderBy('id')
        .forUpdate()
        .execute();
    const busy = await trx
      .selectFrom('matches.matches')
      .select('id')
      .where('court_id', '=', courtId)
      .where('state', 'in', ['in_progress'])
      .forUpdate()
      .executeTakeFirst();
    const called = await trx
      .selectFrom('matches.matches')
      .select('id')
      .where('court_id', '=', courtId)
      .where('state', '=', 'scheduled')
      .where('called_at', 'is not', null)
      .where('id', '!=', matchId)
      .forUpdate()
      .executeTakeFirst();
    if (busy || called)
      throw new AppError(409, 'COURT_CONFLICT', 'Court is occupied or already called');

    const players = await trx
      .selectFrom('matches.match_sides as s')
      .innerJoin('matches.match_side_players as sp', 'sp.match_side_id', 's.id')
      .select(['s.side_no', 'sp.participant_id'])
      .where('s.match_id', '=', matchId)
      .execute();
    const needed = match.format === 'doubles' ? 2 : 1;
    for (const side of [1, 2]) {
      if (players.filter((p) => p.side_no === side).length !== needed)
        throw new AppError(
          409,
          'CONFLICT',
          'Both lineups must be submitted before calling the rubber',
        );
    }
    const ids = players.map((p) => p.participant_id);
    const clash = await trx
      .selectFrom('matches.match_side_players as sp')
      .innerJoin('matches.match_sides as s', 's.id', 'sp.match_side_id')
      .innerJoin('matches.matches as m', 'm.id', 's.match_id')
      .select(['sp.participant_id'])
      .where('sp.participant_id', 'in', ids)
      .where('m.id', '!=', matchId)
      .where((eb) =>
        eb.or([
          eb('m.state', '=', 'in_progress'),
          eb.and([eb('m.state', '=', 'scheduled'), eb('m.called_at', 'is not', null)]),
        ]),
      )
      .executeTakeFirst();
    if (clash)
      throw new AppError(
        409,
        'PLAYER_CONFLICT',
        'A player is already on court or called elsewhere',
        clash.participant_id,
      );

    await trx
      .updateTable('matches.matches')
      .set({
        court_id: courtId,
        called_at: new Date(),
        court_override_reason: inPool ? null : (overrideReason ?? null),
      })
      .where('id', '=', matchId)
      .execute();
    await recordAudit(trx, {
      entityType: 'match',
      entityId: matchId,
      operation: inPool ? 'court_call' : 'court_call_override',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      ...(overrideReason ? { reason: overrideReason } : {}),
      after: { courtId, inPool },
    });
    await emitEvent(trx, {
      eventType: 'match.court_assigned',
      aggregateType: 'match',
      aggregateId: matchId,
      payload: { matchId, courtId, fixtureId: fixture.id },
      dedupeKey: `court_assigned:${matchId}:${courtId}`,
    });
    return fixtureDto(trx, fixture.id, meetId);
  });
}

export async function startMatch(
  db: Db,
  actor: Actor,
  matchId: string,
  ctx: CommandContext,
): Promise<Fixture> {
  return db.transaction().execute(async (trx) => {
    const match = await loadMatch(trx, matchId);
    const { fixture, meetId, organisationId } = match.fixtureCtx;
    if (!canOrgAction(actor, organisationId, 'match.operate'))
      throw forbidden('Court operations need an organiser role');
    if (match.state !== 'scheduled')
      throw new AppError(409, 'CONFLICT', `Rubber is ${match.state}`);
    if (!match.court_id) throw new AppError(409, 'CONFLICT', 'Call the rubber to a court first');
    await trx
      .updateTable('matches.matches')
      .set({ state: 'in_progress', starts_at: new Date() })
      .where('id', '=', matchId)
      .execute();
    await trx
      .updateTable('competition.fixtures')
      .set({ status: 'in_progress' })
      .where('id', '=', fixture.id)
      .where('status', '=', 'scheduled')
      .execute();
    await trx
      .updateTable('competition.meets')
      .set({ state: 'live' })
      .where('id', '=', meetId)
      .where('state', '=', 'published')
      .execute();
    await recordAudit(trx, {
      entityType: 'match',
      entityId: matchId,
      operation: 'start',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
    });
    return fixtureDto(trx, fixture.id, meetId);
  });
}

async function latestRevision(db: DbOrTrx, matchId: string) {
  return db
    .selectFrom('matches.result_revisions')
    .select(['revision', 'result_status', 'score_json'])
    .where('match_id', '=', matchId)
    .orderBy('revision', 'desc')
    .executeTakeFirst();
}

function isDirector(actor: Actor, organisationId: string): boolean {
  return (
    canOrgAction(actor, organisationId, 'competition.manage') ||
    canOrgAction(actor, organisationId, 'match.operate')
  );
}

/**
 * Submits a score revision. Directors' submissions are confirmed immediately; captains' wait for
 * the opposing captain or a director (score confirmation workflow, spec section 2 open decision).
 */
export async function submitResult(
  db: Db,
  actor: Actor,
  matchId: string,
  body: SubmitResultBody,
  ctx: CommandContext,
): Promise<Fixture> {
  return db.transaction().execute(async (trx) => {
    const match = await loadMatch(trx, matchId);
    const { fixture, meetId, organisationId } = match.fixtureCtx;
    const teams = assertTeamsKnown(fixture);
    const director = isDirector(actor, organisationId);
    let captainOf: 'home' | 'away' | null = null;
    if (!director) {
      if (!canOrgAction(actor, organisationId, 'result.submit'))
        throw forbidden('You cannot submit results');
      if (await isCaptainOf(trx, actor, await teamRow(trx, teams.home))) captainOf = 'home';
      else if (await isCaptainOf(trx, actor, await teamRow(trx, teams.away))) captainOf = 'away';
      else
        throw forbidden('Only a captain of one of the teams or a director can submit this result');
    }
    if (match.state === 'cancelled') throw new AppError(409, 'CONFLICT', 'Rubber is cancelled');
    const previous = await latestRevision(trx, matchId);
    if (
      previous &&
      (previous.result_status === 'confirmed' || previous.result_status === 'submitted')
    )
      throw new AppError(
        409,
        'CONFLICT',
        `A score is already ${previous.result_status}`,
        'Dispute it, or have a director void it, before entering another',
      );

    const meet = await loadMeet(trx, meetId);
    const { rules, version } = await meetRules(trx, meet);
    let evaluation: RubberResult | null;
    if (body.forfeitedBy) {
      evaluation = forfeitRubber(body.forfeitedBy === 'home' ? 2 : 1, rules.scoring);
    } else {
      evaluation = evaluateRubber(body.games, rules.scoring);
      if (evaluation.status === 'invalid' || evaluation.status === 'incomplete') {
        throw new AppError(
          400,
          'INVALID_SCORE',
          'Score does not satisfy the rules',
          evaluation.reason,
        );
      }
    }

    const revision = (previous?.revision ?? 0) + 1;
    const status = director ? 'confirmed' : 'submitted';
    await trx
      .insertInto('matches.result_revisions')
      .values({
        match_id: matchId,
        revision,
        submitted_by_profile_id: actor.profileId,
        confirmed_by_profile_id: director ? actor.profileId : null,
        confirmed_at: director ? new Date() : null,
        score_json: JSON.stringify({
          games: body.games,
          forfeitedBy: body.forfeitedBy ?? null,
          evaluation,
          rulesVersion: version,
          submittedAs: director ? 'director' : captainOf,
        }),
        result_status: status,
        reason: body.reason ?? null,
      })
      .execute();
    await trx
      .updateTable('matches.matches')
      .set({ state: body.forfeitedBy ? 'forfeited' : 'completed', completed_at: new Date() })
      .where('id', '=', matchId)
      .execute();
    await recordAudit(trx, {
      entityType: 'match',
      entityId: matchId,
      operation: 'result_submit',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      rulesetVersion: version,
      ...(body.reason ? { reason: body.reason } : {}),
      after: { revision, status, games: body.games, forfeitedBy: body.forfeitedBy ?? null },
    });
    if (status === 'confirmed') await afterConfirmation(trx, matchId, fixture.id, meetId, ctx);
    return fixtureDto(trx, fixture.id, meetId);
  });
}

/**
 * Confirms a submitted score (opposing captain or director) or disputes a submitted or confirmed
 * one (either captain or director). A dispute takes the result out of the standings until a
 * director resolves it.
 */
export async function confirmResult(
  db: Db,
  actor: Actor,
  matchId: string,
  revision: number,
  action: 'confirm' | 'dispute',
  reason: string | undefined,
  ctx: CommandContext,
): Promise<Fixture> {
  return db.transaction().execute(async (trx) => {
    const match = await loadMatch(trx, matchId);
    const { fixture, meetId, organisationId } = match.fixtureCtx;
    const teams = assertTeamsKnown(fixture);
    const director = isDirector(actor, organisationId);
    const rev = await trx
      .selectFrom('matches.result_revisions')
      .select(['revision', 'result_status', 'submitted_by_profile_id', 'score_json'])
      .where('match_id', '=', matchId)
      .where('revision', '=', revision)
      .executeTakeFirst();
    if (!rev) throw notFound('Result revision not found');
    const allowedFrom = action === 'confirm' ? ['submitted'] : ['submitted', 'confirmed'];
    if (!allowedFrom.includes(rev.result_status))
      throw new AppError(409, 'CONFLICT', `Revision is already ${rev.result_status}`);
    if (!director) {
      if (!canOrgAction(actor, organisationId, 'result.confirm'))
        throw forbidden('You cannot confirm or dispute results');
      const submittedAs = (rev.score_json as { submittedAs?: string }).submittedAs;
      const homeCaptain = await isCaptainOf(trx, actor, await teamRow(trx, teams.home));
      const awayCaptain = await isCaptainOf(trx, actor, await teamRow(trx, teams.away));
      if (action === 'confirm') {
        const opposingOk =
          (submittedAs === 'home' && awayCaptain) || (submittedAs === 'away' && homeCaptain);
        if (!opposingOk)
          throw forbidden('Only the opposing captain or a director can confirm this result');
      } else if (!homeCaptain && !awayCaptain) {
        throw forbidden('Only a captain of one of the teams or a director can dispute this result');
      }
    }
    if (action === 'dispute' && !reason)
      throw new AppError(400, 'VALIDATION_FAILED', 'A dispute needs a reason', undefined, [
        { path: 'body/reason', message: 'required' },
      ]);
    await trx
      .updateTable('matches.result_revisions')
      .set(
        action === 'confirm'
          ? {
              result_status: 'confirmed',
              confirmed_by_profile_id: actor.profileId,
              confirmed_at: new Date(),
            }
          : { result_status: 'disputed', reason: reason ?? null },
      )
      .where('match_id', '=', matchId)
      .where('revision', '=', revision)
      .execute();
    await recordAudit(trx, {
      entityType: 'match',
      entityId: matchId,
      operation: action === 'confirm' ? 'result_confirm' : 'result_dispute',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      ...(reason ? { reason } : {}),
      after: { revision, from: rev.result_status },
    });
    if (action === 'confirm') await afterConfirmation(trx, matchId, fixture.id, meetId, ctx);
    else {
      await trx
        .updateTable('competition.fixtures')
        .set({ status: 'needs_review' })
        .where('id', '=', fixture.id)
        .execute();
      await emitEvent(trx, {
        eventType: 'match.result_disputed',
        aggregateType: 'match',
        aggregateId: matchId,
        payload: { matchId, fixtureId: fixture.id, revision },
        dedupeKey: `result_disputed:${matchId}:${revision}`,
      });
      await refreshStandings(trx, meetId, ctx.correlationId);
    }
    return fixtureDto(trx, fixture.id, meetId);
  });
}

/** Director resolution of a dispute: uphold the score, or void it and reopen the rubber. */
export async function resolveDispute(
  db: Db,
  actor: Actor,
  matchId: string,
  revision: number,
  body: ResolveDisputeBody,
  ctx: CommandContext,
): Promise<Fixture> {
  return db.transaction().execute(async (trx) => {
    const match = await loadMatch(trx, matchId);
    const { fixture, meetId, organisationId } = match.fixtureCtx;
    if (!canOrgAction(actor, organisationId, 'competition.manage'))
      throw forbidden('Only a competition director can resolve disputes');
    const rev = await trx
      .selectFrom('matches.result_revisions')
      .select(['revision', 'result_status'])
      .where('match_id', '=', matchId)
      .where('revision', '=', revision)
      .executeTakeFirst();
    if (!rev) throw notFound('Result revision not found');
    if (rev.result_status !== 'disputed')
      throw new AppError(409, 'CONFLICT', `Revision is ${rev.result_status}, not disputed`);
    const now = new Date();
    if (body.decision === 'uphold') {
      await trx
        .updateTable('matches.result_revisions')
        .set({
          result_status: 'confirmed',
          confirmed_by_profile_id: actor.profileId,
          confirmed_at: now,
          resolved_by_profile_id: actor.profileId,
          resolved_at: now,
          resolution: 'upheld',
        })
        .where('match_id', '=', matchId)
        .where('revision', '=', revision)
        .execute();
    } else {
      await trx
        .updateTable('matches.result_revisions')
        .set({
          result_status: 'void',
          resolved_by_profile_id: actor.profileId,
          resolved_at: now,
          resolution: 'voided',
        })
        .where('match_id', '=', matchId)
        .where('revision', '=', revision)
        .execute();
      // Reopen the rubber: it stays on its court (if still assigned) so a new score can be entered.
      await trx
        .updateTable('matches.matches')
        .set({ state: 'in_progress', completed_at: null })
        .where('id', '=', matchId)
        .execute();
    }
    await recordAudit(trx, {
      entityType: 'match',
      entityId: matchId,
      operation: body.decision === 'uphold' ? 'dispute_uphold' : 'dispute_void',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      reason: body.reason,
      after: { revision, decision: body.decision },
    });
    await emitEvent(trx, {
      eventType: 'match.dispute_resolved',
      aggregateType: 'match',
      aggregateId: matchId,
      payload: { matchId, fixtureId: fixture.id, revision, decision: body.decision },
      dedupeKey: `dispute_resolved:${matchId}:${revision}`,
    });
    await reevaluateFixture(trx, fixture.id, meetId, ctx);
    return fixtureDto(trx, fixture.id, meetId);
  });
}

export async function listDisputes(db: Db, actor: Actor, meetId: string): Promise<Dispute[]> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('matches.result_revisions as r')
    .innerJoin('matches.matches as m', 'm.id', 'r.match_id')
    .innerJoin('competition.fixtures as f', 'f.id', 'm.fixture_id')
    .leftJoin('competition.divisions as d', 'd.id', 'f.division_id')
    .leftJoin('competition.teams as h', 'h.id', 'f.home_team_id')
    .leftJoin('competition.teams as a', 'a.id', 'f.away_team_id')
    .select([
      'r.match_id',
      'r.revision',
      'r.score_json',
      'r.reason',
      'r.created_at',
      'f.id as fixture_id',
      'd.name as division_name',
      'm.rubber_label',
      'm.rubber_key',
      'h.name as home_name',
      'a.name as away_name',
    ])
    .where('f.meet_id', '=', meetId)
    .where('r.result_status', '=', 'disputed')
    .orderBy('r.created_at')
    .execute();
  return rows.map((r) => {
    const score = r.score_json as {
      games?: [number, number][];
      forfeitedBy?: 'home' | 'away' | null;
      submittedAs?: string | null;
    };
    return {
      matchId: r.match_id,
      fixtureId: r.fixture_id,
      divisionName: r.division_name ?? null,
      rubberLabel: r.rubber_label ?? r.rubber_key ?? '',
      home: r.home_name ?? 'TBC',
      away: r.away_name ?? 'TBC',
      revision: r.revision,
      games: score.games ?? [],
      forfeitedBy: score.forfeitedBy ?? null,
      submittedAs: score.submittedAs ?? null,
      reason: r.reason,
      submittedAt: toIso(r.created_at),
      disputedAt: toIsoOrNull(null),
    };
  });
}

/** Emits the confirmation event, then re-evaluates the fixture and whatever depends on it. */
async function afterConfirmation(
  trx: DbOrTrx,
  matchId: string,
  fixtureId: string,
  meetId: string,
  ctx: CommandContext,
): Promise<void> {
  await emitEvent(trx, {
    eventType: 'match.result_confirmed',
    aggregateType: 'match',
    aggregateId: matchId,
    payload: { matchId, fixtureId },
    dedupeKey: `result_confirmed:${matchId}:${Date.now()}`,
  });
  await reevaluateFixture(trx, fixtureId, meetId, ctx);
}

/**
 * Re-evaluates a fixture from its confirmed rubbers, records the winner for knockout ties,
 * refreshes the pool standings and lets the bracket fill itself.
 */
export async function reevaluateFixture(
  trx: DbOrTrx,
  fixtureId: string,
  meetId: string,
  ctx: CommandContext,
): Promise<void> {
  const meet = await loadMeet(trx, meetId);
  const { rules, version } = await meetRules(trx, meet);
  const matches = await trx
    .selectFrom('matches.matches')
    .select(['id', 'state'])
    .where('fixture_id', '=', fixtureId)
    .execute();
  const rubbers: Array<RubberResult | null> = [];
  let allDecided = true;
  let anyConfirmed = false;
  for (const m of matches) {
    const rev = await trx
      .selectFrom('matches.result_revisions')
      .select(['result_status', 'score_json'])
      .where('match_id', '=', m.id)
      .where('result_status', '=', 'confirmed')
      .orderBy('revision', 'desc')
      .executeTakeFirst();
    if (!rev) {
      allDecided = false;
      continue;
    }
    anyConfirmed = true;
    const evaluation = (rev.score_json as { evaluation?: RubberResult | null }).evaluation ?? null;
    rubbers.push(evaluation);
  }
  const fixture = await trx
    .selectFrom('competition.fixtures')
    .select(['status', 'version', 'stage', 'home_team_id', 'away_team_id'])
    .where('id', '=', fixtureId)
    .executeTakeFirstOrThrow();
  if (!allDecided) {
    const wasDecided = fixture.status === 'completed' || fixture.status === 'needs_review';
    const status = anyConfirmed || fixture.status !== 'scheduled' ? 'in_progress' : 'scheduled';
    await trx
      .updateTable('competition.fixtures')
      .set({ status, outcome_json: null, winner_team_id: null })
      .where('id', '=', fixtureId)
      .execute();
    if (wasDecided) await refreshStandings(trx, meetId, ctx.correlationId);
    return;
  }
  const evaluation = evaluateFixture(rubbers, rules.fixtureOutcome, {
    expectedRubbers: rubbers.length,
  });
  const status =
    evaluation.outcome === 'needs_review'
      ? 'needs_review'
      : evaluation.outcome === 'incomplete'
        ? 'in_progress'
        : 'completed';
  const winner =
    evaluation.outcome === 'home'
      ? fixture.home_team_id
      : evaluation.outcome === 'away'
        ? fixture.away_team_id
        : null;
  await trx
    .updateTable('competition.fixtures')
    .set({
      status,
      winner_team_id: fixture.stage === 'knockout' ? winner : null,
      outcome_json: JSON.stringify({
        outcome: evaluation.outcome,
        rubbersWon: evaluation.rubbersWon,
        pointsFor: evaluation.pointsFor,
        ...(evaluation.reason ? { reason: evaluation.reason } : {}),
      }),
      version: fixture.version + 1,
    })
    .where('id', '=', fixtureId)
    .execute();
  await recordAudit(trx, {
    entityType: 'fixture',
    entityId: fixtureId,
    operation: 'evaluate',
    actor: { type: 'system', id: null },
    correlationId: ctx.correlationId,
    rulesetVersion: version,
    after: { status, outcome: evaluation.outcome, rubbersWon: evaluation.rubbersWon, winner },
  });
  if (fixture.stage === 'knockout' && status === 'completed' && evaluation.outcome === 'draw')
    await trx
      .updateTable('competition.fixtures')
      .set({ status: 'needs_review' })
      .where('id', '=', fixtureId)
      .execute();
  await refreshStandings(trx, meetId, ctx.correlationId);
  if (meet.format === 'pools_knockout') await resolveKnockout(trx, meetId);
}
