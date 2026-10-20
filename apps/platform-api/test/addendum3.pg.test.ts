import { randomUUID } from 'node:crypto';
import { ActivitySchema, DiscoverResultSchema, GroupCardSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

/**
 * Addendum 1.1 criterion 4 and ADR-018: a book club, a dog-walking group and a parent-and-toddler
 * group exist without sport, court, rating or match schema; they are discoverable, joinable and
 * take RSVPs; a Rally-run gathering keeps one attendance ledger.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!databaseUrl)('Addendum 1.1 step 3: general community model', () => {
  const run = randomUUID().slice(0, 8);
  const users = { host: randomUUID(), joiner: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  const orgIds: string[] = [];
  let bookClubId = '';
  let dogWalkId = '';
  let privateGroupId = '';
  let readingId = '';
  let rallyOrgId = '';
  let occurrenceId = '';
  let padelActivityId = '';

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string | null, payload: unknown = {}) =>
    call({
      method: 'POST',
      url,
      headers: user ? await bearer(user) : {},
      payload: payload as object,
    });
  const get = async (url: string, user?: string) =>
    call({ method: 'GET', url, headers: user ? await bearer(user) : {} });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`a3-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `A3 ${name}` })}::jsonb, now(), now())
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
    for (const orgId of orgIds) {
      await db.deleteFrom('community.activities').where('organisation_id', '=', orgId).execute();
      await db
        .deleteFrom('activities.session_series')
        .where('organisation_id', '=', orgId)
        .execute();
      await db.deleteFrom('community.organisations').where('id', '=', orgId).execute();
    }
    const profiles = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', 'in', Object.values(users))
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
    await sql`delete from auth.users where id = any(${Object.values(users)}::uuid[])`.execute(db);
    await db.destroy();
  }, 120_000);

  it('lists interests publicly, sports among many', async () => {
    const res = await get('/v1/interests');
    expect(res.statusCode).toBe(200);
    const ids = (json(res).items as { id: string }[]).map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(['books', 'dog_walking', 'parent_toddler', 'sports']),
    );
  });

  it('creates a book club, a dog-walking group and a private toddler group with no sport', async () => {
    const book = await post('/v1/community/groups', users.host, {
      name: `Page Turners ${run}`,
      description: 'Monthly reads at the Wykeham Arms',
      interestIds: ['books'],
      locality: 'Winchester',
    });
    expect(book.statusCode, book.body).toBe(201);
    const card = GroupCardSchema.parse(json(book));
    expect(card).toMatchObject({
      sportId: null,
      visibility: 'public',
      joinPolicy: 'open',
      memberCount: 1,
    });
    expect(card.interests.map((i) => i.id)).toEqual(['books']);
    bookClubId = card.id;
    orgIds.push(card.organisationId);

    const dogs = json(
      await post('/v1/community/groups', users.host, {
        name: `Winchester Dog Walkers ${run}`,
        interestIds: ['dog_walking', 'walking'],
        locality: 'Winchester',
        organisationId: card.organisationId,
      }),
    );
    dogWalkId = dogs.id;
    expect(dogs.organisationId).toBe(card.organisationId);

    const toddlers = await post('/v1/community/groups', users.host, {
      name: `Toddlers at the Arc ${run}`,
      interestIds: ['parent_toddler', 'families'],
      visibility: 'private',
      joinPolicy: 'invite',
      organisationId: card.organisationId,
    });
    expect(toddlers.statusCode, toddlers.body).toBe(201);
    privateGroupId = json(toddlers).id;

    const bad = await post('/v1/community/groups', users.host, {
      name: 'x',
      interestIds: ['nope'],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('discovery finds public groups and gatherings by interest and text; private ones stay hidden', async () => {
    const reading = await post(`/v1/community/groups/${bookClubId}/activities`, users.host, {
      title: `October read: Orbital ${run}`,
      startsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      locationName: 'The Wykeham Arms',
      capacity: 2,
    });
    expect(reading.statusCode, reading.body).toBe(201);
    readingId = json(reading).id;
    await post(`/v1/community/groups/${privateGroupId}/activities`, users.host, {
      title: `Toddler morning ${run}`,
      startsAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const all = DiscoverResultSchema.parse(json(await get(`/v1/public/discover?q=${run}`)));
    expect(all.groups.map((g) => g.id)).toEqual(expect.arrayContaining([bookClubId, dogWalkId]));
    expect(all.groups.map((g) => g.id)).not.toContain(privateGroupId);
    expect(all.activities.map((a) => a.id)).toEqual([readingId]);
    expect(all.activities[0]).toMatchObject({ goingCount: 0, capacity: 2, poweredByRally: false });

    const dogs = DiscoverResultSchema.parse(
      json(await get(`/v1/public/discover?interest=dog_walking&locality=winch`)),
    );
    expect(dogs.groups.map((g) => g.id)).toContain(dogWalkId);
    expect(dogs.groups.map((g) => g.id)).not.toContain(bookClubId);

    const anon = await get(`/v1/community/groups/${privateGroupId}`);
    expect(anon.statusCode).toBe(404);
    const pub = await get(`/v1/community/groups/${bookClubId}`);
    expect(pub.statusCode).toBe(200);
    expect(json(pub).myRole).toBeNull();
    expect(json(pub).activities).toHaveLength(1);
  });

  it('a stranger joins the open group and RSVPs; capacity is enforced; private groups refuse', async () => {
    const joined = await post(`/v1/community/groups/${bookClubId}/join`, users.joiner);
    expect(joined.statusCode, joined.body).toBe(200);
    expect(json(joined)).toMatchObject({ role: 'member', memberCount: 2 });
    const me = json(await get('/v1/me', users.joiner));
    expect(me.memberships[0]).toMatchObject({ organisationId: orgIds[0], role: 'participant' });

    const going = await post(`/v1/community/activities/${readingId}/rsvp`, users.joiner, {
      status: 'going',
    });
    expect(going.statusCode, going.body).toBe(200);
    expect(ActivitySchema.parse(json(going))).toMatchObject({ goingCount: 1, myRsvp: 'going' });
    await post(`/v1/community/activities/${readingId}/rsvp`, users.host, { status: 'going' });
    // Capacity 2 is now full: a third account is refused.
    const third = randomUUID();
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${third}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`a3-third-${run}@example.com`}, '{}'::jsonb, '{}'::jsonb, now(), now())
    `.execute(db);
    try {
      const full = await post(`/v1/community/activities/${readingId}/rsvp`, third, {
        status: 'going',
      });
      expect(full.statusCode).toBe(409);
      const maybe = await post(`/v1/community/activities/${readingId}/rsvp`, third, {
        status: 'maybe',
      });
      expect(maybe.statusCode, maybe.body).toBe(200);
      expect(json(maybe).maybeCount).toBe(1);
      const refused = await post(`/v1/community/groups/${privateGroupId}/join`, third);
      expect(refused.statusCode).toBe(403);
    } finally {
      const prof = await db
        .selectFrom('identity.user_profiles')
        .select('id')
        .where('auth_user_id', '=', third)
        .executeTakeFirst();
      if (prof) {
        await db
          .deleteFrom('platform.idempotency_keys')
          .where('scope', '=', `user:${prof.id}`)
          .execute();
        await db.deleteFrom('identity.user_profiles').where('id', '=', prof.id).execute();
      }
      await sql`delete from auth.users where id = ${third}::uuid`.execute(db);
    }
    const mine = json(await get('/v1/me/community', users.joiner));
    expect(mine.groups.map((g: { id: string }) => g.id)).toEqual([bookClubId]);
    expect(mine.upcoming.map((a: { id: string }) => a.id)).toEqual([readingId]);
  });

  it('a Rally-run gathering: RSVP going registers on the session, Rally owns the count', async () => {
    const club = json(await post('/v1/organisations', users.host, { name: `Padel Club ${run}` }));
    rallyOrgId = club.id;
    orgIds.push(rallyOrgId);
    const series = json(
      await post(`/v1/organisations/${rallyOrgId}/sessions`, users.host, {
        name: 'Padel social',
        sportId: 'padel',
        defaultRoundMinutes: 10,
      }),
    );
    occurrenceId = json(
      await post(`/v1/sessions/${series.id}/occurrences`, users.host, {
        startsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      }),
    ).id;
    const padel = json(
      await post('/v1/community/groups', users.host, {
        name: `Padel night ${run}`,
        interestIds: ['racket_sports'],
        sportId: 'padel',
        organisationId: rallyOrgId,
      }),
    );
    const activity = await post(`/v1/community/groups/${padel.id}/activities`, users.host, {
      title: `Padel social ${run}`,
      startsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      rallyOccurrenceId: occurrenceId,
    });
    expect(activity.statusCode, activity.body).toBe(201);
    padelActivityId = json(activity).id;
    expect(json(activity).rally).toMatchObject({ occurrenceId, state: 'draft' });
    const twice = await post(`/v1/community/groups/${padel.id}/activities`, users.host, {
      title: 'dup',
      startsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      rallyOccurrenceId: occurrenceId,
    });
    expect(twice.statusCode).toBe(409);

    const going = ActivitySchema.parse(
      json(
        await post(`/v1/community/activities/${padelActivityId}/rsvp`, users.joiner, {
          status: 'going',
        }),
      ),
    );
    expect(going.goingCount).toBe(1);
    expect(going.rally?.myAttendance).toBe('registered');
    const board = json(await get(`/v1/occurrences/${occurrenceId}`, users.host));
    expect(board.counts.entries).toBe(1);
    const discover = DiscoverResultSchema.parse(json(await get(`/v1/public/discover?q=${run}`)));
    expect(discover.activities.find((a) => a.id === padelActivityId)).toMatchObject({
      poweredByRally: true,
      goingCount: 1,
    });

    const out = ActivitySchema.parse(
      json(
        await post(`/v1/community/activities/${padelActivityId}/rsvp`, users.joiner, {
          status: 'not_going',
        }),
      ),
    );
    expect(out.goingCount).toBe(0);
    expect(out.rally?.myAttendance).toBe('left');

    const cancelled = await post(`/v1/community/activities/${padelActivityId}/cancel`, users.host);
    expect(json(cancelled).state).toBe('cancelled');
    expect(
      (
        await post(`/v1/community/activities/${padelActivityId}/rsvp`, users.joiner, {
          status: 'going',
        })
      ).statusCode,
    ).toBe(409);
  });
});
