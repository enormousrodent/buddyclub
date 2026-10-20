import {
  buildKnockout,
  buildRoundRobin,
  expandFixture,
  qualifierSeeds,
  resolveSource,
  seedPools,
  type BracketSource,
  type ResolvedFixture,
} from '@buddyclub/competition-engine';
import type {
  CreateMeetBody,
  Fixture,
  FixturePreview,
  KnockoutAdvance,
  Meet,
  PublicAccess,
  Rubber,
  SetMeetEntriesBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import {
  loadDivisions,
  loadMeet,
  loadSeason,
  MEET_COLUMNS,
  meetOrganisation,
  meetRules,
  parseLeagueRules,
  randomSlug,
  toMeetDto,
  type DbOrTrx,
} from './common.js';
import { computeMeet } from './standings.js';

export async function createMeet(
  db: Db,
  actor: Actor,
  seasonId: string,
  body: CreateMeetBody,
  ctx: CommandContext,
): Promise<Meet> {
  const season = await loadSeason(db, seasonId);
  assertOrgAction(actor, season.organisation_id, 'competition.manage');
  const rules = parseLeagueRules(season.rules_json);
  const startsAt = new Date(body.startsAt);
  const endsAt = body.endsAt
    ? new Date(body.endsAt)
    : new Date(startsAt.getTime() + 4 * 3600 * 1000);
  if (endsAt <= startsAt)
    throw new AppError(400, 'VALIDATION_FAILED', 'End must be after start', undefined, [
      { path: 'body/endsAt', message: 'must be after startsAt' },
    ]);
  if (body.venueId) {
    const v = await db
      .selectFrom('facilities.venues')
      .select('id')
      .where('id', '=', body.venueId)
      .where('organisation_id', '=', season.organisation_id)
      .executeTakeFirst();
    if (!v)
      throw new AppError(400, 'VALIDATION_FAILED', 'Unknown venue', undefined, [
        { path: 'body/venueId', message: 'not a venue of this organisation' },
      ]);
  }
  return db.transaction().execute(async (trx) => {
    const last = await trx
      .selectFrom('competition.meets')
      .select((eb) => eb.fn.max('sequence_no').as('n'))
      .where('season_id', '=', seasonId)
      .executeTakeFirst();
    const row = await trx
      .insertInto('competition.meets')
      .values({
        season_id: seasonId,
        venue_id: body.venueId ?? null,
        name: body.name,
        sequence_no: Number(last?.n ?? 0) + 1,
        starts_at: startsAt,
        ends_at: endsAt,
        format: body.format ?? rules.tournament.format,
        created_by_profile_id: actor.profileId,
      })
      .returning(MEET_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'meet',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { seasonId, name: body.name, startsAt: startsAt.toISOString(), format: row.format },
    });
    return toMeetDto(trx, row);
  });
}

export async function getMeet(db: Db, actor: Actor, meetId: string): Promise<Meet> {
  const { meet, organisationId } = await meetOrganisation(db, meetId);
  assertOrgMember(actor, organisationId);
  return toMeetDto(db, meet);
}

export async function listMeets(db: Db, actor: Actor, seasonId: string): Promise<Meet[]> {
  const season = await loadSeason(db, seasonId);
  assertOrgMember(actor, season.organisation_id);
  const rows = await db
    .selectFrom('competition.meets')
    .select(MEET_COLUMNS)
    .where('season_id', '=', seasonId)
    .orderBy('sequence_no')
    .execute();
  return Promise.all(rows.map((r) => toMeetDto(db, r)));
}

async function assertDraft(meet: { state: string }, what: string): Promise<void> {
  if (meet.state !== 'draft')
    throw new AppError(409, 'CONFLICT', `Cannot ${what} once the meet is ${meet.state}`);
}

