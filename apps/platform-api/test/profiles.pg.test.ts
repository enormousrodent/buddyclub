import { randomUUID } from 'node:crypto';
import { MyProfileSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Addendum 1.3 step 1 (migration 15): a person's own buddy profile. Activities with level and
 * days, gear, visibility switches that stay off, 18+ before Find me, and an onboarded mark per
 * app.
 */
describe.skipIf(!databaseUrl)('Buddy profile', () => {
  const run = randomUUID().slice(0, 8);
  const user = randomUUID();
  let db: Db;
  let app: FastifyInstance;

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const put = async (url: string, payload: unknown) =>
    call({ method: 'PUT', url, headers: await bearer(user), payload: payload as object });
  const patch = async (url: string, payload: unknown) =>
    call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string) => call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 2 });
    await pingDb(db);
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${user}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`profile-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: 'Profile Pat' })}::jsonb, now(), now())
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
    const profile = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', '=', user)
      .executeTakeFirst();
    if (profile) {
      await db
        .deleteFrom('platform.idempotency_keys')
        .where('scope', '=', `user:${profile.id}`)
        .execute();
      await db.deleteFrom('identity.user_profiles').where('id', '=', profile.id).execute();
    }
    await sql`delete from auth.users where id = ${user}::uuid`.execute(db);
    await db.destroy();
  }, 120_000);

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

  it('keeps activities with level and days; a sport is its own activity', async () => {
    const saved = await put('/v1/me/activities', {
      activities: [
        {
          interestId: 'racket_sports',
          sportId: 'tennis',
          level: 'comfortable',
          days: { mon: ['evening'], sat: ['morning', 'afternoon'] },
        },
        { interestId: 'racket_sports', sportId: 'pickleball' },
        { interestId: 'books', level: 'expert', note: 'Mostly crime' },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const profile = MyProfileSchema.parse(json(saved));
    expect(profile.activities.map((a) => a.sportName ?? a.interestName)).toEqual([
      'Pickleball',
      'Tennis',
      'Books',
    ]);
    const tennis = profile.activities.find((a) => a.sportId === 'tennis')!;
    expect(tennis).toMatchObject({
      level: 'comfortable',
      days: { mon: ['evening'], sat: ['morning', 'afternoon'] },
    });
    expect(profile.activities.find((a) => a.sportId === 'pickleball')).toMatchObject({
      level: null,
      days: {},
    });

    // Dropping pickleball and re-sending tennis without days keeps tennis's days.
    const again = await put('/v1/me/activities', {
      activities: [
        { interestId: 'racket_sports', sportId: 'tennis', level: 'strong' },
        { interestId: 'books' },
      ],
    });
    expect(again.statusCode, again.body).toBe(200);
    const after = MyProfileSchema.parse(json(again));
    expect(after.activities).toHaveLength(2);
    expect(after.activities.find((a) => a.sportId === 'tennis')).toMatchObject({
      id: tennis.id,
      level: 'strong',
      days: { mon: ['evening'], sat: ['morning', 'afternoon'] },
    });

    expect(
      (await put('/v1/me/activities', { activities: [{ interestId: 'knitting' }] })).statusCode,
    ).toBe(400);
    expect(
      (
        await put('/v1/me/activities', {
          activities: [{ interestId: 'racket_sports', sportId: 'polo' }],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await put('/v1/me/activities', {
          activities: [{ interestId: 'books', days: { mon: ['midnight'] } }],
        })
      ).statusCode,
    ).toBe(400);
  });

  it('keeps a gear list in order', async () => {
    const saved = await put('/v1/me/gear', {
      items: [
        {
          interestId: 'racket_sports',
          sportId: 'tennis',
          name: 'Babolat Pure Drive',
          detail: '2023',
        },
        { interestId: 'books', name: 'Kindle Paperwhite' },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const profile = MyProfileSchema.parse(json(saved));
    expect(profile.gear.map((g) => [g.name, g.sortOrder])).toEqual([
      ['Babolat Pure Drive', 0],
      ['Kindle Paperwhite', 1],
    ]);
    expect(
      (await put('/v1/me/gear', { items: [{ interestId: 'nope', name: 'x' }] })).statusCode,
    ).toBe(400);
  });

  it('place and bio save; Find me needs 18+; each app marks its own onboarding', async () => {
    const about = await patch('/v1/me/profile', {
      locality: 'Winchester',
      bio: 'Weeknight tennis.',
    });
    expect(about.statusCode, about.body).toBe(200);
    expect(json(about)).toMatchObject({ locality: 'Winchester', bio: 'Weeknight tennis.' });

    const tooSoon = await patch('/v1/me/profile', { discoverable: true });
    expect(tooSoon.statusCode).toBe(409);

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
