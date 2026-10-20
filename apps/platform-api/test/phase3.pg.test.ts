import { randomUUID } from 'node:crypto';
import {
  FixtureSchema,
  MeetSchema,
  ProgressionPreviewSchema,
  StandingsSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

/**
 * Phase 3 reference league against Postgres: three divisions of four teams, two dedicated courts
 * each, 18 fixtures and 72 rubbers, fixed-court enforcement, results, standings and progression.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!databaseUrl)('Phase 3: reference divisional league', () => {
  const run = randomUUID().slice(0, 8);
  const users = { director: randomUUID(), captain: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId: string;
  let venueId: string;
  const courtIds: string[] = [];
  let seasonId: string;
  let meetId: string;
  const divisionIds: string[] = [];
  const teamIds: string[] = [];
  const playersByTeam = new Map<string, string[]>();

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => {
    try {
      return JSON.parse(res.body);
    } catch {
      throw new Error(`non-JSON response ${res.statusCode}: ${res.body.slice(0, 300)}`);
    }
  };
  const post = async (
    url: string,
    user: string,
    payload: unknown = {},
    headers: Record<string, string> = {},
  ) =>
    call({
      method: 'POST',
      url,
      headers: { ...(await bearer(user)), ...headers },
      payload: payload as object,
    });
  const put = async (url: string, user: string, payload: unknown) =>
    call({
      method: 'PUT',
      url,
      headers: await bearer(user),
      payload: payload as object,
    });
  const get = async (url: string, user: string) =>
    call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`p3-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `P3 ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    const built = await createTestApp({
      repo: new PgIdentityRepository(db),
      db,
      idempotencyStore: new PgIdempotencyStore(db),
    });
    app = built.app;

    orgId = json(await post('/v1/organisations', users.director, { name: `League ${run}` })).id;
    const invite = json(
      await post(`/v1/organisations/${orgId}/invitations`, users.director, {
        role: 'team_captain',
        maxUses: 5,
      }),
    );
    await post(`/v1/invitations/${invite.token}/redeem`, users.captain);
    venueId = json(
      await post(`/v1/organisations/${orgId}/venues`, users.director, {
        name: 'Regional Hall',
        timezone: 'Europe/London',
      }),
    ).id;
    for (let i = 1; i <= 6; i++)
      courtIds.push(
        json(await post(`/v1/venues/${venueId}/courts`, users.director, { code: String(i) })).id,
      );

    // 12 teams, each with 4 players (2 'F', 2 'M' so mixed rubbers are fillable), captain user captains team 1.
    const captainMe = json(await get('/v1/me', users.captain)).participants.find(
      (p: { organisationId: string }) => p.organisationId === orgId,
    ).id as string;
    for (let t = 1; t <= 12; t++) {
      const players: string[] = [];
      for (let p = 1; p <= 4; p++) {
        if (t === 1 && p === 1) {
          players.push(captainMe);
          continue;
        }
        players.push(
          json(
            await post(`/v1/organisations/${orgId}/participants`, users.director, {
              displayName: `T${t} P${p}`,
            }),
          ).id,
        );
      }
      const team = json(
        await post(`/v1/organisations/${orgId}/teams`, users.director, {
          name: `Team ${t} ${run}`,
          captainParticipantId: players[0],
        }),
      );
      for (const p of players.slice(1))
        await post(`/v1/teams/${team.id}/roster`, users.director, { participantId: p });
      teamIds.push(team.id);
      playersByTeam.set(team.id, players);
    }
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (orgId) {
      await sql`alter table competition.standings_snapshots disable trigger standings_snapshots_append_only`.execute(
        db,
      );
      await sql`alter table matches.result_revisions disable trigger result_revisions_append_only`.execute(
        db,
      );
      try {
        await db
          .deleteFrom('competition.competitions')
          .where('organisation_id', '=', orgId)
          .execute();
      } finally {
        await sql`alter table competition.standings_snapshots enable trigger standings_snapshots_append_only`.execute(
          db,
        );
        await sql`alter table matches.result_revisions enable trigger result_revisions_append_only`.execute(
          db,
        );
      }
      await db.deleteFrom('competition.teams').where('organisation_id', '=', orgId).execute();
      await db.deleteFrom('platform.invitation_links').where('scope_id', '=', orgId).execute();
      await db.deleteFrom('community.organisations').where('id', '=', orgId).execute();
    }
    const authIds = Object.values(users);
    const profiles = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', 'in', authIds)
      .execute();
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length) {
      await db
        .deleteFrom('platform.idempotency_keys')
        .where(
          'scope',
          'in',
          profileIds.map((id) => `user:${id}`),
        )
        .execute();
      await db.deleteFrom('identity.user_profiles').where('id', 'in', profileIds).execute();
    }
    await sql`delete from auth.users where id = any(${authIds}::uuid[])`.execute(db);
    await db.destroy();
  });

  it('creates a league season with three divisions and the reference rules', async () => {
    const comp = json(
      await post(`/v1/organisations/${orgId}/competitions`, users.director, {
        name: 'Regional League',
      }),
    );
    const season = await post(`/v1/competitions/${comp.id}/seasons`, users.director, {
      name: '2026/27',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 180 * 86400000).toISOString(),
      rules: {
        scoring: { targetPoints: 21, winBy: 2, cap: 30 },
        fixtureOutcome: { tieBreak: 'aggregate_points' },
      },
      divisions: [{ name: 'Division 1' }, { name: 'Division 2' }, { name: 'Division 3' }],
    });
    expect(season.statusCode).toBe(201);
    seasonId = json(season).id;
    expect(json(season).divisions).toHaveLength(3);
    divisionIds.push(...json(season).divisions.map((d: { id: string }) => d.id));
  });

  it('builds a meet: four teams per division, two dedicated courts each, exclusive', async () => {
    const meetRes = await post(`/v1/seasons/${seasonId}/meets`, users.director, {
      name: 'Meet 1',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      venueId,
    });
    expect(meetRes.statusCode, meetRes.body).toBe(201);
    meetId = json(meetRes).id;
    for (let d = 0; d < 3; d++) {
      const res = await put(
        `/v1/meets/${meetId}/divisions/${divisionIds[d]}/teams`,
        users.director,
        { teamIds: teamIds.slice(d * 4, d * 4 + 4) },
      );
      expect(res.statusCode, res.body).toBe(200);
      const courts = await put(
        `/v1/meets/${meetId}/divisions/${divisionIds[d]}/courts`,
        users.director,
        { courtIds: courtIds.slice(d * 2, d * 2 + 2) },
      );
      expect(courts.statusCode, courts.body).toBe(200);
    }
    const clash = await put(
      `/v1/meets/${meetId}/divisions/${divisionIds[0]}/courts`,
      users.director,
      { courtIds: [courtIds[2]] },
    );
    expect(clash.statusCode).toBe(409);
    expect(json(clash).code).toBe('COURT_CONFLICT');
    const meet = MeetSchema.parse(json(await get(`/v1/meets/${meetId}`, users.director)));
    expect(meet.divisions.every((d) => d.teams.length === 4 && d.courts.length === 2)).toBe(true);
  });

  it('publishes 18 fixtures and 72 rubbers with the four reference rubbers', async () => {
    const preview = json(await post(`/v1/meets/${meetId}/fixtures/preview`, users.director));
    expect(preview.totals).toEqual({ fixtures: 18, rubbers: 72 });
    const commit = await post(`/v1/meets/${meetId}/fixtures/commit`, users.director);
    expect(commit.statusCode).toBe(200);
    const meet = MeetSchema.parse(json(commit));
    expect(meet.state).toBe('published');
    expect(meet.counts).toMatchObject({ fixtures: 18, rubbers: 72 });
    expect((await post(`/v1/meets/${meetId}/fixtures/commit`, users.director)).statusCode).toBe(
      409,
    );

    const fixtures = json(await get(`/v1/meets/${meetId}/fixtures`, users.director))
      .items as ReturnType<typeof FixtureSchema.parse>[];
    expect(fixtures).toHaveLength(18);
    for (const t of teamIds)
      expect(fixtures.filter((f) => f.home!.teamId === t || f.away!.teamId === t)).toHaveLength(3);
    expect(fixtures[0]!.rubbers.map((r) => r.rubberKey)).toEqual(['wd', 'md', 'xd1', 'xd2']);
  });

  async function lineupFor(
    fixture: ReturnType<typeof FixtureSchema.parse>,
    teamId: string,
    user: string,
  ) {
    const [p1, p2, p3, p4] = playersByTeam.get(teamId) as [string, string, string, string];
    return put(`/v1/fixtures/${fixture.id}/lineups/${teamId}`, user, {
      rubbers: { wd: [p1, p2], md: [p3, p4], xd1: [p1, p3], xd2: [p2, p4] },
    });
  }

  it('captains submit lineups; fixed courts are enforced on call; players cannot be double-booked', async () => {
    const fixtures = json(await get(`/v1/meets/${meetId}/fixtures`, users.director))
      .items as ReturnType<typeof FixtureSchema.parse>[];
    const fixture = fixtures.find(
      (f) => f.home!.teamId === teamIds[0] || f.away!.teamId === teamIds[0],
    )!;
    const other = fixture.home!.teamId === teamIds[0] ? fixture.away!.teamId : fixture.home!.teamId;

    const byCaptain = await lineupFor(fixture, teamIds[0]!, users.captain);
    expect(byCaptain.statusCode).toBe(200);
    const wrongTeam = await lineupFor(fixture, other, users.captain);
    expect(wrongTeam.statusCode).toBe(403);
    expect((await lineupFor(fixture, other, users.director)).statusCode).toBe(200);

    const wd = fixture.rubbers.find((r) => r.rubberKey === 'wd')!;
    const outside = await post(`/v1/matches/${wd.matchId}/call`, users.director, {
      courtId: courtIds[5],
    });
    expect(outside.statusCode).toBe(409);
    expect(json(outside).code).toBe('COURT_CONFLICT');
    const called = await post(`/v1/matches/${wd.matchId}/call`, users.director, {
      courtId: courtIds[0],
    });
    expect(called.statusCode).toBe(200);
    const sameCourt = await post(
      `/v1/matches/${fixture.rubbers[1]!.matchId}/call`,
      users.director,
      { courtId: courtIds[0] },
    );
    expect(json(sameCourt).code).toBe('COURT_CONFLICT');
    // xd1 shares p1 with wd: player conflict while wd is called.
    const xd1 = fixture.rubbers.find((r) => r.rubberKey === 'xd1')!;
    const clash = await post(`/v1/matches/${xd1.matchId}/call`, users.director, {
      courtId: courtIds[1],
    });
    expect(json(clash).code).toBe('PLAYER_CONFLICT');
    expect((await post(`/v1/matches/${wd.matchId}/start`, users.director)).statusCode).toBe(200);

    const bad = await post(`/v1/matches/${wd.matchId}/results`, users.director, {
      games: [[21, 20]],
    });
    expect(bad.statusCode).toBe(400);
    expect(json(bad).code).toBe('INVALID_SCORE');
    const good = await post(`/v1/matches/${wd.matchId}/results`, users.director, {
      games: [[21, 15]],
    });
    expect(good.statusCode).toBe(200);
    const updated = FixtureSchema.parse(json(good));
    expect(updated.rubbers.find((r) => r.rubberKey === 'wd')!.result).toMatchObject({
      status: 'confirmed',
      games: [[21, 15]],
    });
    expect(updated.status).toBe('in_progress');
  });

  /** Plays every rubber of a fixture with director-entered scores (home wins `homeWins` rubbers). */
  async function playFixture(
    fixture: ReturnType<typeof FixtureSchema.parse>,
    homeWins: number,
    margin = 5,
  ) {
    if (fixture.rubbers.some((r) => r.sides[0]!.players.length === 0))
      await lineupFor(fixture, fixture.home!.teamId, users.director);
    if (fixture.rubbers.some((r) => r.sides[1]!.players.length === 0))
      await lineupFor(fixture, fixture.away!.teamId, users.director);
    let i = 0;
    for (const r of fixture.rubbers) {
      if (r.result?.status === 'confirmed') {
        i++;
        continue;
      }
      const homeWin = i < homeWins;
      const res = await post(`/v1/matches/${r.matchId}/results`, users.director, {
        games: [homeWin ? [21, 21 - margin] : [21 - margin, 21]],
      });
      expect(res.statusCode, res.body).toBe(200);
      i++;
    }
  }

  it('completes division 1 with the New Forest / NTA shape and ranks by fixture wins then points difference', async () => {
    const fixtures = (
      json(await get(`/v1/meets/${meetId}/fixtures`, users.director)).items as ReturnType<
        typeof FixtureSchema.parse
      >[]
    ).filter((f) => f.divisionId === divisionIds[0]);
    const [A, B, C, D] = teamIds.slice(0, 4) as [string, string, string, string];
    const find = (x: string, y: string) =>
      fixtures.find(
        (f) =>
          (f.home!.teamId === x && f.away!.teamId === y) ||
          (f.home!.teamId === y && f.away!.teamId === x),
      )!;
    const plan: Array<[string, string, number, number]> = [
      // [winner, loser, rubbers won by winner, margin per game]
      [A, B, 4, 15], // A big win
      [A, C, 3, 5],
      [B, C, 3, 5],
      [B, D, 3, 2], // B narrow wins => smaller difference
      [C, D, 3, 7], // C above D on difference
      [D, A, 3, 2], // A loses narrowly: A and B both on 2 wins, A has the better difference
    ];
    for (const [winner, loser, rubbers, margin] of plan) {
      const f = find(winner, loser);
      await playFixture(f, f.home!.teamId === winner ? rubbers : 4 - rubbers, margin);
    }
    const standings = StandingsSchema.parse(
      json(await get(`/v1/meets/${meetId}/standings`, users.director)),
    );
    const div1 = standings.divisions.find((d) => d.divisionId === divisionIds[0])!;
    expect(div1.pendingFixtures).toBe(0);
    expect(div1.unresolvedTies).toEqual([]);
    const rowA = div1.rows.find((r) => r.teamId === A)!;
    const rowB = div1.rows.find((r) => r.teamId === B)!;
    expect(rowA.fixtureWins).toBe(2);
    expect(rowB.fixtureWins).toBe(2);
    expect(rowA.pointsDifference).toBeGreaterThan(rowB.pointsDifference);
    expect(rowA.rank).toBe(1);
    expect(rowB.rank).toBe(2);
    expect(standings.criteria).toEqual(['fixture_wins', 'points_difference']);

    const snapshots = await db
      .selectFrom('competition.standings_snapshots')
      .select('revision')
      .where('meet_id', '=', meetId)
      .where('division_id', '=', divisionIds[0]!)
      .execute();
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
  }, 300_000);

  it('blocks progression while other divisions are unfinished, then previews and commits it', async () => {
    const blocked = ProgressionPreviewSchema.parse(
      json(await post(`/v1/meets/${meetId}/progression/preview`, users.director)),
    );
    expect(blocked.blockers.length).toBeGreaterThan(0);
    const denied = await post(`/v1/meets/${meetId}/progression/commit`, users.director, {
      progressionId: blocked.progressionId,
      nextMeet: { name: 'Meet 2', startsAt: new Date(Date.now() + 30 * 86400000).toISOString() },
    });
    expect(denied.statusCode).toBe(409);

    // Finish divisions 2 and 3: home always wins 3-1.
    const fixtures = (
      json(await get(`/v1/meets/${meetId}/fixtures`, users.director)).items as ReturnType<
        typeof FixtureSchema.parse
      >[]
    ).filter((f) => f.divisionId !== divisionIds[0]);
    for (const f of fixtures) await playFixture(f, 3, 3 + (f.roundNo % 4));
    const standings = StandingsSchema.parse(
      json(await get(`/v1/meets/${meetId}/standings`, users.director)),
    );
    const stillTied = standings.divisions.filter((d) => d.unresolvedTies.length);
    // With round-dependent margins ties are unlikely; if any remain, the preview must report them.
    const preview = ProgressionPreviewSchema.parse(
      json(await post(`/v1/meets/${meetId}/progression/preview`, users.director)),
    );
    if (stillTied.length) {
      expect(preview.blockers.some((b) => /unresolved tie/.test(b))).toBe(true);
      return;
    }
    expect(preview.blockers).toEqual([]);
    expect(preview.moves.filter((m) => m.direction === 'up')).toHaveLength(2);
    expect(preview.moves.filter((m) => m.direction === 'down')).toHaveLength(2);
    const div1Top = standings.divisions.find((d) => d.divisionId === divisionIds[0])!.rows[0]!
      .teamId;
    expect(preview.moves.find((m) => m.teamId === div1Top)!.direction).toBe('stay');

    const committed = await post(`/v1/meets/${meetId}/progression/commit`, users.director, {
      progressionId: preview.progressionId,
      nextMeet: { name: 'Meet 2', startsAt: new Date(Date.now() + 30 * 86400000).toISOString() },
      reason: 'end of meet 1',
    });
    expect(committed.statusCode, committed.body).toBe(200);
    expect(json(committed).status).toBe('committed');
    const meets = json(await get(`/v1/seasons/${seasonId}/meets`, users.director))
      .items as ReturnType<typeof MeetSchema.parse>[];
    const next = meets.find((m) => m.sequenceNo === 2)!;
    expect(next.state).toBe('draft');
    expect(next.divisions.every((d) => d.teams.length === 4)).toBe(true);
    expect(meets.find((m) => m.id === meetId)!.state).toBe('completed');
    expect(
      (
        await post(`/v1/meets/${meetId}/progression/commit`, users.director, {
          progressionId: preview.progressionId,
          nextMeetId: next.id,
        })
      ).statusCode,
    ).toBe(409);
  }, 300_000);
});