async function assertTeamsOfOrg(
  trx: DbOrTrx,
  organisationId: string,
  teamIds: string[],
): Promise<void> {
  if (new Set(teamIds).size !== teamIds.length)
    throw new AppError(400, 'VALIDATION_FAILED', 'Duplicate team', undefined, [
      { path: 'body/teamIds', message: 'teams must be unique' },
    ]);
  if (!teamIds.length) return;
  const teams = await trx
    .selectFrom('competition.teams')
    .select('id')
    .where('id', 'in', teamIds)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .execute();
  if (teams.length !== teamIds.length)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown team', undefined, [
      { path: 'body/teamIds', message: 'all teams must belong to this organisation' },
    ]);
}

export async function setDivisionTeams(
  db: Db,
  actor: Actor,
  meetId: string,
  divisionId: string,
  teamIds: string[],
  ctx: CommandContext,
): Promise<Meet> {
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    assertOrgAction(actor, season.organisation_id, 'competition.manage');
    await assertDraft(meet, 'change division teams');
    const division = (await loadDivisions(trx, meet.season_id)).find((d) => d.id === divisionId);
    if (!division) throw notFound('Division not found in this season');
    await assertTeamsOfOrg(trx, season.organisation_id, teamIds);
    if (teamIds.length > division.capacity)
      throw new AppError(400, 'VALIDATION_FAILED', 'Too many teams for the division', undefined, [
        { path: 'body/teamIds', message: `capacity is ${division.capacity}` },
      ]);
    if (teamIds.length) {
      const elsewhere = await trx
        .selectFrom('competition.division_assignments')
        .select(['team_id', 'division_id'])
        .where('meet_id', '=', meetId)
        .where('division_id', '!=', divisionId)
        .where('team_id', 'in', teamIds)
        .execute();
      if (elsewhere.length)
        throw new AppError(
          409,
          'CONFLICT',
          'A team is already in another division at this meet',
          elsewhere.map((e) => e.team_id).join(', '),
        );
    }
    await trx
      .deleteFrom('competition.division_assignments')
      .where('meet_id', '=', meetId)
      .where('division_id', '=', divisionId)
      .execute();
    if (teamIds.length) {
      await trx
        .insertInto('competition.division_assignments')
        .values(
          teamIds.map((team_id, i) => ({
            meet_id: meetId,
            division_id: divisionId,
            team_id,
            seed: i + 1,
          })),
        )
        .execute();
    }
    const updated = await trx
      .updateTable('competition.meets')
      .set({ version: meet.version + 1 })
      .where('id', '=', meetId)
      .returning(MEET_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'meet',
      entityId: meetId,
      operation: 'set_division_teams',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { divisionId, teamIds },
    });
    return toMeetDto(trx, updated);
  });
}

/**
 * Tournament draw: distributes the entrants across the season's divisions (pools) by seed, snake
 * or sequential per the rules. Replaces any previous assignment at this meet.
 */
export async function setMeetEntries(
  db: Db,
  actor: Actor,
  meetId: string,
  body: SetMeetEntriesBody,
  ctx: CommandContext,
): Promise<Meet> {
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    assertOrgAction(actor, season.organisation_id, 'competition.manage');
    await assertDraft(meet, 'change the entries');
    const teamIds = body.teams.map((t) => t.teamId);
    await assertTeamsOfOrg(trx, season.organisation_id, teamIds);
    const rules = parseLeagueRules(season.rules_json);
    const divisions = await loadDivisions(trx, meet.season_id);
    let draw;
    try {
      draw = seedPools(
        body.teams.map((t) => ({ teamId: t.teamId, seed: t.seed })),
        divisions.map((d) => ({ divisionId: d.id, capacity: d.capacity })),
        rules.tournament.seeding,
      );
    } catch (error) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Entries do not fit the pools',
        error instanceof Error ? error.message : undefined,
        [{ path: 'body/teams', message: 'see detail' }],
      );
    }
    await trx
      .deleteFrom('competition.division_assignments')
      .where('meet_id', '=', meetId)
      .execute();
    const seedOf = new Map(body.teams.map((t, i) => [t.teamId, t.seed ?? 1000 + i]));
    for (const pool of draw) {
      if (!pool.teamIds.length) continue;
      await trx
        .insertInto('competition.division_assignments')
        .values(
          pool.teamIds.map((team_id) => ({
            meet_id: meetId,
            division_id: pool.divisionId,
            team_id,
            seed: seedOf.get(team_id) ?? null,
          })),
        )
        .execute();
    }
    const updated = await trx
      .updateTable('competition.meets')
      .set({ version: meet.version + 1 })
      .where('id', '=', meetId)
      .returning(MEET_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'meet',
      entityId: meetId,
      operation: 'set_entries',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { entrants: teamIds.length, pools: draw.map((p) => p.teamIds.length) },
    });
    return toMeetDto(trx, updated);
  });
}

