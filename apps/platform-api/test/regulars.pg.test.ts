import { randomUUID } from 'node:crypto';
import { PresetSchema, RegularSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/** Regulars on a preset (migration 13): registered automatically when the preset starts. */
describe.skipIf(!databaseUrl)('Session presets: regulars', () => {
  const run = randomUUID().slice(0, 8);
  const users = { solo: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let workspaceId = '';
  let seriesId = '';
  const players: string[] = [];

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const put = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'PUT', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, user: string) =>
    call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${users.solo}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`regulars-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: 'Regulars Organiser' })}::jsonb, now(), now())
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
    if (workspaceId) {
      await db
        .deleteFrom('activities.session_series')
        .where('organisation_id', '=', workspaceId)
        .execute();
      await db.deleteFrom('community.organisations').where('id', '=', workspaceId).execute();
    }
    const profile = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', '=', users.solo)
      .executeTakeFirst();
    if (profile) {
      await db
        .deleteFrom('platform.idempotency_keys')
        .where('scope', '=', `user:${profile.id}`)
        .execute();
      await db.deleteFrom('identity.user_profiles').where('id', '=', profile.id).execute();
    }
    await sql`delete from auth.users where id = ${users.solo}::uuid`.execute(db);
    await db.destroy();
  }, 120_000);

  it('sets regulars on a preset and counts them', async () => {
    workspaceId = json(await post('/v1/me/workspace', users.solo)).id;
    const series = await post(`/v1/organisations/${workspaceId}/sessions`, users.solo, {
      name: 'Thursday pickleball',
      sportId: 'pickleball',
    });
    expect(series.statusCode, series.body).toBe(201);
    seriesId = json(series).id;
    for (const name of ['Priya', 'Tom', 'Aisha', 'Raj', 'Mei'])
      players.push(
        json(
          await post(`/v1/organisations/${workspaceId}/participants`, users.solo, {
            displayName: name,
          }),
        ).id,
      );
    const saved = await put(`/v1/sessions/${seriesId}/regulars`, users.solo, {
      participantIds: players.slice(0, 4),
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const list = json(saved).items.map((r: unknown) => RegularSchema.parse(r));
    expect(list).toHaveLength(4);
    expect(list.map((r: { displayName: string }) => r.displayName)).toEqual([
      'Aisha',
      'Priya',
      'Raj',
      'Tom',
    ]);
    const preset = PresetSchema.parse(json(await get('/v1/me/presets', users.solo)).items[0]);
    expect(preset.regulars).toBe(4);
  });

  it('refuses a regular from another club', async () => {
    const res = await put(`/v1/sessions/${seriesId}/regulars`, users.solo, {
      participantIds: [randomUUID()],
    });
    expect(res.statusCode).toBe(400);
  });

  it('registers every regular when the preset starts, and only once', async () => {
    const started = await post(`/v1/sessions/${seriesId}/start`, users.solo, {});
    expect(started.statusCode, started.body).toBe(201);
    const occurrenceId = json(started).id;
    const board = json(await get(`/v1/occurrences/${occurrenceId}`, users.solo));
    const entries = json(await get(`/v1/occurrences/${occurrenceId}/participants`, users.solo))
      .items as {
      participantId: string;
      attendanceStatus: string;
    }[];
    expect(board.state).toBe('open');
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.attendanceStatus === 'registered')).toBe(true);
    expect(new Set(entries.map((e) => e.participantId))).toEqual(new Set(players.slice(0, 4)));
    // Mei was not a regular; the fifth player joins as a walk-in like before.
    const walkIn = await post(`/v1/occurrences/${occurrenceId}/participants`, users.solo, {
      participantId: players[4],
      checkIn: true,
    });
    expect(walkIn.statusCode, walkIn.body).toBe(201);
  });

  it('an empty list clears the regulars', async () => {
    const cleared = await put(`/v1/sessions/${seriesId}/regulars`, users.solo, {
      participantIds: [],
    });
    expect(cleared.statusCode).toBe(200);
    expect(json(cleared).items).toEqual([]);
  });
});
