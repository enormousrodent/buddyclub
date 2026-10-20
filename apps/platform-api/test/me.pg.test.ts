import { randomUUID } from 'node:crypto';
import { MeResponseSchema } from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { createTestApp, tokenFor } from './helpers.js';

/**
 * Runs against a migrated local Supabase database. Set TEST_DATABASE_URL (see .env.example) and
 * run `pnpm test:db`. Skipped otherwise so the default test run stays hermetic.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!databaseUrl)('GET /v1/me against Postgres', () => {
  const authUserId = randomUUID();
  const orgId = randomUUID();
  let db: Db;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 2 });
    await pingDb(db);

    // Inserting into auth.users fires identity.handle_new_auth_user, which creates the profile.
    await sql`
      insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (${authUserId}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              ${`pg-test-${authUserId}@example.com`}, '{}'::jsonb, '{"full_name":"Integration Ivy"}'::jsonb, now(), now())
    `.execute(db);

    const profile = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', '=', authUserId)
      .executeTakeFirstOrThrow();

    await db
      .insertInto('community.organisations')
      .values({
        id: orgId,
        name: 'PG Test Club',
        slug: `pg-test-${orgId.slice(0, 8)}`,
        owner_profile_id: profile.id,
      })
      .execute();
    await db
      .insertInto('community.memberships')
      .values({ organisation_id: orgId, user_profile_id: profile.id, role: 'session_organiser' })
      .execute();

    const built = await createTestApp({
      repo: new PgIdentityRepository(db),
      checkDatabase: () => pingDb(db),
    });
    app = built.app;
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.deleteFrom('community.memberships').where('organisation_id', '=', orgId).execute();
      await db.deleteFrom('community.organisations').where('id', '=', orgId).execute();
      await db
        .deleteFrom('identity.user_profiles')
        .where('auth_user_id', '=', authUserId)
        .execute();
      await sql`delete from auth.users where id = ${authUserId}::uuid`.execute(db);
      await db.destroy();
    }
  });

  it('reports database readiness', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.database).toBe('ok');
  });

  it('returns the trigger-created profile and its membership', async () => {
    const token = await tokenFor(authUserId, { email: `pg-test-${authUserId}@example.com` });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const me = MeResponseSchema.parse(res.json());
    expect(me.profile.displayName).toBe('Integration Ivy');
    expect(me.memberships).toEqual([
      expect.objectContaining({
        organisationId: orgId,
        organisationName: 'PG Test Club',
        role: 'session_organiser',
        status: 'active',
      }),
    ]);
  });

  it('ensureProfile is idempotent under a conflict', async () => {
    const repo = new PgIdentityRepository(db);
    const first = await repo.ensureProfile({
      authUserId,
      displayName: 'Should Not Overwrite',
      avatarUrl: null,
    });
    expect(first.displayName).toBe('Integration Ivy');
  });
});