export async function setDivisionCourts(
  db: Db,
  actor: Actor,
  meetId: string,
  divisionId: string,
  courtIds: string[],
  exclusive: boolean,
  ctx: CommandContext,
): Promise<Meet> {
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    assertOrgAction(actor, season.organisation_id, 'competition.manage');
    if (meet.state === 'completed' || meet.state === 'cancelled')
      throw new AppError(409, 'CONFLICT', `Cannot change courts once the meet is ${meet.state}`);
    if (!meet.venue_id) throw new AppError(409, 'CONFLICT', 'Set a venue on the meet first');
    const division = (await loadDivisions(trx, meet.season_id)).find((d) => d.id === divisionId);
    if (!division) throw notFound('Division not found in this season');
    if (courtIds.length) {
      const courts = await trx
        .selectFrom('facilities.courts')
        .select('id')
        .where('venue_id', '=', meet.venue_id)
        .where('id', 'in', courtIds)
        .execute();
      if (courts.length !== new Set(courtIds).size)
        throw new AppError(400, 'VALIDATION_FAILED', 'Unknown court', undefined, [
          { path: 'body/courtIds', message: 'all courts must belong to the meet venue' },
        ]);
      if (exclusive) {
        const taken = await trx
          .selectFrom('facilities.court_pool_members as m')
          .innerJoin('facilities.court_pools as p', 'p.id', 'm.court_pool_id')
          .select(['m.court_id', 'p.division_id'])
          .where('p.meet_id', '=', meetId)
          .where('p.division_id', '!=', divisionId)
          .where('p.exclusive', '=', true)
          .where('m.court_id', 'in', courtIds)
          .execute();
        if (taken.length)
          throw new AppError(
            409,
            'COURT_CONFLICT',
            'A court is already dedicated to another division',
            taken.map((t) => t.court_id).join(', '),
          );
      }
    }
    await trx
      .deleteFrom('facilities.court_pools')
      .where('meet_id', '=', meetId)
      .where('division_id', '=', divisionId)
      .execute();
    if (courtIds.length) {
      const pool = await trx
        .insertInto('facilities.court_pools')
        .values({ meet_id: meetId, division_id: divisionId, policy: 'fixed_division', exclusive })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('facilities.court_pool_members')
        .values(courtIds.map((court_id) => ({ court_pool_id: pool.id, court_id })))
        .execute();
    }
    const updated = await trx
      .updateTable('competition.meets')
      .set({ version: meet.version + 1 })
      .where('id', '=', meetId)
      .returning(MEET_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'meet',
      entityId: meetId,
      operation: 'set_division_courts',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { divisionId, courtIds, exclusive },
    });
    return toMeetDto(trx, updated);
  });
}

