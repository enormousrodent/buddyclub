import { randomUUID } from 'node:crypto';
import {
  FixtureSchema,
  KnockoutAdvanceSchema,
  MeetSchema,
  PublicBoardSchema,
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
 * Phase 4 exit: a 32-team pools-into-knockout tournament runs end to end with no duplicate court
 * or player allocation, the bracket fills itself, disputes are resolved, the public board is
 * redacted, and CSV import/export round-trips.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];
const LONG = 600_000;

type Fixture = ReturnType<typeof FixtureSchema.parse>;

describe.skipIf(!databaseUrl)('Phase 4: 32-team tournament and operations', () => {
  const run = randomUUID().slice(0, 8);
  const users = { director: randomUUID(), captain: randomUUID(), member: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId: string;
  let venueId: string;
  const courtIds: string[] = [];
  let seasonId: string;
  let meetId: string;
  const divisionIds: string[] = [];
  /** team id -> [player ids] */
  const roster = new Map<string, string[]>();
  /** seed (1..32) -> team id */
  const seedTeam = new Map<number, string>();
  let publicSlug = '';
  let occurrenceId = '';
  let sessionSlug = '';

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => {
    try {
      return JSON.parse(res.body);
    } catch {
      throw new Error(`non-JSON response ${res.statusCode}: ${res.body.slice(0, 300)}`);
    }
  };
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const put = async (url: string, user: string, payload: unknown) =>
    call({ method: 'PUT', url, headers: await bearer(user), payload: payload as object });
  const patch = async (url: string, user: string, payload: unknown) =>
    call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, user?: string) =>
    call({ method: 'GET', url, headers: user ? await bearer(user) : {} });
  const fixtures = async (): Promise<Fixture[]> =>
    (json(await get(`/v1/meets/${meetId}/fixtures`, users.director)).items as unknown[]).map((f) =>
      FixtureSchema.parse(f),
    );

  async function lineups(f: Fixture) {
    for (const side of [f.home, f.away]) {
      if (!side) throw new Error('fixture has no teams');
      const [p1, p2] = roster.get(side.teamId) as [string, string];
      const res = await put(`/v1/fixtures/${f.id}/lineups/${side.teamId}`, users.director, {
        rubbers: { d1: [p1, p2] },
      });
      expect(res.statusCode, res.body).toBe(200);
    }
  }

  /** Plays the single rubber of a fixture on `courtId`: call, start, director score. */
  async function play(f: Fixture, courtId: string, homeWins: boolean, margin: number) {
    const rubber = f.rubbers[0]!;
    if (rubber.result?.status === 'confirmed') return;
    if (!rubber.calledAt) {
      const called = await post(`/v1/matches/${rubber.matchId}/call`, users.director, { courtId });
      expect(called.statusCode, called.body).toBe(200);
    }
    if (rubber.state === 'scheduled') {
      const started = await post(`/v1/matches/${rubber.matchId}/start`, users.director);
      expect(started.statusCode, started.body).toBe(200);
    }
    const res = await post(`/v1/matches/${rubber.matchId}/results`, users.director, {
      games: [homeWins ? [21, 21 - margin] : [21 - margin, 21]],
    });
    expect(res.statusCode, res.body).toBe(200);
  }

  const seedOf = (teamId: string) => [...seedTeam.entries()].find(([, t]) => t === teamId)![0];

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 4 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`p4-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `P4 ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    const built = await createTestApp({
      repo: new PgIdentityRepository(db),
      db,
      idempotencyStore: new PgIdempotencyStore(db),
    });
    app = built.app;

    orgId = json(await post('/v1/organisations', users.director, { name: `Open ${run}` })).id;
    const invite = json(
      await post(`/v1/organisations/${orgId}/invitations`, users.director, {
        role: 'team_captain',
        maxUses: 5,
      }),
    );
    await post(`/v1/invitations/${invite.token}/redeem`, users.captain);
    const memberInvite = json(
      await post(`/v1/organisations/${orgId}/invitations`, users.director, {
        role: 'participant',
        maxUses: 5,
      }),
    );
    await post(`/v1/invitations/${memberInvite.token}/redeem`, users.member);
    venueId = json(
      await post(`/v1/organisations/${orgId}/venues`, users.director, {
        name: 'Open Arena',
        timezone: 'Europe/London',
      }),
    ).id;
    for (let i = 1; i <= 8; i++)
      courtIds.push(
        json(await post(`/v1/venues/${venueId}/courts`, users.director, { code: String(i) })).id,
      );
  }, LONG);

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
      await db
        .deleteFrom('activities.session_series')
        .where('organisation_id', '=', orgId)
        .execute();
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
  }, LONG);

  it(
    'imports 32 teams with two players each from CSV',
    async () => {
      const rows = ['team,player,captain'];
      for (let t = 1; t <= 32; t++) {
        rows.push(`Team ${String(t).padStart(2, '0')} ${run},T${t} A ${run},yes`);
        rows.push(`"Team ${String(t).padStart(2, '0')} ${run}","T${t} B ${run}",`);
      }
      const res = await post(`/v1/organisations/${orgId}/teams/import`, users.director, {
        csv: rows.join('\n'),
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(json(res)).toMatchObject({
        teamsCreated: 32,
        teamsReused: 0,
        playersCreated: 64,
        rosterAdded: 64,
        errors: [],
      });
      // Re-import is idempotent.
      const again = json(
        await post(`/v1/organisations/${orgId}/teams/import`, users.director, {
          csv: rows.join('\n'),
        }),
      );
      expect(again).toMatchObject({ teamsCreated: 0, teamsReused: 32, playersCreated: 0 });

      const teams = json(await get(`/v1/organisations/${orgId}/teams`, users.director))
        .items as Array<{ id: string; name: string; captainParticipantId: string | null }>;
      expect(teams).toHaveLength(32);
      for (const t of teams) {
        const detail = json(await get(`/v1/teams/${t.id}`, users.director)) as {
          roster: { participantId: string }[];
        };
        expect(detail.roster).toHaveLength(2);
        roster.set(
          t.id,
          detail.roster.map((r) => r.participantId),
        );
        const seed = Number(/Team (\d+)/.exec(t.name)![1]);
        seedTeam.set(seed, t.id);
        expect(t.captainParticipantId).not.toBeNull();
      }
    },
    LONG,
  );

  it('creates a pools-into-knockout tournament with 8 pools and one court per pool', async () => {
    const comp = json(
      await post(`/v1/organisations/${orgId}/competitions`, users.director, {
        name: `Open ${run}`,
        type: 'tournament',
      }),
    );
    const season = await post(`/v1/competitions/${comp.id}/seasons`, users.director, {
      name: 'Autumn Open',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      rules: {
        scoring: { targetPoints: 21, winBy: 1 },
        rubberTemplate: [
          { key: 'd1', label: 'Doubles', format: 'doubles', eligibility: 'open', order: 1 },
        ],
        fixtureOutcome: { tieBreak: 'aggregate_points' },
        tournament: { format: 'pools_knockout', advancePerPool: 2, seeding: 'snake' },
      },
      divisions: Array.from({ length: 8 }, (_, i) => ({
        name: `Pool ${String.fromCharCode(65 + i)}`,
        capacity: 4,
      })),
    });
    expect(season.statusCode, season.body).toBe(201);
    seasonId = json(season).id;
    divisionIds.push(...json(season).divisions.map((d: { id: string }) => d.id));

    const meet = await post(`/v1/seasons/${seasonId}/meets`, users.director, {
      name: 'Finals day',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      venueId,
    });
    expect(meet.statusCode, meet.body).toBe(201);
    meetId = json(meet).id;
    expect(json(meet).format).toBe('pools_knockout');
    for (let d = 0; d < 8; d++) {
      const res = await put(
        `/v1/meets/${meetId}/divisions/${divisionIds[d]}/courts`,
        users.director,
        { courtIds: [courtIds[d]] },
      );
      expect(res.statusCode, res.body).toBe(200);
    }
  });

  it('draws 32 seeded entrants into the pools by snake seeding', async () => {
    const res = await put(`/v1/meets/${meetId}/entries`, users.director, {
      teams: [...seedTeam.entries()].map(([seed, teamId]) => ({ teamId, seed })),
    });
    expect(res.statusCode, res.body).toBe(200);
    const meet = MeetSchema.parse(json(res));
    expect(meet.divisions.every((d) => d.teams.length === 4)).toBe(true);
    const poolA = meet.divisions[0]!.teams.map((t) => seedOf(t.teamId)).sort((a, b) => a - b);
    expect(poolA).toEqual([1, 16, 17, 32]);
    const tooMany = await put(`/v1/meets/${meetId}/entries`, users.director, {
      teams: [...seedTeam.values(), randomUUID()].map((teamId) => ({ teamId })),
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it('publishes 48 pool fixtures and a 15-tie knockout skeleton', async () => {
    const preview = json(await post(`/v1/meets/${meetId}/fixtures/preview`, users.director));
    expect(preview.knockout).toMatchObject({ entrants: 16, rounds: 4, fixtures: 15 });
    expect(preview.totals).toEqual({ fixtures: 63, rubbers: 63 });
    const commit = await post(`/v1/meets/${meetId}/fixtures/commit`, users.director);
    expect(commit.statusCode, commit.body).toBe(200);
    const meet = MeetSchema.parse(json(commit));
    expect(meet.counts).toMatchObject({
      fixtures: 63,
      rubbers: 63,
      knockoutFixtures: 15,
      knockoutResolved: 0,
    });
    const all = await fixtures();
    expect(all.filter((f) => f.stage === 'pool')).toHaveLength(48);
    const ko = all.filter((f) => f.stage === 'knockout');
    expect(ko).toHaveLength(15);
    expect(ko.every((f) => f.home === null && f.away === null && f.bracket)).toBe(true);
    expect(ko.filter((f) => f.bracket!.round === 1)).toHaveLength(8);
    expect(ko.find((f) => f.bracket!.round === 4)!.bracket!.label).toBe('Final');
    expect(ko.every((f) => f.rubbers.length === 1)).toBe(true);
  });

  it(
    'two organisers calling the same court at once: exactly one succeeds; a team cannot be on two courts',
    async () => {
      const poolA = (await fixtures()).filter((f) => f.divisionId === divisionIds[0]);
      const round1 = poolA.filter((f) => f.roundNo === 1);
      expect(round1).toHaveLength(2);
      for (const f of round1) await lineups(f);
      const [a, b] = round1 as [Fixture, Fixture];
      const [ra, rb] = await Promise.all([
        post(`/v1/matches/${a.rubbers[0]!.matchId}/call`, users.director, {
          courtId: courtIds[0],
        }),
        post(`/v1/matches/${b.rubbers[0]!.matchId}/call`, users.director, {
          courtId: courtIds[0],
        }),
      ]);
      const codes = [ra.statusCode, rb.statusCode].sort();
      expect(codes).toEqual([200, 409]);
      const failed = ra.statusCode === 409 ? ra : rb;
      expect(json(failed).code).toBe('COURT_CONFLICT');
      const winnerFixture = ra.statusCode === 200 ? a : b;
      const loserFixture = ra.statusCode === 200 ? b : a;

      // A different pool's court is refused without an override reason, accepted with one.
      const refused = await post(
        `/v1/matches/${loserFixture.rubbers[0]!.matchId}/call`,
        users.director,
        {
          courtId: courtIds[7],
        },
      );
      expect(json(refused).code).toBe('COURT_CONFLICT');
      const overridden = await post(
        `/v1/matches/${loserFixture.rubbers[0]!.matchId}/call`,
        users.director,
        { courtId: courtIds[7], overrideReason: 'Pool H court is free, keeping things moving' },
      );
      expect(overridden.statusCode, overridden.body).toBe(200);

      // The same team's round-2 fixture cannot be called while its round-1 rubber is on court.
      const teamOnCourt = winnerFixture.home!.teamId;
      const round2 = poolA.find(
        (f) =>
          f.roundNo === 2 && (f.home!.teamId === teamOnCourt || f.away!.teamId === teamOnCourt),
      )!;
      await lineups(round2);
      const clash = await post(`/v1/matches/${round2.rubbers[0]!.matchId}/call`, users.director, {
        courtId: courtIds[0],
        overrideReason: 'testing the player check',
      });
      expect(json(clash).code).toMatch(/COURT_CONFLICT|PLAYER_CONFLICT/);
    },
    LONG,
  );

  it(
    'plays all 48 pool fixtures; the bracket fills itself with cross-pool round-one ties',
    async () => {
      let n = 0;
      for (let round = 1; round <= 3; round++) {
        const list = (await fixtures()).filter((f) => f.stage === 'pool' && f.roundNo === round);
        for (const f of list) {
          if (f.rubbers[0]!.result?.status === 'confirmed') continue;
          if (f.rubbers[0]!.sides[0]!.players.length === 0) await lineups(f);
          const court = f.rubbers[0]!.courtId ?? courtIds[divisionIds.indexOf(f.divisionId!)]!;
          const homeStronger = seedOf(f.home!.teamId) < seedOf(f.away!.teamId);
          await play(f, court, homeStronger, 3 + ((n * 7) % 11));
          n++;
        }
      }
      const standings = StandingsSchema.parse(
        json(await get(`/v1/meets/${meetId}/standings`, users.director)),
      );
      expect(standings.divisions.every((d) => d.pendingFixtures === 0)).toBe(true);
      expect(standings.divisions.every((d) => d.unresolvedTies.length === 0)).toBe(true);
      // Strength is transitive in this run, so pool winners are the lowest seeds.
      for (const d of standings.divisions)
        expect(seedOf(d.rows[0]!.teamId)).toBeLessThan(seedOf(d.rows[1]!.teamId));

      const meet = MeetSchema.parse(json(await get(`/v1/meets/${meetId}`, users.director)));
      expect(meet.counts.knockoutResolved).toBe(8);
      const r1 = (await fixtures()).filter((f) => f.stage === 'knockout' && f.bracket!.round === 1);
      const poolOf = (teamId: string) =>
        meet.divisions.find((d) => d.teams.some((t) => t.teamId === teamId))!.division.id;
      for (const f of r1) {
        expect(f.home && f.away).toBeTruthy();
        expect(poolOf(f.home!.teamId)).not.toBe(poolOf(f.away!.teamId));
      }
      const advance = KnockoutAdvanceSchema.parse(
        json(await post(`/v1/meets/${meetId}/knockout/advance`, users.director)),
      );
      expect(advance.resolved).toBe(0);
      expect(advance.pending.some((p) => /waiting/.test(p))).toBe(true);
    },
    LONG,
  );

  it(
    'plays the knockout to a final: seed 1 wins, every tie resolved from its feeders',
    async () => {
      for (let round = 1; round <= 4; round++) {
        const ties = (await fixtures()).filter(
          (f) => f.stage === 'knockout' && f.bracket!.round === round,
        );
        for (const f of ties) {
          expect(
            f.home && f.away,
            `round ${round} slot ${f.bracket!.slot} unresolved`,
          ).toBeTruthy();
          await lineups(f);
          const homeStronger = seedOf(f.home!.teamId) < seedOf(f.away!.teamId);
          await play(f, courtIds[(f.bracket!.slot - 1) % 8]!, homeStronger, 4);
        }
      }
      const final = (await fixtures()).find((f) => f.bracket?.round === 4)!;
      expect(final.status).toBe('completed');
      expect(final.winnerTeamId).toBe(seedTeam.get(1));
      const meet = MeetSchema.parse(json(await get(`/v1/meets/${meetId}`, users.director)));
      expect(meet.counts).toMatchObject({ completedFixtures: 63, knockoutResolved: 15 });

      // No court ever hosted two rubbers at once, and no player was in two rubbers at once.
      const courtOverlap = await sql<{ n: string }>`
        select count(*)::text as n
        from matches.matches a
        join matches.matches b on a.court_id = b.court_id and a.id < b.id
        join competition.fixtures fa on fa.id = a.fixture_id
        join competition.fixtures fb on fb.id = b.fixture_id
        where fa.meet_id = ${meetId}::uuid and fb.meet_id = ${meetId}::uuid
          and a.starts_at is not null and b.starts_at is not null
          and a.starts_at < coalesce(b.completed_at, now()) and b.starts_at < coalesce(a.completed_at, now())
      `.execute(db);
      expect(Number(courtOverlap.rows[0]!.n)).toBe(0);
      const playerOverlap = await sql<{ n: string }>`
        select count(*)::text as n
        from matches.match_side_players pa
        join matches.match_sides sa on sa.id = pa.match_side_id
        join matches.matches a on a.id = sa.match_id
        join matches.match_side_players pb on pb.participant_id = pa.participant_id
        join matches.match_sides sb on sb.id = pb.match_side_id
        join matches.matches b on b.id = sb.match_id and a.id < b.id
        join competition.fixtures fa on fa.id = a.fixture_id
        where fa.meet_id = ${meetId}::uuid
          and a.starts_at is not null and b.starts_at is not null
          and a.starts_at < coalesce(b.completed_at, now()) and b.starts_at < coalesce(a.completed_at, now())
      `.execute(db);
      expect(Number(playerOverlap.rows[0]!.n)).toBe(0);
    },
    LONG,
  );

  it('captain disputes a confirmed score; director upholds one and voids another', async () => {
    // Make the captain user captain of seed-1's team via their own participant record.
    const me = json(await get('/v1/me', users.captain)) as {
      participants: { organisationId: string; id: string }[];
    };
    const captainPid = me.participants.find((p) => p.organisationId === orgId)!.id;
    const team1 = seedTeam.get(1)!;
    const team = json(await get(`/v1/teams/${team1}`, users.director)) as { version: number };
    const upd = await patch(`/v1/teams/${team1}`, users.director, {
      captainParticipantId: captainPid,
    });
    expect(upd.statusCode, upd.body).toBe(200);
    void team;

    const mine = (await fixtures()).filter(
      (f) => f.stage === 'pool' && (f.home!.teamId === team1 || f.away!.teamId === team1),
    );
    const [first, second] = mine as [Fixture, Fixture];
    const r1 = first.rubbers[0]!;
    const noReason = await post(
      `/v1/matches/${r1.matchId}/results/${r1.result!.revision}/dispute`,
      users.captain,
    );
    expect(noReason.statusCode).toBe(400);
    const disputed = await post(
      `/v1/matches/${r1.matchId}/results/${r1.result!.revision}/dispute`,
      users.captain,
      { reason: 'Score entered the wrong way round' },
    );
    expect(disputed.statusCode, disputed.body).toBe(200);
    expect(FixtureSchema.parse(json(disputed)).status).toBe('needs_review');
    const standings = StandingsSchema.parse(
      json(await get(`/v1/meets/${meetId}/standings`, users.director)),
    );
    expect(
      standings.divisions.find((d) => d.divisionId === first.divisionId)!.pendingFixtures,
    ).toBe(1);
    const list = json(await get(`/v1/meets/${meetId}/disputes`, users.director)).items as {
      matchId: string;
      reason: string | null;
    }[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      matchId: r1.matchId,
      reason: 'Score entered the wrong way round',
    });
    const notDirector = await post(
      `/v1/matches/${r1.matchId}/results/${r1.result!.revision}/resolve`,
      users.captain,
      { decision: 'uphold', reason: 'captains cannot resolve' },
    );
    expect(notDirector.statusCode).toBe(403);
    const upheld = await post(
      `/v1/matches/${r1.matchId}/results/${r1.result!.revision}/resolve`,
      users.director,
      { decision: 'uphold', reason: 'Umpire card confirms the score' },
    );
    expect(upheld.statusCode, upheld.body).toBe(200);
    expect(FixtureSchema.parse(json(upheld)).status).toBe('completed');
    expect(json(await get(`/v1/meets/${meetId}/disputes`, users.director)).items).toHaveLength(0);

    // Void path: the rubber reopens and a fresh score is recorded as a new revision.
    const r2 = second.rubbers[0]!;
    await post(`/v1/matches/${r2.matchId}/results/${r2.result!.revision}/dispute`, users.captain, {
      reason: 'Wrong court sheet',
    });
    const voided = await post(
      `/v1/matches/${r2.matchId}/results/${r2.result!.revision}/resolve`,
      users.director,
      { decision: 'void', reason: 'Replayed from the sheet' },
    );
    expect(voided.statusCode, voided.body).toBe(200);
    const reopened = FixtureSchema.parse(json(voided)).rubbers[0]!;
    expect(reopened.state).toBe('in_progress');
    expect(reopened.result!.status).toBe('void');
    const replaced = await post(`/v1/matches/${r2.matchId}/results`, users.director, {
      games: [[21, 18]],
    });
    expect(replaced.statusCode, replaced.body).toBe(200);
    const after = FixtureSchema.parse(json(replaced));
    expect(after.rubbers[0]!.result).toMatchObject({
      status: 'confirmed',
      revision: r2.result!.revision + 1,
    });
    expect(after.status).toBe('completed');
  });

  it('public board is redacted, cached briefly, and disappears when disabled', async () => {
    const enabled = json(
      await post(`/v1/meets/${meetId}/public-access`, users.director, { enabled: true }),
    );
    expect(enabled.slug).toMatch(/^[a-z0-9]{10}$/);
    publicSlug = enabled.slug;
    const denied = await post(`/v1/meets/${meetId}/public-access`, users.member, {
      enabled: false,
    });
    expect(denied.statusCode).toBe(403);

    const board = await get(`/v1/public/events/${publicSlug}/board`);
    expect(board.statusCode, board.body).toBe(200);
    expect(board.headers['cache-control']).toContain('max-age=5');
    const parsed = PublicBoardSchema.parse(json(board));
    expect(parsed.kind).toBe('meet');
    if (parsed.kind !== 'meet') return;
    expect(parsed.divisions).toHaveLength(8);
    expect(parsed.knockout).toHaveLength(15);
    expect(parsed.knockout.find((k) => k.label === 'Final')!.winner).toBe(`Team 01 ${run}`);
    expect(board.body).not.toMatch(/T\d+ [AB] /); // no player names on a meet board
    expect(board.body).not.toContain(meetId);

    const summary = await get(`/v1/public/events/${publicSlug}`);
    expect(summary.statusCode).toBe(200);
    expect(json(summary)).toMatchObject({ kind: 'meet', viewer: null });

    await post(`/v1/meets/${meetId}/public-access`, users.director, { enabled: false });
    expect((await get(`/v1/public/events/${publicSlug}/board`)).statusCode).toBe(404);
  });

  it('exports the meet and standings as CSV', async () => {
    const csv = await get(`/v1/meets/${meetId}/export.csv`, users.director);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body.trim().split(/\r?\n/);
    expect(lines).toHaveLength(64);
    expect(lines[0]).toContain('stage,division,round,label,home,away');
    expect(lines.filter((l) => l.startsWith('knockout,'))).toHaveLength(15);
    const standings = await get(`/v1/meets/${meetId}/standings.csv`, users.director);
    expect(standings.statusCode).toBe(200);
    expect(standings.body.trim().split(/\r?\n/)).toHaveLength(33);
    expect((await get(`/v1/meets/${meetId}/export.csv`)).statusCode).toBe(401);
  });

  it('QR registration: a club member joins a session from its public code', async () => {
    const series = json(
      await post(`/v1/organisations/${orgId}/sessions`, users.director, {
        name: 'Open social',
        sportId: 'badminton',
        venueId,
        defaultRoundMinutes: 10,
      }),
    );
    const occ = await post(`/v1/sessions/${series.id}/occurrences`, users.director, {
      startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    expect(occ.statusCode, occ.body).toBe(201);
    occurrenceId = json(occ).id;
    const access = json(
      await post(`/v1/occurrences/${occurrenceId}/public-access`, users.director, {
        enabled: true,
      }),
    );
    sessionSlug = access.slug;
    expect(sessionSlug).toMatch(/^[a-z0-9]{10}$/);

    const anon = await get(`/v1/public/events/${sessionSlug}`);
    expect(json(anon)).toMatchObject({ kind: 'session', name: 'Open social', viewer: null });
    const asMember = json(await get(`/v1/public/events/${sessionSlug}`, users.member));
    expect(asMember.viewer).toMatchObject({ member: true, canJoin: true });

    const joined = await post(`/v1/public/events/${sessionSlug}/join`, users.member);
    expect(joined.statusCode, joined.body).toBe(200);
    expect(json(joined).attendanceStatus).toBe('registered');
    await post(`/v1/occurrences/${occurrenceId}/open`, users.director);
    const checkedIn = json(await post(`/v1/public/events/${sessionSlug}/join`, users.member));
    expect(checkedIn.attendanceStatus).toBe('checked_in');

    const stranger = randomUUID();
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${stranger}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`p4-stranger-${run}@example.com`}, '{}'::jsonb, '{}'::jsonb, now(), now())
    `.execute(db);
    try {
      const refused = await post(`/v1/public/events/${sessionSlug}/join`, stranger);
      expect(refused.statusCode).toBe(403);
    } finally {
      const prof = await db
        .selectFrom('identity.user_profiles')
        .select('id')
        .where('auth_user_id', '=', stranger)
        .executeTakeFirst();
      if (prof) await db.deleteFrom('identity.user_profiles').where('id', '=', prof.id).execute();
      await sql`delete from auth.users where id = ${stranger}::uuid`.execute(db);
    }

    const board = PublicBoardSchema.parse(
      json(await get(`/v1/public/events/${sessionSlug}/board`)),
    );
    expect(board.kind).toBe('session');
    if (board.kind === 'session') expect(board.playersHere).toBe(1);
    const csv = await get(`/v1/occurrences/${occurrenceId}/export.csv`, users.director);
    expect(csv.statusCode).toBe(200);
  });
});
