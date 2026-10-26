import { randomUUID } from 'node:crypto';
import { JoinRequestSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Ask to join (migration 19): a stranger asks through a public invitation-only session, the
 * organiser sees it in the inbox and on the club, approval makes a member and a regular,
 * decline does not; open sessions and private ones cannot be asked about.
 */
describe.skipIf(!databaseUrl)('Join requests', () => {
  const run = randomUUID().slice(0, 8);
  const users = { owner: randomUUID(), asker: randomUUID(), other: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId = '';
  let inviteOnlyId = '';
  let openId = '';
  let requestId = '';

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, user: string) =>
    call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`jr-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `JR ${name}` })}::jsonb, now(), now())
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
      name: `Ask Padel ${run}`,
      slug: `ask-padel-${run}`,
    });
    expect(org.statusCode, org.body).toBe(201);
    orgId = json(org).id;
    for (const [name, body] of [
      ['invite', { visibility: 'public', joinPolicy: 'invite' }],
      ['open', { visibility: 'public', joinPolicy: 'open' }],
    ] as const) {
      const created = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
        name: `${name} ${run}`,
        sportId: 'padel',
        ...body,
      });
      expect(created.statusCode, created.body).toBe(201);
      if (name === 'invite') inviteOnlyId = json(created).id;
      else openId = json(created).id;
    }
    await call({
      method: 'PUT',
      url: '/v1/me/activities',
      headers: await bearer(users.asker),
      payload: { activities: [{ activityId: 'padel', level: 'comfortable' }] },
    });
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

  it('a stranger asks once; the organiser sees it with their sports', async () => {
    expect((await post(`/v1/sessions/${openId}/join-requests`, users.asker)).statusCode).toBe(409);
    const asked = await post(`/v1/sessions/${inviteOnlyId}/join-requests`, users.asker, {
      note: 'Mondays suit me',
    });
    expect(asked.statusCode, asked.body).toBe(201);
    const request = JoinRequestSchema.parse(json(asked));
    requestId = request.id;
    expect(request).toMatchObject({
      organisationId: orgId,
      seriesId: inviteOnlyId,
      displayName: 'JR asker',
      note: 'Mondays suit me',
      status: 'pending',
      sports: [{ activityName: 'Padel', level: 'comfortable' }],
    });
    const again = await post(`/v1/sessions/${inviteOnlyId}/join-requests`, users.asker);
    expect(again.statusCode).toBe(200);
    expect(json(again).id).toBe(requestId);

    expect(json(await get('/v1/me/join-requests', users.asker)).items).toHaveLength(1);
    expect((await get(`/v1/organisations/${orgId}/join-requests`, users.asker)).statusCode).toBe(
      403,
    );
    expect(json(await get(`/v1/organisations/${orgId}/join-requests`, users.owner)).items).toEqual([
      expect.objectContaining({ id: requestId }),
    ]);
    expect(json(await get('/v1/me/join-requests/inbox', users.owner)).items).toEqual([
      expect.objectContaining({ id: requestId }),
    ]);
    expect(json(await get('/v1/me/join-requests/inbox', users.asker)).items).toEqual([]);
  });

  it('approval makes a member and a regular; decline leaves nothing behind', async () => {
    const approved = await post(
      `/v1/organisations/${orgId}/join-requests/${requestId}/approve`,
      users.owner,
    );
    expect(approved.statusCode, approved.body).toBe(200);
    expect(json(approved).status).toBe('approved');
    const me = json(await get('/v1/me', users.asker));
    expect(
      me.memberships.find((m: { organisationId: string }) => m.organisationId === orgId),
    ).toMatchObject({ role: 'participant' });
    const regulars = json(await get(`/v1/sessions/${inviteOnlyId}/regulars`, users.owner)).items;
    expect(regulars.map((r: { displayName: string }) => r.displayName)).toEqual(['JR asker']);
    // Decided: cannot be decided twice; a member cannot ask again.
    expect(
      (await post(`/v1/organisations/${orgId}/join-requests/${requestId}/decline`, users.owner))
        .statusCode,
    ).toBe(404);
    expect((await post(`/v1/sessions/${inviteOnlyId}/join-requests`, users.asker)).statusCode).toBe(
      409,
    );

    const second = await post(`/v1/sessions/${inviteOnlyId}/join-requests`, users.other);
    expect(second.statusCode).toBe(201);
    const declined = await post(
      `/v1/organisations/${orgId}/join-requests/${json(second).id}/decline`,
      users.owner,
    );
    expect(declined.statusCode, declined.body).toBe(200);
    expect(json(declined).status).toBe('declined');
    const other = json(await get('/v1/me', users.other));
    expect(
      other.memberships.some((m: { organisationId: string }) => m.organisationId === orgId),
    ).toBe(false);
    expect(json(await get('/v1/me/join-requests/inbox', users.owner)).items).toEqual([]);
    // Declined, so they may ask again.
    expect((await post(`/v1/sessions/${inviteOnlyId}/join-requests`, users.other)).statusCode).toBe(
      201,
    );
  });
});
