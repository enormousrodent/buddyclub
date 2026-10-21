import { randomUUID } from 'node:crypto';
import { BoardSchema, PresetSchema, SessionSeriesSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Addendum 1.2 step 1 (migration 14): a session has a weekly schedule and hosts. A host is a
 * plain member who may set up and run any night; the owner can switch hosting off; two hosts
 * setting up the same night share it.
 */
describe.skipIf(!databaseUrl)('Sessions: schedule and hosts', () => {
  const run = randomUUID().slice(0, 8);
  const users = { owner: randomUUID(), host: randomUUID(), player: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId = '';
  let groupId = '';
  let seriesId = '';
  let nextAt = '';
  let nightId = '';
  const profiles: Record<string, string> = {};

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const put = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'PUT', url, headers: await bearer(user), payload: payload as object });
  const patch = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, user: string) =>
    call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`hosts-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `Hosts ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    app = (
      await createTestApp({
        repo: new PgIdentityRepository(db),
        db,
        idempotencyStore: new PgIdempotencyStore(db),
      })
    ).app;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (orgId) {
      await db
        .deleteFrom('activities.session_series')
        .where('organisation_id', '=', orgId)
        .execute();
      await db.deleteFrom('community.organisations').where('id', '=', orgId).execute();
    }
    const rows = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', 'in', Object.values(users))
      .execute();
    const ids = rows.map((p) => p.id);
    if (ids.length) {
      await db
        .deleteFrom('platform.idempotency_keys')
        .where(
          'scope',
          'in',
          ids.map((id) => `user:${id}`),
        )
        .execute();
      await db.deleteFrom('identity.user_profiles').where('id', 'in', ids).execute();
    }
    await sql`delete from auth.users where id = any(${Object.values(users)}::uuid[])`.execute(db);
    await db.destroy();
  }, 120_000);

  it('a club with two plain members and a scheduled session', async () => {
    const group = await post('/v1/community/groups', users.owner, {
      name: `Monday Pickleball ${run}`,
      interestIds: ['sports'],
      sportId: 'pickleball',
    });
    expect(group.statusCode, group.body).toBe(201);
    groupId = json(group).id;
    orgId = json(group).organisationId;
    for (const u of [users.host, users.player]) {
      const joined = await post(`/v1/community/groups/${groupId}/join`, u);
      expect(joined.statusCode, joined.body).toBe(200);
    }
    for (const [name, id] of Object.entries(users)) {
      profiles[name] = json(await get('/v1/me', id)).profile.id;
    }

    const created = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
      name: 'Monday Pickleball',
      sportId: 'pickleball',
      schedule: { weekday: 1, time: '19:30', timezone: 'Europe/London' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const series = SessionSeriesSchema.parse(json(created));
    seriesId = series.id;
    expect(series).toMatchObject({
      schedule: { weekday: 1, time: '19:30', timezone: 'Europe/London' },
      checkInWindowMinutes: 10,
      hostsEnabled: true,
      canRun: true,
      canEdit: true,
    });
    expect(series.nextAt).not.toBeNull();
    nextAt = series.nextAt as string;
    const next = new Date(nextAt);
    expect(next.getTime()).toBeGreaterThan(Date.now() - 2 * 3600 * 1000);
    expect(
      next.toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    ).toMatch(/^Mon,? 19:30$/);

    const bad = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
      name: 'Nowhere',
      sportId: 'pickleball',
      schedule: { weekday: 1, time: '19:30', timezone: 'Mars/Olympus_Mons' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('a plain member cannot set up a night until made a host; only organisers set hosts', async () => {
    const refused = await post(`/v1/sessions/${seriesId}/start`, users.host, { startsAt: nextAt });
    expect(refused.statusCode).toBe(403);

    const notAllowed = await put(`/v1/sessions/${seriesId}/hosts`, users.host, {
      profileIds: [profiles['host']],
    });
    expect(notAllowed.statusCode).toBe(403);

    const stranger = await put(`/v1/sessions/${seriesId}/hosts`, users.owner, {
      profileIds: [randomUUID()],
    });
    expect(stranger.statusCode).toBe(400);

    const saved = await put(`/v1/sessions/${seriesId}/hosts`, users.owner, {
      profileIds: [profiles['host']],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(json(saved).items).toHaveLength(1);
    expect(json(saved).items[0]).toMatchObject({ profileId: profiles['host'] });

    const asHost = SessionSeriesSchema.parse(
      json(await get(`/v1/sessions/${seriesId}`, users.host)),
    );
    expect(asHost).toMatchObject({ canRun: true, canEdit: false });
    const presets = json(await get('/v1/me/presets', users.host)).items.map((p: unknown) =>
      PresetSchema.parse(p),
    );
    expect(presets.map((p: { seriesId: string }) => p.seriesId)).toContain(seriesId);
    expect(presets.find((p: { seriesId: string }) => p.seriesId === seriesId)).toMatchObject({
      asHost: true,
      hosts: 1,
      nextAt,
    });
    const notHost = json(await get('/v1/me/presets', users.player)).items;
    expect(notHost).toHaveLength(0);
  });

  it('the host sets up the next night; the owner setting up the same night gets the same one', async () => {
    const setUp = await post(`/v1/sessions/${seriesId}/start`, users.host, { startsAt: nextAt });
    expect(setUp.statusCode, setUp.body).toBe(201);
    nightId = json(setUp).id;
    expect(json(setUp)).toMatchObject({ state: 'open', startsAt: nextAt });

    const again = await post(`/v1/sessions/${seriesId}/start`, users.owner, { startsAt: nextAt });
    expect(again.statusCode, again.body).toBe(200);
    expect(json(again).id).toBe(nightId);

    const board = BoardSchema.parse(
      json(await get(`/v1/occurrences/${nightId}/board`, users.host)),
    );
    expect(board.canManage).toBe(true);
    const playerBoard = BoardSchema.parse(
      json(await get(`/v1/occurrences/${nightId}/board`, users.player)),
    );
    expect(playerBoard.canManage).toBe(false);

    const presets = json(await get('/v1/me/presets', users.owner)).items.map((p: unknown) =>
      PresetSchema.parse(p),
    );
    const mine = presets.find((p: { seriesId: string }) => p.seriesId === seriesId);
    // Set up days ahead: upcoming, not live.
    expect(mine).toMatchObject({ upcomingOccurrenceId: nightId, activeOccurrenceId: null });

    // Hosts run the night: a walk-in added by the host, refused for the plain member.
    const walkIn = await post(`/v1/occurrences/${nightId}/participants`, users.host, {
      displayName: 'Walk-in Wendy',
    });
    expect(walkIn.statusCode, walkIn.body).toBe(201);
    const refused = await post(`/v1/occurrences/${nightId}/participants`, users.player, {
      displayName: 'Nope',
    });
    expect(refused.statusCode).toBe(403);

    // Everyone in the club sees the scheduled session in "upcoming"; only runners may set it up.
    const forPlayer = json(await get('/v1/me/scheduled-sessions', users.player)).items;
    expect(forPlayer).toHaveLength(1);
    expect(forPlayer[0]).toMatchObject({
      seriesId,
      nextAt,
      nextOccurrenceId: nightId,
      canRun: false,
    });
    const forHost = json(await get('/v1/me/scheduled-sessions', users.host)).items;
    expect(forHost[0]).toMatchObject({ seriesId, canRun: true, nextOccurrenceId: nightId });
  });

  it('switching hosts off takes the ability away without losing the list', async () => {
    const series = json(await get(`/v1/sessions/${seriesId}`, users.owner));
    const off = await patch(`/v1/sessions/${seriesId}`, users.owner, { hostsEnabled: false });
    expect(off.statusCode, off.body).toBe(200);
    expect(json(off).hostsEnabled).toBe(false);
    expect(series.version).toBeLessThan(json(off).version);

    const refused = await post(`/v1/occurrences/${nightId}/participants`, users.host, {
      displayName: 'Still me',
    });
    expect(refused.statusCode).toBe(403);
    expect(json(await get(`/v1/sessions/${seriesId}/hosts`, users.owner)).items).toHaveLength(1);
    expect(json(await get(`/v1/sessions/${seriesId}`, users.host))).toMatchObject({
      canRun: false,
      canEdit: false,
    });

    const cleared = await patch(`/v1/sessions/${seriesId}`, users.owner, { schedule: null });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(json(cleared)).toMatchObject({ schedule: null, nextAt: null });
  });
});
