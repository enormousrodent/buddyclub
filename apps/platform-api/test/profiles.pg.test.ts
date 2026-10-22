import { randomUUID } from 'node:crypto';
import { CATALOGUE, MyProfileSchema, SuggestionResultSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Addendum 1.3 step 1 and the activity catalogue (migrations 15 and 16): a person's own buddy
 * profile. Activities from the catalogue with per-ladder levels and days, gear, suggestions,
 * visibility switches that stay off, 18+ before Find me, and an onboarded mark per app.
 */
describe.skipIf(!databaseUrl)('Buddy profile', () => {
  const run = randomUUID().slice(0, 8);
  const user = randomUUID();
  const other = randomUUID();
  let db: Db;
  let app: FastifyInstance;

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const put = async (url: string, payload: unknown, who = user) =>
    call({ method: 'PUT', url, headers: await bearer(who), payload: payload as object });
  const post = async (url: string, payload: unknown, who = user) =>
    call({ method: 'POST', url, headers: await bearer(who), payload: payload as object });
  const patch = async (url: string, payload: unknown) =>
    call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, who = user) =>
    call({ method: 'GET', url, headers: await bearer(who) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 2 });
    await pingDb(db);
    for (const [id, name] of [
      [user, 'Profile Pat'],
      [other, 'Profile Sam'],
    ] as const)
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`profile-${id.slice(0, 8)}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: name })}::jsonb, now(), now())
      `.execute(db);
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
    const profiles = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', 'in', [user, other])
      .execute();
    const ids = profiles.map((p) => p.id);
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
    await sql`delete from auth.users where id = any(${[user, other]}::uuid[])`.execute(db);
    await db.destroy();
  }, 120_000);

  it('the table holds every catalogue activity and category (no drift)', async () => {
    const sports = await db
      .selectFrom('community.sports')
      .select(['id', 'name', 'category_id'])
      .execute();
    const byId = new Map(sports.map((s) => [s.id, s]));
    for (const a of CATALOGUE.activities) {
      expect(byId.get(a.id), a.id).toMatchObject({ name: a.name, category_id: a.category });
    }
    const interests = new Set(
      (await db.selectFrom('community.interests').select('id').execute()).map((i) => i.id),
    );
    for (const c of CATALOGUE.categories) expect(interests.has(c.id), c.id).toBe(true);
    const racket = json(await get('/v1/sports?category=racket_sports')).items as { id: string }[];
    expect(racket.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'tennis',
        'badminton',
        'pickleball',
        'padel',
        'squash',
        'table_tennis',
      ]),
    );
    expect(racket.some((s) => s.id === 'books')).toBe(false);
  });

  it('starts empty, private, and not onboarded in either app', async () => {
    const profile = MyProfileSchema.parse(json(await get('/v1/me/profile')));
    expect(profile).toMatchObject({
      displayName: 'Profile Pat',
      locality: null,
      discoverable: false,
      showGear: false,
      adultConfirmed: false,
      onboarded: { buddyclub: false, rally: false },
      activities: [],
      gear: [],
    });
  });

  it('keeps activities with a level from each ladder and days', async () => {
    const saved = await put('/v1/me/activities', {
      activities: [
        {
          activityId: 'tennis',
          level: 'comfortable',
          days: { mon: ['evening'], sat: ['morning', 'afternoon'] },
        },
        { activityId: 'pickleball' },
        { activityId: 'gym', level: 'most_weeks' },
        { activityId: 'golf', level: '18' },
        { activityId: 'scuba', level: 'Rescue' },
        { activityId: 'books', note: 'Mostly crime' },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const profile = MyProfileSchema.parse(json(saved));
    expect(profile.activities.map((a) => a.activityId).sort()).toEqual(
      ['books', 'golf', 'gym', 'pickleball', 'scuba', 'tennis'].sort(),
    );
    const tennis = profile.activities.find((a) => a.activityId === 'tennis')!;
    expect(tennis).toMatchObject({
      interestId: 'racket_sports',
      activityName: 'Tennis',
      level: 'comfortable',
      days: { mon: ['evening'], sat: ['morning', 'afternoon'] },
    });
    expect(profile.activities.find((a) => a.activityId === 'golf')).toMatchObject({
      interestId: 'target_sports',
      level: '18',
    });

    // Re-sending tennis without days keeps them; dropping pickleball removes it.
    const again = await put('/v1/me/activities', {
      activities: [
        { activityId: 'tennis', level: 'strong' },
        { activityId: 'gym' },
        { activityId: 'golf' },
        { activityId: 'scuba' },
        { activityId: 'books' },
      ],
    });
    expect(again.statusCode, again.body).toBe(200);
    const after = MyProfileSchema.parse(json(again));
    expect(after.activities).toHaveLength(5);
    expect(after.activities.find((a) => a.activityId === 'tennis')).toMatchObject({
      id: tennis.id,
      level: 'strong',
      days: { mon: ['evening'], sat: ['morning', 'afternoon'] },
    });

    // Ladders are enforced per activity, but a stored level re-sent unchanged is never refused,
    // even after the ladder moved (walking went from skill words to pace).
    await sql`update identity.profile_activities set level = 'comfortable'
      where profile_id = (select id from identity.user_profiles where auth_user_id = ${user}::uuid)
        and sport_id = 'gym'`.execute(db);
    const stale = await put('/v1/me/activities', {
      activities: [
        { activityId: 'tennis' },
        { activityId: 'gym', level: 'comfortable' },
        { activityId: 'golf' },
        { activityId: 'scuba' },
        { activityId: 'books' },
      ],
    });
    expect(stale.statusCode, stale.body).toBe(200);
    expect(
      (
        await put('/v1/me/activities', {
          activities: [{ activityId: 'gym', level: 'comfortable' }],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await put('/v1/me/activities', { activities: [{ activityId: 'gym', level: 'strong' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put('/v1/me/activities', { activities: [{ activityId: 'walking', level: 'expert' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put('/v1/me/activities', { activities: [{ activityId: 'golf', level: '60' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put('/v1/me/activities', { activities: [{ activityId: 'books', level: 'expert' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put('/v1/me/activities', { activities: [{ activityId: 'knitting_zzz' }] })).statusCode,
    ).toBe(400);
    expect(
      (await put('/v1/me/activities', { activities: [{ activityId: 'other' }] })).statusCode,
    ).toBe(400);
    expect(
      (
        await put('/v1/me/activities', {
          activities: [{ activityId: 'books', days: { mon: ['midnight'] } }],
        })
      ).statusCode,
    ).toBe(400);
  });

  it('a typed name is matched to the catalogue, or stored as a suggestion with a count', async () => {
    const hit = SuggestionResultSchema.parse(
      json(await post('/v1/me/activity-suggestions', { name: 'ping pong' })),
    );
    expect(hit).toMatchObject({ matched: { id: 'table_tennis' }, count: 0, suggested: null });

    const name = `Underwater hockey ${run}`;
    const miss = SuggestionResultSchema.parse(
      json(await post('/v1/me/activity-suggestions', { name })),
    );
    expect(miss).toMatchObject({ matched: null, count: 1, suggested: name });
    // Asking twice does not count twice; a second person does.
    expect(
      json(await post('/v1/me/activity-suggestions', { name: name.toUpperCase() })).count,
    ).toBe(1);
    expect(json(await post('/v1/me/activity-suggestions', { name }, other)).count).toBe(2);
    expect(
      json(await get(`/v1/activity-suggestions/count?name=${encodeURIComponent(name)}`)).count,
    ).toBe(2);

    // It is on the profile as "other" under that name, and survives a picker save.
    let profile = MyProfileSchema.parse(json(await get('/v1/me/profile')));
    const mine = profile.activities.find((a) => a.activityId === 'other')!;
    expect(mine).toMatchObject({ customName: name, activityName: name, interestId: 'other' });
    const saved = await put('/v1/me/activities', {
      activities: [
        { activityId: 'tennis' },
        { activityId: 'other', customName: name, level: null },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    profile = MyProfileSchema.parse(json(saved));
    expect(profile.activities.map((a) => a.activityId).sort()).toEqual(['other', 'tennis']);
  });

  it('keeps a gear list in order', async () => {
    const saved = await put('/v1/me/gear', {
      items: [
        { activityId: 'tennis', name: 'Babolat Pure Drive', detail: '2023' },
        { activityId: 'books', name: 'Kindle Paperwhite' },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const profile = MyProfileSchema.parse(json(saved));
    expect(profile.gear.map((g) => [g.name, g.sortOrder, g.interestId])).toEqual([
      ['Babolat Pure Drive', 0, 'racket_sports'],
      ['Kindle Paperwhite', 1, 'books'],
    ]);
    expect(
      (await put('/v1/me/gear', { items: [{ activityId: 'nope', name: 'x' }] })).statusCode,
    ).toBe(400);
  });

  it('place and bio save; Find me needs 18+; each app marks its own onboarding', async () => {
    const about = await patch('/v1/me/profile', {
      locality: 'Winchester',
      bio: 'Weeknight tennis.',
    });
    expect(about.statusCode, about.body).toBe(200);
    expect(json(about)).toMatchObject({ locality: 'Winchester', bio: 'Weeknight tennis.' });

    expect((await patch('/v1/me/profile', { discoverable: true })).statusCode).toBe(409);
    const on = await patch('/v1/me/profile', {
      discoverable: true,
      adultConfirmed: true,
      showGear: true,
    });
    expect(on.statusCode, on.body).toBe(200);
    expect(json(on)).toMatchObject({ discoverable: true, adultConfirmed: true, showGear: true });

    const bc = await patch('/v1/me/profile', { onboarded: 'buddyclub' });
    expect(json(bc).onboarded).toEqual({ buddyclub: true, rally: false });
    const rally = await patch('/v1/me/profile', { onboarded: 'rally' });
    expect(json(rally).onboarded).toEqual({ buddyclub: true, rally: true });

    const off = await patch('/v1/me/profile', { discoverable: false });
    expect(json(off)).toMatchObject({ discoverable: false, adultConfirmed: true });
    expect((await patch('/v1/me/profile', {})).statusCode).toBe(400);
  });
});