async function fixturePlan(db: DbOrTrx, meetId: string): Promise<FixturePreview> {
  const meet = await loadMeet(db, meetId);
  const { rules } = await meetRules(db, meet);
  const divisions = await loadDivisions(db, meet.season_id);
  const assignments = await db
    .selectFrom('competition.division_assignments as da')
    .innerJoin('competition.teams as t', 't.id', 'da.team_id')
    .select(['da.division_id', 'da.team_id', 't.name'])
    .where('da.meet_id', '=', meetId)
    .orderBy('da.seed')
    .execute();
  const warnings: string[] = [];
  const rubbersPerFixture = rules.rubberTemplate.length;
  const out = divisions.map((d) => {
    const teams = assignments.filter((a) => a.division_id === d.id);
    const name = new Map(teams.map((t) => [t.team_id, t.name]));
    if (teams.length === 1) warnings.push(`${d.name}: only one team, no fixtures`);
    const fixtures =
      teams.length >= 2
        ? buildRoundRobin(
            teams.map((t) => t.team_id),
            `${meetId}:${d.id}`,
          )
        : [];
    return {
      divisionId: d.id,
      divisionName: d.name,
      fixtures: fixtures.map((f) => ({
        roundNo: f.round,
        home: name.get(f.home) ?? '?',
        away: name.get(f.away) ?? '?',
        homeTeamId: f.home,
        awayTeamId: f.away,
      })),
      rubbersPerFixture,
    };
  });
  const poolFixtures = out.reduce((n, d) => n + d.fixtures.length, 0);
  let knockout: FixturePreview['knockout'] = null;
  if (meet.format === 'pools_knockout') {
    const playing = out.filter((d) => d.fixtures.length > 0);
    const advance = rules.tournament.advancePerPool;
    for (const d of playing) {
      const size = assignments.filter((a) => a.division_id === d.divisionId).length;
      if (size < advance) warnings.push(`${d.divisionName}: fewer teams than advance per pool`);
    }
    const entrants = playing.length * advance;
    if (entrants >= 2) {
      const built = buildKnockout(entrants, { thirdPlace: rules.tournament.thirdPlacePlayoff });
      knockout = {
        entrants,
        rounds: built.rounds,
        fixtures: built.fixtures.length,
        thirdPlace: rules.tournament.thirdPlacePlayoff,
      };
      warnings.push(
        ...qualifierSeeds(
          playing.map((d) => d.divisionId),
          advance,
        ).warnings,
      );
    } else warnings.push('Knockout needs at least two qualifiers');
  }
  if (
    poolFixtures === 0 &&
    divisions.every((d) => !assignments.some((a) => a.division_id === d.id))
  )
    warnings.push('No teams assigned');
  const total = poolFixtures + (knockout?.fixtures ?? 0);
  return {
    format: meet.format,
    divisions: out,
    knockout,
    totals: { fixtures: total, rubbers: total * rubbersPerFixture },
    warnings,
  };
}

export async function previewFixtures(
  db: Db,
  actor: Actor,
  meetId: string,
): Promise<FixturePreview> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgAction(actor, organisationId, 'competition.manage');
  return fixturePlan(db, meetId);
}

