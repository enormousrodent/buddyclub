import { randomUUID } from 'node:crypto';
import { BuddyCardSchema, BuddySummarySchema, HelloSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Addendum 1.4 steps 3 and 5 (migration 17): buddies are the people you have checked in with;
 * Say hi is once per direction; a block hides both ways and is never disclosed; Find me only
 * works between adults who switched it on; a club record starts from the self-rated level.
 */
describe.skipIf(!databaseUrl)('Buddies', () => {
  const run = randomUUID().slice(0, 8);
  const users = { owner: randomUUID(), p1: randomUUID(), p2: randomUUID(), p3: randomUUID() };
  const profiles: Record<string, string> = {};
  const participants: Record<string, string> = {};
  let db: Db;
  let app: FastifyInstance;
  let orgId = '';
  let seriesId = '';
  let nightId = '';

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const put = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'PUT', url, headers: await bearer(user), payload: payload as object });
  const patch = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
  const del = async (url: string, user: string) =>
    call({ method: 'DELETE', url, headers: await bearer(user) });
  const get = async (url: string, user: string) =>
    call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`buddies-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `Buddy ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    app = (
      await createTestApp({
        repo: new PgIdentityRepository(db),
        db,
        idempotencyStore: new PgIdempotencyStore(db),
      })
    ).app;

    // p1 rates themselves before joining anything, so the club record can be seeded from it.
    expect(
      (
        await put('/v1/me/activities', users.p1, {
          activities: [{ activityId: 'pickleball', level: 'strong' }],
        })
      ).statusCode,
    ).toBe(200);

    const group = await post('/v1/community/groups', users.owner, {
      name: `Thursday Pickleball ${run}`,
      interestIds: ['sports'],
      sportId: 'pickleball',
    });
    expect(group.statusCode, group.body).toBe(201);
    orgId = json(group).organisationId;
    for (const u of [users.p1, users.p2, users.p3])
      expect((await post(`/v1/community/groups/${json(group).id}/join`, u)).statusCode).toBe(200);
    for (const [name, id] of Object.entries(users)) {
      const me = json(await get('/v1/me', id));
      profiles[name] = me.profile.id;
      participants[name] = me.participants.find(
        (p: { organisationId: string }) => p.organisationId === orgId,
      ).id;
    }
    const series = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
      name: 'Thursday Pickleball',
      sportId: 'pickleball',
    });
    expect(series.statusCode, series.body).toBe(201);
    seriesId = json(series).id;
  }, 180_000);

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
    const ids = Object.values(profiles);
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

  it('a club record starts from the self-rated level; nobody is a buddy before a night', async () => {
    const p1 = json(await get(`/v1/organisations/${orgId}/participants`, users.owner)).items.find(
      (p: { id: string }) => p.id === participants['p1'],
    );
    expect(p1.skillRating).toBe(65);
    const p2 = json(await get(`/v1/organisations/${orgId}/participants`, users.owner)).items.find(
      (p: { id: string }) => p.id === participants['p2'],
    );
    expect(p2.skillRating).toBeNull();

    expect(json(await get('/v1/me/buddies', users.p1)).items).toEqual([]);
    // Not a buddy and not findable: the card does not exist for p1.
    expect((await get(`/v1/buddies/${profiles['p2']}`, users.p1)).statusCode).toBe(404);
    expect((await get(`/v1/buddies/${profiles['p1']}`, users.p1)).statusCode).toBe(404);
  });

  it('checking in together makes buddies; not turning up does not', async () => {
    const started = await post(`/v1/sessions/${seriesId}/start`, users.owner, {});
    expect(started.statusCode, started.body).toBe(201);
    nightId = json(started).id;
    for (const u of [users.owner, users.p1, users.p2])
      expect((await post(`/v1/occurrences/${nightId}/check-ins`, u, {})).statusCode).toBe(200);
    // p3 never turns up.

    const mine = json(await get('/v1/me/buddies', users.p1)).items.map((b: unknown) =>
      BuddySummarySchema.parse(b),
    );
    expect(mine.map((b: { profileId: string }) => b.profileId).sort()).toEqual(
      [profiles['owner'], profiles['p2']].sort(),
    );
    const p2 = mine.find((b: { profileId: string }) => b.profileId === profiles['p2'])!;
    expect(p2).toMatchObject({
      displayName: 'Buddy p2',
      sharedNights: 1,
      hello: { sent: false, received: false },
    });
    expect(p2.lastPlayedAt).not.toBeNull();
    expect(json(await get('/v1/me/buddies', users.p3)).items).toEqual([]);

    const card = BuddyCardSchema.parse(json(await get(`/v1/buddies/${profiles['p1']}`, users.p2)));
    expect(card).toMatchObject({
      relationship: 'buddy',
      sharedNights: 1,
      blocked: false,
      gear: null,
      sports: [{ activityId: 'pickleball', level: 'strong' }],
    });
    expect(card.activities[0]).toMatchObject({ activityId: 'pickleball', level: 'strong' });
  });

  it('say hi once; the other side sees it, and reading marks it seen', async () => {
    const hi = await post(`/v1/buddies/${profiles['p2']}/hello`, users.p1);
    expect(hi.statusCode, hi.body).toBe(200);
    expect(json(hi).hello).toEqual({ sent: true, received: false });
    expect(json(await post(`/v1/buddies/${profiles['p2']}/hello`, users.p1)).hello.sent).toBe(true);

    const inbox = json(await get('/v1/me/hellos', users.p2)).items.map((h: unknown) =>
      HelloSchema.parse(h),
    );
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      from: { profileId: profiles['p1'], displayName: 'Buddy p1' },
      sharedNights: 1,
      seenAt: null,
    });
    expect(json(await get('/v1/me/hellos', users.p2)).items[0].seenAt).not.toBeNull();
    expect(json(await get(`/v1/buddies/${profiles['p1']}`, users.p2)).hello).toEqual({
      sent: false,
      received: true,
    });
    // Strangers cannot say hi.
    expect((await post(`/v1/buddies/${profiles['p3']}/hello`, users.p1)).statusCode).toBe(404);
  });

  it('a block hides both ways and is not disclosed; unblock restores', async () => {
    const blocked = await post(`/v1/buddies/${profiles['owner']}/block`, users.p1);
    expect(blocked.statusCode, blocked.body).toBe(200);
    expect(json(blocked).blocked).toBe(true);
    expect(
      json(await get('/v1/me/buddies', users.p1)).items.map(
        (b: { profileId: string }) => b.profileId,
      ),
    ).toEqual([profiles['p2']]);
    expect(
      json(await get('/v1/me/buddies', users.owner)).items.map(
        (b: { profileId: string }) => b.profileId,
      ),
    ).toEqual([profiles['p2']]);
    expect((await get(`/v1/buddies/${profiles['p1']}`, users.owner)).statusCode).toBe(404);
    expect((await post(`/v1/buddies/${profiles['owner']}/hello`, users.p1)).statusCode).toBe(409);

    const unblocked = await del(`/v1/buddies/${profiles['owner']}/block`, users.p1);
    expect(unblocked.statusCode, unblocked.body).toBe(200);
    expect(json(unblocked)).toMatchObject({ blocked: false, relationship: 'buddy' });
    expect(json(await get('/v1/me/buddies', users.owner)).items).toHaveLength(2);

    const report = await post(`/v1/buddies/${profiles['owner']}/report`, users.p1, {
      reason: 'Test report, ignore',
    });
    expect(report.statusCode, report.body).toBe(204);
    const stored = await db
      .selectFrom('identity.buddy_reports')
      .select('reason')
      .where('reporter_id', '=', profiles['p1']!)
      .execute();
    expect(stored).toHaveLength(1);
  });

  it('Find me works only between adults who switched it on, and never across a block', async () => {
    // p3 has never played with p1. Nobody can search until findable themselves.
    expect((await get('/v1/buddies/search?sport=pickleball', users.p1)).statusCode).toBe(409);
    for (const u of [users.p1, users.p3])
      expect(
        (await patch('/v1/me/profile', u, { discoverable: true, adultConfirmed: true })).statusCode,
      ).toBe(200);
    await put('/v1/me/activities', users.p3, {
      activities: [{ activityId: 'pickleball', level: 'comfortable', days: { tue: ['evening'] } }],
    });
    await patch('/v1/me/profile', users.p3, { locality: 'Winchester' });

    // The dev database has other findable people; only this run's accounts are asserted on.
    const ours = new Set(Object.values(profiles));
    const find = async (qs: string, who = users.p1) =>
      json(await get(`/v1/buddies/search?${qs}`, who)).items.filter((b: { profileId: string }) =>
        ours.has(b.profileId),
      );
    const found = await find('sport=pickleball');
    expect(found.map((b: { profileId: string }) => b.profileId)).toEqual([profiles['p3']]);
    expect(found[0]).toMatchObject({ sharedNights: 0, locality: 'Winchester' });
    expect(await find('sport=pickleball&level=strong')).toEqual([]);
    expect(await find('sport=pickleball&day=tue&slot=evening')).toHaveLength(1);
    expect(await find('sport=pickleball&day=tue&slot=morning')).toEqual([]);
    expect(await find('locality=winch')).toHaveLength(1);
    // p2 never switched Find me on, so p2 is not found and cannot search.
    expect((await get('/v1/buddies/search', users.p2)).statusCode).toBe(409);

    const card = json(await get(`/v1/buddies/${profiles['p3']}`, users.p1));
    expect(card).toMatchObject({ relationship: 'found', sharedNights: 0 });
    expect((await post(`/v1/buddies/${profiles['p3']}/hello`, users.p1)).statusCode).toBe(200);

    expect((await post(`/v1/buddies/${profiles['p1']}/block`, users.p3)).statusCode).toBe(200);
    expect(await find('sport=pickleball')).toEqual([]);
    expect((await get(`/v1/buddies/${profiles['p3']}`, users.p1)).statusCode).toBe(404);
    expect(json(await get('/v1/me/hellos', users.p3)).items).toEqual([]);
  });
});
