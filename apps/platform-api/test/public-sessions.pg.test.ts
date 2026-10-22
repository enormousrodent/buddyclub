import { randomUUID } from 'node:crypto';
import { PublicSessionCardSchema, SessionSeriesSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Addendum 1.5 (migration 18): the session is the group. A public session is listed for anyone;
 * an open one can be joined by a stranger, who becomes a club member and a regular; private and
 * invitation-only sessions are not.
 */
describe.skipIf(!databaseUrl)('Public sessions', () => {
  const run = randomUUID().slice(0, 8);
  const users = { owner: randomUUID(), stranger: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId = '';
  let openId = '';
  let inviteId = '';

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const patch = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, user?: string) =>
    call({ method: 'GET', url, headers: user ? await bearer(user) : {} });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`pub-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `Pub ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    app = (
      await createTestApp({
        repo: new PgIdentityRepository(db),
        db,
        idempotencyStore: new PgIdempotencyStore(db),
      })
    ).app;
    const org = await post('/v1/organisations', users.owner, {
      name: `Public Padel ${run}`,
      slug: `public-padel-${run}`,
    });
    expect(org.statusCode, org.body).toBe(201);
    orgId = json(org).id;
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

  it('a session is private and invitation-only unless the organiser says otherwise', async () => {
    const created = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
      name: `Tuesday Padel ${run}`,
      sportId: 'padel',
      schedule: { weekday: 2, time: '19:00', timezone: 'Europe/London' },
    });
    expect(created.statusCode, created.body).toBe(201);
    inviteId = json(created).id;
    expect(SessionSeriesSchema.parse(json(created))).toMatchObject({
      visibility: 'private',
      joinPolicy: 'invite',
      locality: null,
    });
    const listed = json(await get(`/v1/public/sessions?q=${run}`)).items;
    expect(listed).toEqual([]);
    expect((await post(`/v1/sessions/${inviteId}/join`, users.stranger)).statusCode).toBe(403);

    const made = await patch(`/v1/sessions/${inviteId}`, users.owner, {
      visibility: 'public',
      locality: 'Basingstoke',
    });
    expect(made.statusCode, made.body).toBe(200);
    expect(json(made)).toMatchObject({ visibility: 'public', joinPolicy: 'invite' });
    // Public but invitation only: seen, not joinable.
    const seen = json(await get(`/v1/public/sessions?q=${run}`)).items.map((s: unknown) =>
      PublicSessionCardSchema.parse(s),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id: inviteId,
      organisationName: `Public Padel ${run}`,
      sportName: 'Padel',
      locality: 'Basingstoke',
      joinPolicy: 'invite',
      regulars: 0,
      schedule: { weekday: 2, time: '19:00' },
    });
    expect(seen[0].nextAt).not.toBeNull();
    expect((await post(`/v1/sessions/${inviteId}/join`, users.stranger)).statusCode).toBe(403);
  });

  it('a public open session can be found by place and sport and joined by a stranger', async () => {
    const created = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
      name: `Sunday Social ${run}`,
      sportId: 'padel',
      visibility: 'public',
      joinPolicy: 'open',
      locality: 'Winchester',
    });
    expect(created.statusCode, created.body).toBe(201);
    openId = json(created).id;

    const byPlace = json(await get(`/v1/public/sessions?q=${run}&locality=winch`)).items;
    expect(byPlace.map((s: { id: string }) => s.id)).toEqual([openId]);
    expect(json(await get(`/v1/public/sessions?q=${run}&sport=tennis`)).items).toEqual([]);
    expect(json(await get(`/v1/public/sessions?q=${run}&sport=padel`)).items).toHaveLength(2);

    const before = json(await get('/v1/me', users.stranger));
    expect(
      before.memberships.some((m: { organisationId: string }) => m.organisationId === orgId),
    ).toBe(false);
    const joined = await post(`/v1/sessions/${openId}/join`, users.stranger);
    expect(joined.statusCode, joined.body).toBe(200);
    expect(json(joined).id).toBe(openId);
    const after = json(await get('/v1/me', users.stranger));
    expect(
      after.memberships.find((m: { organisationId: string }) => m.organisationId === orgId),
    ).toMatchObject({ role: 'participant' });
    const regulars = json(await get(`/v1/sessions/${openId}/regulars`, users.owner)).items;
    expect(regulars).toHaveLength(1);
    expect(regulars[0].displayName).toBe('Pub stranger');
    // Joining twice changes nothing.
    expect((await post(`/v1/sessions/${openId}/join`, users.stranger)).statusCode).toBe(200);
    expect(json(await get(`/v1/sessions/${openId}/regulars`, users.owner)).items).toHaveLength(1);
    expect(json(await get(`/v1/public/sessions?q=${run}&locality=winch`)).items[0].regulars).toBe(
      1,
    );
  });
});