async function insertRubbers(
  trx: DbOrTrx,
  fixtureId: string,
  rubbers: ReturnType<typeof expandFixture>,
  rulesVersion: string,
  home: string | null,
  away: string | null,
): Promise<void> {
  for (const r of rubbers) {
    const match = await trx
      .insertInto('matches.matches')
      .values({
        fixture_id: fixtureId,
        rubber_key: r.rubberKey,
        rubber_label: r.label,
        rubber_order: r.order,
        format: r.format,
        ruleset_version: rulesVersion,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('matches.match_sides')
      .values([
        { match_id: match.id, side_no: 1, team_id: home },
        { match_id: match.id, side_no: 2, team_id: away },
      ])
      .execute();
  }
}

/**
 * Publishes the meet: generates pool fixtures and rubbers (and the knockout skeleton for
 * pools-into-knockout events), snapshots the rules. Idempotent per meet.
 */
export async function commitFixtures(
  db: Db,
  actor: Actor,
  meetId: string,
  ctx: CommandContext,
): Promise<Meet> {
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    assertOrgAction(actor, season.organisation_id, 'competition.manage');
    await assertDraft(meet, 'publish fixtures');
    const existing = await trx
      .selectFrom('competition.fixtures')
      .select('id')
      .where('meet_id', '=', meetId)
      .executeTakeFirst();
    if (existing)
      throw new AppError(409, 'CONFLICT', 'Fixtures are already published for this meet');
    const plan = await fixturePlan(trx, meetId);
    if (plan.totals.fixtures === 0)
      throw new AppError(
        409,
        'RULE_UNSATISFIABLE',
        'No division has enough teams',
        plan.warnings.join('; '),
      );
    const rules = parseLeagueRules(season.rules_json);
    const rubbers = expandFixture(rules.rubberTemplate);
    const rulesVersion = `league@${rules.schemaVersion}:meet:${meetId}`;

    for (const division of plan.divisions) {
      for (const f of division.fixtures) {
        const fixture = await trx
          .insertInto('competition.fixtures')
          .values({
            meet_id: meetId,
            division_id: division.divisionId,
            home_team_id: f.homeTeamId,
            away_team_id: f.awayTeamId,
            round_no: f.roundNo,
            stage: 'pool',
            outcome_policy_version: rulesVersion,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await insertRubbers(trx, fixture.id, rubbers, rulesVersion, f.homeTeamId, f.awayTeamId);
      }
    }
    if (plan.knockout) {
      const built = buildKnockout(plan.knockout.entrants, {
        thirdPlace: plan.knockout.thirdPlace,
      });
      for (const bf of built.fixtures) {
        const fixture = await trx
          .insertInto('competition.fixtures')
          .values({
            meet_id: meetId,
            division_id: null,
            home_team_id: null,
            away_team_id: null,
            round_no: bf.round,
            stage: 'knockout',
            bracket_round: bf.round,
            bracket_slot: bf.slot,
            bracket_label: bf.label,
            sources_json: JSON.stringify({
              home: bf.home,
              away: bf.away,
              thirdPlace: bf.thirdPlace,
            }),
            outcome_policy_version: rulesVersion,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await insertRubbers(trx, fixture.id, rubbers, rulesVersion, null, null);
      }
    }
    const updated = await trx
      .updateTable('competition.meets')
      .set({
        state: 'published',
        published_at: new Date(),
        rules_json: JSON.stringify(rules),
        rules_schema_version: rules.schemaVersion,
        version: meet.version + 1,
      })
      .where('id', '=', meetId)
      .returning(MEET_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'meet',
      entityId: meetId,
      operation: 'publish_fixtures',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      rulesetVersion: rulesVersion,
      after: {
        fixtures: plan.totals.fixtures,
        rubbers: plan.totals.rubbers,
        knockout: plan.knockout,
        warnings: plan.warnings,
      },
    });
    await emitEvent(trx, {
      eventType: 'meet.fixtures_published',
      aggregateType: 'meet',
      aggregateId: meetId,
      payload: { meetId, fixtures: plan.totals.fixtures },
      dedupeKey: `fixtures_published:${meetId}`,
    });
    return toMeetDto(trx, updated);
  });
}

interface KnockoutSources {
  home: BracketSource;
  away: BracketSource;
  thirdPlace?: boolean;
}

/**
 * Fills knockout sides whose sources are final: pool positions once the pool is complete with
 * no unresolved tie among the qualifiers, and winners/losers of decided feeder fixtures. Safe to
 * run repeatedly; never changes a side that is already set.
 */
export async function resolveKnockout(
  db: DbOrTrx,
  meetId: string,
): Promise<{ resolved: number; pending: string[] }> {
  const meet = await loadMeet(db, meetId);
  if (meet.format !== 'pools_knockout') return { resolved: 0, pending: [] };
  const { rules } = await meetRules(db, meet);
  const advance = rules.tournament.advancePerPool;
  const { divisions } = await computeMeet(db, meetId);
  const playing = divisions.filter((d) => d.rows.length >= 2);
  const { seeds } = qualifierSeeds(
    playing.map((d) => d.divisionId),
    advance,
  );
  const pending: string[] = [];
  const seedTeams = new Map<number, string>();
  for (const d of playing) {
    if (d.pendingFixtures > 0) {
      pending.push(`${d.divisionName}: ${d.pendingFixtures} fixture(s) to play`);
      continue;
    }
    for (let position = 1; position <= advance; position++) {
      const row = d.rows[position - 1];
      const seed = seeds.find((s) => s.divisionId === d.divisionId && s.position === position);
      if (!row || !seed) {
        pending.push(`${d.divisionName}: no team in position ${position}`);
        continue;
      }
      if (row.tiedWith.length) {
        pending.push(
          `${d.divisionName}: unresolved tie at position ${position} (director decision required)`,
        );
        continue;
      }
      seedTeams.set(seed.seed, row.teamId);
    }
  }
  const fixtures = await db
    .selectFrom('competition.fixtures')
    .select([
      'id',
      'home_team_id',
      'away_team_id',
      'winner_team_id',
      'status',
      'bracket_round',
      'bracket_slot',
      'bracket_label',
      'sources_json',
    ])
    .where('meet_id', '=', meetId)
    .where('stage', '=', 'knockout')
    .orderBy('bracket_round')
    .orderBy('bracket_slot')
    .execute();
  const decided: ResolvedFixture[] = fixtures
    .filter((f) => f.winner_team_id && f.home_team_id && f.away_team_id)
    .map((f) => ({
      round: f.bracket_round as number,
      slot: f.bracket_slot as number,
      winner: f.winner_team_id,
      loser: f.winner_team_id === f.home_team_id ? f.away_team_id : f.home_team_id,
    }));
  let resolved = 0;
  for (const f of fixtures) {
    const sources = f.sources_json as KnockoutSources | null;
    if (!sources) continue;
    const next: { home_team_id?: string; away_team_id?: string } = {};
    for (const side of ['home', 'away'] as const) {
      const current = side === 'home' ? f.home_team_id : f.away_team_id;
      if (current) continue;
      const team = resolveSource(sources[side], seedTeams, decided);
      if (team) next[`${side}_team_id`] = team;
      else if (sources[side].type !== 'seed')
        pending.push(
          `${f.bracket_label ?? 'Knockout'} ${f.bracket_slot}: waiting for the ${sources[side].type} of round ${(sources[side] as { round: number }).round} slot ${(sources[side] as { slot: number }).slot}`,
        );
    }
    if (!Object.keys(next).length) continue;
    await db
      .updateTable('competition.fixtures')
      .set({ ...next, updated_at: new Date() })
      .where('id', '=', f.id)
      .execute();
    for (const [side, teamId] of Object.entries(next)) {
      const sideNo = side === 'home_team_id' ? 1 : 2;
      await db
        .updateTable('matches.match_sides as s')
        .set({ team_id: teamId })
        .where('s.side_no', '=', sideNo)
        .where('s.match_id', 'in', (eb) =>
          eb.selectFrom('matches.matches').select('id').where('fixture_id', '=', f.id),
        )
        .execute();
    }
    resolved += 1;
  }
  return { resolved, pending: [...new Set(pending)] };
}

export async function advanceKnockout(
  db: Db,
  actor: Actor,
  meetId: string,
  ctx: CommandContext,
): Promise<KnockoutAdvance> {
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    assertOrgAction(actor, season.organisation_id, 'competition.manage');
    if (meet.format !== 'pools_knockout')
      throw new AppError(409, 'CONFLICT', 'This meet has no knockout stage');
    if (meet.state === 'draft')
      throw new AppError(409, 'CONFLICT', 'Publish the fixtures before advancing');
    const { resolved, pending } = await resolveKnockout(trx, meetId);
    if (resolved)
      await recordAudit(trx, {
        entityType: 'meet',
        entityId: meetId,
        operation: 'knockout_advance',
        actor: { type: 'user', id: actor.profileId },
        correlationId: ctx.correlationId,
        after: { resolved, pending },
      });
    return {
      meetId,
      resolved,
      pending,
      fixtures: (await listFixtures(trx, meetId)).filter((f) => f.stage === 'knockout'),
    };
  });
}

/** Enables or disables the public board for a meet; enabling keeps the slug, disabling drops it. */
export async function setMeetPublicAccess(
  db: Db,
  actor: Actor,
  meetId: string,
  enabled: boolean,
  ctx: CommandContext,
): Promise<PublicAccess> {
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    assertOrgAction(actor, season.organisation_id, 'competition.manage');
    const slug = enabled ? (meet.public_slug ?? randomSlug()) : null;
    await trx
      .updateTable('competition.meets')
      .set({ public_slug: slug, version: meet.version + 1 })
      .where('id', '=', meetId)
      .execute();
    await recordAudit(trx, {
      entityType: 'meet',
      entityId: meetId,
      operation: enabled ? 'public_enable' : 'public_disable',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { enabled },
    });
    return { slug };
  });
}

