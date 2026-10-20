import { randomUUID } from 'node:crypto';
import { MeResponseSchema, MySessionSchema, PresetSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

/**
 * Addendum 1.1 acceptance criterion 1: a Rally-only user with no club, group or membership signs
 * in, starts a session, adds unauthenticated guests and runs round 1. Plus the Rally home read
 * models (presets, live summary) and the rule that personal workspaces take no invitations.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!databaseUrl)('Addendum 1.1 step 1: Rally without a club', () => {
  const run = randomUUID().slice(0, 8);
  const users = { solo: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let workspaceId = '';
  let seriesId = '';
  let occurrenceId = '';

  const call = (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
  const post = async (url: string, user: string, payload: unknown = {}) =>
    call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
  const get = async (url: string, user: string) =>
    call({ method: 'GET', url, headers: await bearer(user) });

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${users.solo}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`a1-solo-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: 'Solo Organiser' })}::jsonb, now(), now())
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

  it('a brand-new account has no memberships and no presets', async () => {
    const me = MeResponseSchema.parse(json(await get('/v1/me', users.solo)));
    expect(me.memberships).toEqual([]);
    expect(json(await get('/v1/me/presets', users.solo)).items).toEqual([]);
    expect(json(await get('/v1/me/sessions', users.solo)).items).toEqual([]);
  });

  it('gets a personal workspace on first call, idempotently, hidden as kind personal', async () => {
    const first = await post('/v1/me/workspace', users.solo);
    expect(first.statusCode, first.body).toBe(200);
    workspaceId = json(first).id;
    expect(json(first)).toMatchObject({ kind: 'personal', myRole: 'org_admin' });
    const again = json(await post('/v1/me/workspace', users.solo));
    expect(again.id).toBe(workspaceId);
    const me = MeResponseSchema.parse(json(await get('/v1/me', users.solo)));
    expect(me.memberships).toHaveLength(1);
    expect(me.memberships[0]).toMatchObject({
      organisationId: workspaceId,
      organisationKind: 'personal',
    });
    const invite = await post(`/v1/organisations/${workspaceId}/invitations`, users.solo, {
      role: 'participant',
    });
    expect(invite.statusCode).toBe(403);
  });

  it('creates a pickleball preset with a venue, starts it with one tap and runs round 1 with walk-ins', async () => {
    const venue = json(
      await post(`/v1/organisations/${workspaceId}/venues`, users.solo, {
        name: 'Village hall',
        timezone: 'Europe/London',
      }),
    );
    for (const code of ['1', '2'])
      await post(`/v1/venues/${venue.id}/courts`, users.solo, { code });
    const series = await post(`/v1/organisations/${workspaceId}/sessions`, users.solo, {
      name: 'Tuesday pickleball',
      sportId: 'pickleball',
      venueId: venue.id,
      defaultRoundMinutes: 10,
    });
    expect(series.statusCode, series.body).toBe(201);
    seriesId = json(series).id;
    expect(json(series).ownerScope).toBe('personal');

    const presets = json(await get('/v1/me/presets', users.solo)).items as unknown[];
    expect(presets).toHaveLength(1);
    const preset = PresetSchema.parse(presets[0]);
    expect(preset).toMatchObject({
      seriesId,
      organisationKind: 'personal',
      sportId: 'pickleball',
      courts: 2,
      activeOccurrenceId: null,
    });

    const started = await post(`/v1/sessions/${seriesId}/start`, users.solo, {});
    expect(started.statusCode, started.body).toBe(201);
    occurrenceId = json(started).id;
    expect(json(started).state).toBe('open');
    expect(
      PresetSchema.parse(json(await get('/v1/me/presets', users.solo)).items[0]).activeOccurrenceId,
    ).toBe(occurrenceId);

    // Eight walk-ins, no accounts anywhere.
    for (let i = 1; i <= 8; i++) {
      const added = await post(`/v1/occurrences/${occurrenceId}/participants`, users.solo, {
        displayName: `Guest ${i}`,
      });
      expect(added.statusCode, added.body).toBe(201);
      await post(`/v1/occurrences/${occurrenceId}/check-ins`, users.solo, {
        participantId: json(added).participantId,
      });
    }
    const preview = json(
      await post(`/v1/occurrences/${occurrenceId}/rotations/preview`, users.solo),
    );
    const committed = await call({
      method: 'POST',
      url: `/v1/occurrences/${occurrenceId}/rotations/commit`,
      headers: { ...(await bearer(users.solo)), 'if-match': String(preview.sourceVersion) },
      payload: { previewId: preview.previewId },
    });
    expect(committed.statusCode, committed.body).toBe(201);
    expect(json(committed).assignments).toHaveLength(2);
    const startRound = await post(`/v1/rounds/${json(committed).id}/start`, users.solo);
    expect(startRound.statusCode, startRound.body).toBe(200);

    const mine = json(await get('/v1/me/sessions', users.solo)).items as unknown[];
    const session = MySessionSchema.parse(mine[0]);
    expect(session).toMatchObject({ occurrenceId, state: 'live', canManage: true });
    expect(session.live).toMatchObject({
      roundNo: 1,
      roundStatus: 'in_progress',
      courtsInPlay: 2,
      playersHere: 8,
    });
    expect(session.live?.timer?.startedAt).toBeTruthy();

    const competitions = json(await get('/v1/me/competitions', users.solo));
    expect(competitions).toEqual({ teams: [], meets: [] });
  }, 120_000);
});
