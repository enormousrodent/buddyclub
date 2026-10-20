import { randomUUID } from 'node:crypto';
import {
  BoardSchema,
  MyScheduleSchema,
  OccurrenceSchema,
  RotationPreviewSchema,
  RoundSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

/**
 * Phase 2 against Postgres: a social night from open to rounds, with a walk-in, a partner lock,
 * a withdrawal mid-session and concurrent-commit protection.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!databaseUrl)('Phase 2: social session rotation', () => {
  const run = randomUUID().slice(0, 8);
  const users = { organiser: randomUUID(), player: randomUUID(), outsider: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId: string;
  let venueId: string;
  let seriesId: string;
  let occurrenceId: string;
  const guests: string[] = [];

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
    payload?: unknown,
    headers: Record<string, string> = {},
  ) =>
    call({
      method: 'POST',
      url,
      headers: { ...(await bearer(user)), ...headers },
      payload: payload ?? {},
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
                ${`p2-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `P2 ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    const built = await createTestApp({
      repo: new PgIdentityRepository(db),
      db,
      idempotencyStore: new PgIdempotencyStore(db),
    });
    app = built.app;

    // Club with a venue and two courts, organiser plus one member player.
    const org = json(
      await post('/v1/organisations', users.organiser, { name: `Rotation Club ${run}` }),
    );
    orgId = org.id;
    const invite = json(
      await post(`/v1/organisations/${orgId}/invitations`, users.organiser, {
        role: 'participant',
        maxUses: 5,
      }),
    );
    await post(`/v1/invitations/${invite.token}/redeem`, users.player);
    const venue = json(
      await post(`/v1/organisations/${orgId}/venues`, users.organiser, {
        name: 'Hall',
        timezone: 'Europe/London',
      }),
    );
    venueId = venue.id;
    for (const code of ['1', '2'])
      await post(`/v1/venues/${venueId}/courts`, users.organiser, { code });
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (orgId) {
      // Participants with round history are protected (on delete restrict); remove sessions first.
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
  });

  it('creates a session and schedules an occurrence with the venue courts', async () => {
    const created = await post(`/v1/organisations/${orgId}/sessions`, users.organiser, {
      name: 'Tuesday Social',
      sportId: 'badminton',
      venueId,
      defaultRoundMinutes: 10,
      rules: { rotation: { candidates: 120 } },
    });
    expect(created.statusCode).toBe(201);
    seriesId = json(created).id;

    const startsAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const occ = await post(`/v1/sessions/${seriesId}/occurrences`, users.organiser, { startsAt });
    expect(occ.statusCode).toBe(201);
    const dto = OccurrenceSchema.parse(json(occ));
    expect(dto.state).toBe('draft');
    expect(dto.courts.map((c) => c.code)).toEqual(['1', '2']);
    expect(dto.roundDurationSeconds).toBe(600);
    expect((dto.rules['rotation'] as { candidates: number }).candidates).toBe(120);
    occurrenceId = dto.id;

    const outsider = await get(`/v1/occurrences/${occurrenceId}`, users.outsider);
    expect(outsider.statusCode).toBe(403);
  });

  it('opens the session, adds walk-ins by name and lets the member check themselves in', async () => {
    expect((await post(`/v1/occurrences/${occurrenceId}/open`, users.organiser)).statusCode).toBe(
      200,
    );

    for (let i = 1; i <= 10; i++) {
      const res = await post(`/v1/occurrences/${occurrenceId}/participants`, users.organiser, {
        displayName: `Walk-in ${i}`,
      });
      expect(res.statusCode).toBe(201);
      guests.push(json(res).participantId);
      expect(json(res).attendanceStatus).toBe('checked_in');
    }
    const self = await post(`/v1/occurrences/${occurrenceId}/check-ins`, users.player, {});
    expect(self.statusCode).toBe(200);
    expect(json(self).attendanceStatus).toBe('checked_in');

    const occ = OccurrenceSchema.parse(
      json(await get(`/v1/occurrences/${occurrenceId}`, users.organiser)),
    );
    expect(occ.counts.checkedIn).toBe(11);
  });

  it('locks two partners, previews a fair round and commits it', async () => {
    const lock = await post(`/v1/occurrences/${occurrenceId}/pair-locks`, users.organiser, {
      participantA: guests[0],
      participantB: guests[1],
    });
    expect(lock.statusCode).toBe(201);

    const preview = RotationPreviewSchema.parse(
      json(
        await post(`/v1/occurrences/${occurrenceId}/rotations/preview`, users.organiser, {
          seed: 'test-seed',
        }),
      ),
    );
    expect(preview.sequenceNo).toBe(1);
    expect(preview.assignments).toHaveLength(2);
    expect(preview.resting).toHaveLength(3);
    expect(preview.warnings).toEqual([]);
    const together = preview.assignments.some((a) =>
      a.teams.some(
        (t) =>
          t.map((p) => p.participantId).includes(guests[0]!) &&
          t.map((p) => p.participantId).includes(guests[1]!),
      ),
    );
    const bothRest =
      preview.resting.map((p) => p.participantId).includes(guests[0]!) &&
      preview.resting.map((p) => p.participantId).includes(guests[1]!);
    expect(together || bothRest).toBe(true);

    const commit = await post(`/v1/occurrences/${occurrenceId}/rotations/commit`, users.organiser, {
      previewId: preview.previewId,
    });
    expect(commit.statusCode).toBe(201);
    const round = RoundSchema.parse(json(commit));
    expect(round.status).toBe('published');
    expect(round.assignments.map((a) => a.courtCode).sort()).toEqual(['1', '2']);
    expect(round.assignments.every((a) => a.matchId !== null)).toBe(true);
  });

  it('rejects a stale preview after the roster changed (two organisers cannot commit divergent rounds)', async () => {
    // Start round 1 so a second round can be previewed.
    const board1 = BoardSchema.parse(
      json(await get(`/v1/occurrences/${occurrenceId}/board`, users.organiser)),
    );
    const roundId = board1.currentRound!.id;
    expect((await post(`/v1/rounds/${roundId}/start`, users.organiser)).statusCode).toBe(200);

    const previewA = RotationPreviewSchema.parse(
      json(await post(`/v1/occurrences/${occurrenceId}/rotations/preview`, users.organiser)),
    );
    expect(previewA.sequenceNo).toBe(2);
    // Roster changes under organiser A's feet: a new walk-in arrives.
    const late = await post(`/v1/occurrences/${occurrenceId}/participants`, users.organiser, {
      displayName: 'Late Larry',
    });
    guests.push(json(late).participantId);

    const stale = await post(`/v1/occurrences/${occurrenceId}/rotations/commit`, users.organiser, {
      previewId: previewA.previewId,
    });
    expect(stale.statusCode).toBe(409);
    expect(json(stale).code).toBe('VERSION_CONFLICT');

    const previewB = RotationPreviewSchema.parse(
      json(await post(`/v1/occurrences/${occurrenceId}/rotations/preview`, users.organiser)),
    );
    expect(previewB.resting.map((p) => p.displayName)).not.toContain('Late Larry'); // late arrival plays first
    const commit = await post(`/v1/occurrences/${occurrenceId}/rotations/commit`, users.organiser, {
      previewId: previewB.previewId,
    });
    expect(commit.statusCode).toBe(201);

    const dup = await post(`/v1/occurrences/${occurrenceId}/rotations/commit`, users.organiser, {
      previewId: previewB.previewId,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('runs the server-side timer and exposes the board and personal schedule', async () => {
    const board = BoardSchema.parse(
      json(await get(`/v1/occurrences/${occurrenceId}/board`, users.player)),
    );
    expect(board.occurrence.state).toBe('live');
    expect(board.currentRound?.status).toBe('in_progress');
    expect(board.currentRound?.timer.remainingSeconds).toBeGreaterThan(500);
    expect(board.nextRound?.status).toBe('published');

    const mine = MyScheduleSchema.parse(
      json(await get(`/v1/occurrences/${occurrenceId}/my-schedule`, users.player)),
    );
    expect(mine.attendanceStatus).toBe('checked_in');
    expect(mine.current).not.toBeNull();
    if (mine.current && !mine.current.resting) {
      expect(mine.current.courtCode).toMatch(/^[12]$/);
      expect(mine.current.partners).toHaveLength(1);
      expect(mine.current.opponents).toHaveLength(2);
    }

    const roundId = board.currentRound!.id;
    expect(json(await post(`/v1/rounds/${roundId}/pause`, users.organiser)).status).toBe('paused');
    expect(json(await post(`/v1/rounds/${roundId}/resume`, users.organiser)).status).toBe(
      'in_progress',
    );
    const nextStartTooEarly = await post(
      `/v1/rounds/${board.nextRound!.id}/start`,
      users.organiser,
    );
    expect(nextStartTooEarly.statusCode).toBe(409);
    const done = RoundSchema.parse(
      json(await post(`/v1/rounds/${roundId}/complete`, users.organiser)),
    );
    expect(done.status).toBe('completed');
    expect(done.timer.remainingSeconds).toBe(0);
  });

  it('withdraws a player mid-session: history stays, the pending round is reset', async () => {
    const board = BoardSchema.parse(
      json(await get(`/v1/occurrences/${occurrenceId}/board`, users.organiser)),
    );
    const pending = board.currentRound!; // published round 2 (not started)
    expect(pending.status).toBe('published');
    const victim = pending.assignments[0]!.teams[0]![0]!.participantId;

    const res = await post(
      `/v1/occurrences/${occurrenceId}/participants/${victim}/withdraw`,
      users.organiser,
      { reason: 'injury' },
    );
    expect(res.statusCode).toBe(200);
    expect(json(res).cancelledRoundIds).toEqual([pending.id]);
    expect(json(res).entry.attendanceStatus).toBe('left');

    const after = BoardSchema.parse(
      json(await get(`/v1/occurrences/${occurrenceId}/board`, users.organiser)),
    );
    expect(after.completedRounds).toBe(1);
    expect(after.currentRound?.status).toBe('completed'); // round 1 history intact
    const round1 = await db
      .selectFrom('activities.round_assignments')
      .select('id')
      .where('round_id', '=', after.currentRound!.id)
      .execute();
    expect(round1).toHaveLength(11);

    const preview = RotationPreviewSchema.parse(
      json(await post(`/v1/occurrences/${occurrenceId}/rotations/preview`, users.organiser)),
    );
    expect(preview.sequenceNo).toBe(3);
    const everyone = [
      ...preview.assignments.flatMap((a) => a.teams.flat()),
      ...preview.resting,
    ].map((p) => p.participantId);
    expect(everyone).not.toContain(victim);
    expect(everyone).toHaveLength(11); // 12 checked in minus the one who left
  });

  it('issues a session-scoped guest link that only shows that guest their own view', async () => {
    const guestId = guests[2]!;
    const grant = json(
      await post(
        `/v1/occurrences/${occurrenceId}/participants/${guestId}/guest-grants`,
        users.organiser,
        {},
      ),
    );
    const session = json(
      await call({
        method: 'POST',
        url: '/v1/guest-access/redeem',
        payload: { token: grant.token },
      }),
    );
    const schedule = await call({
      method: 'GET',
      url: '/v1/guest/schedule',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(schedule.statusCode).toBe(200);
    const parsed = MyScheduleSchema.parse(json(schedule));
    expect(parsed.participant.participantId).toBe(guestId);
    expect(parsed.occurrence.id).toBe(occurrenceId);

    const notForGuests = await call({
      method: 'GET',
      url: `/v1/occurrences/${occurrenceId}/board`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(notForGuests.statusCode).toBe(401);
  });

  it('lists upcoming sessions for a member and completes the night', async () => {
    const mine = json(await get('/v1/me/sessions', users.player));
    expect(
      mine.items.some(
        (s: { occurrenceId: string; canManage: boolean }) =>
          s.occurrenceId === occurrenceId && s.canManage === false,
      ),
    ).toBe(true);
    const organiserView = json(await get('/v1/me/sessions', users.organiser));
    expect(
      organiserView.items.find((s: { occurrenceId: string }) => s.occurrenceId === occurrenceId)
        ?.canManage,
    ).toBe(true);

    const done = await post(`/v1/occurrences/${occurrenceId}/complete`, users.organiser);
    expect(done.statusCode).toBe(200);
    expect(json(done).state).toBe('completed');

    const events = await db
      .selectFrom('platform.outbox_events')
      .select('event_type')
      .where('aggregate_id', 'in', [occurrenceId])
      .execute();
    expect(events.map((e) => e.event_type)).toEqual(
      expect.arrayContaining(['session.occurrence_opened', 'participant.withdrawn']),
    );
  });
});