interface RubberRow {
  id: string;
  fixture_id: string;
  rubber_key: string | null;
  rubber_label: string | null;
  rubber_order: number | null;
  format: 'singles' | 'doubles';
  state: Rubber['state'];
  court_id: string | null;
  court_code: string | null;
  called_at: Date | null;
  starts_at: Date | null;
  completed_at: Date | null;
}

export async function loadRubbers(
  db: DbOrTrx,
  fixtureIds: string[],
): Promise<Map<string, Rubber[]>> {
  const out = new Map<string, Rubber[]>();
  if (fixtureIds.length === 0) return out;
  const rows: RubberRow[] = (await db
    .selectFrom('matches.matches as m')
    .leftJoin('facilities.courts as c', 'c.id', 'm.court_id')
    .select([
      'm.id',
      'm.fixture_id',
      'm.rubber_key',
      'm.rubber_label',
      'm.rubber_order',
      'm.format',
      'm.state',
      'm.court_id',
      'c.code as court_code',
      'm.called_at',
      'm.starts_at',
      'm.completed_at',
    ])
    .where('m.fixture_id', 'in', fixtureIds)
    .orderBy('m.rubber_order')
    .execute()) as RubberRow[];
  const matchIds = rows.map((r) => r.id);
  const sides = matchIds.length
    ? await db
        .selectFrom('matches.match_sides as s')
        .leftJoin('competition.teams as t', 't.id', 's.team_id')
        .leftJoin('matches.match_side_players as sp', 'sp.match_side_id', 's.id')
        .leftJoin('identity.participants as p', 'p.id', 'sp.participant_id')
        .select([
          's.match_id',
          's.side_no',
          's.team_id',
          't.name as team_name',
          'sp.participant_id',
          'p.display_name',
        ])
        .where('s.match_id', 'in', matchIds)
        .orderBy('s.side_no')
        .orderBy('p.display_name')
        .execute()
    : [];
  const results = matchIds.length
    ? await db
        .selectFrom('matches.result_revisions')
        .select([
          'match_id',
          'revision',
          'result_status',
          'score_json',
          'created_at',
          'confirmed_at',
        ])
        .where('match_id', 'in', matchIds)
        .orderBy('revision', 'desc')
        .execute()
    : [];
  const latest = new Map<string, (typeof results)[number]>();
  for (const r of results) if (!latest.has(r.match_id)) latest.set(r.match_id, r);

  for (const r of rows) {
    const sideRows = sides.filter((s) => s.match_id === r.id);
    const bySide = [1, 2].map((n) => {
      const mine = sideRows.filter((s) => s.side_no === n);
      const first = mine[0];
      return {
        teamId: first?.team_id ?? null,
        teamName: first?.team_name ?? 'TBC',
        players: mine
          .filter((s) => s.participant_id)
          .map((s) => ({
            participantId: s.participant_id as string,
            displayName: s.display_name as string,
          })),
      };
    });
    const res = latest.get(r.id);
    const score = (res?.score_json ?? {}) as {
      games?: [number, number][];
      forfeitedBy?: 'home' | 'away' | null;
    };
    const rubber: Rubber = {
      matchId: r.id,
      fixtureId: r.fixture_id,
      rubberKey: r.rubber_key ?? '',
      label: r.rubber_label ?? r.rubber_key ?? '',
      order: r.rubber_order ?? 0,
      format: r.format,
      state: r.state,
      courtId: r.court_id,
      courtCode: r.court_code,
      calledAt: toIsoOrNull(r.called_at),
      startedAt: toIsoOrNull(r.starts_at),
      completedAt: toIsoOrNull(r.completed_at),
      sides: bySide,
      result: res
        ? {
            revision: res.revision,
            status: res.result_status,
            games: score.games ?? [],
            forfeitedBy: score.forfeitedBy ?? null,
            submittedAt: toIso(res.created_at),
            confirmedAt: toIsoOrNull(res.confirmed_at),
          }
        : null,
    };
    out.set(r.fixture_id, [...(out.get(r.fixture_id) ?? []), rubber]);
  }
  return out;
}

export async function listFixtures(db: DbOrTrx, meetId: string): Promise<Fixture[]> {
  const rows = await db
    .selectFrom('competition.fixtures as f')
    .leftJoin('competition.divisions as d', 'd.id', 'f.division_id')
    .leftJoin('competition.teams as h', 'h.id', 'f.home_team_id')
    .leftJoin('competition.teams as a', 'a.id', 'f.away_team_id')
    .select([
      'f.id',
      'f.meet_id',
      'f.division_id',
      'd.name as division_name',
      'd.ordinal',
      'f.round_no',
      'f.stage',
      'f.bracket_round',
      'f.bracket_slot',
      'f.bracket_label',
      'f.sources_json',
      'f.winner_team_id',
      'f.status',
      'f.home_team_id',
      'h.name as home_name',
      'f.away_team_id',
      'a.name as away_name',
      'f.outcome_json',
      'f.version',
    ])
    .where('f.meet_id', '=', meetId)
    .orderBy('f.stage')
    .orderBy('d.ordinal')
    .orderBy('f.round_no')
    .orderBy('f.bracket_slot')
    .orderBy('h.name')
    .execute();
  const rubbers = await loadRubbers(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const sources = r.sources_json as KnockoutSources | null;
    const seedOf = (s: BracketSource | undefined) => (s && s.type === 'seed' ? s.seed : null);
    return {
      id: r.id,
      meetId: r.meet_id,
      divisionId: r.division_id,
      divisionName: r.division_name ?? null,
      roundNo: r.round_no,
      stage: r.stage,
      bracket:
        r.stage === 'knockout' && sources
          ? {
              round: r.bracket_round as number,
              slot: r.bracket_slot as number,
              label: r.bracket_label ?? 'Knockout',
              thirdPlace: !!sources.thirdPlace,
              sources: { home: sources.home, away: sources.away },
              seeds: { home: seedOf(sources.home), away: seedOf(sources.away) },
            }
          : null,
      status: r.status,
      home: r.home_team_id ? { teamId: r.home_team_id, name: r.home_name ?? '?' } : null,
      away: r.away_team_id ? { teamId: r.away_team_id, name: r.away_name ?? '?' } : null,
      winnerTeamId: r.winner_team_id,
      outcome: (r.outcome_json as Fixture['outcome']) ?? null,
      version: r.version,
      rubbers: rubbers.get(r.id) ?? [],
    };
  });
}

export async function getFixtures(db: Db, actor: Actor, meetId: string): Promise<Fixture[]> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgMember(actor, organisationId);
  return listFixtures(db, meetId);
}
