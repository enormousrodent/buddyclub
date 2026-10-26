import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Organiser merge (2026-10-26): a name-only player folded into an account player in the same
 * club. Nights and regular status move, a night both attended keeps the account's entry, guest
 * links are revoked, the source is archived. Only name-only players can be the source.
 */
describe.skipIf(!databaseUrl)('Merge players', () => {
  const run = randomUUID().slice(0, 8);
  const users = { owner: randomUUID(), acct: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId = '';
  let seriesId = '';
  let guestId = '';
  let acctId = '';

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
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`merge-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `Merge ${name}` })}::jsonb, now(), now())
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
      name: `Merge Club ${run}`,
      slug: `merge-club-${run}`,
    });
    orgId = json(org).id;
    guestId = json(
      await post(`/v1/organisations/${orgId}/participants`, users.owner, { displayName: 'Liz' }),
    ).id;
    const invite = await post(`/v1/organisations/${orgId}/invitations`, users.owner, {
      role: 'participant',
      maxUses: 1,
    });
    await post(`/v1/invitations/${json(invite).token}/redeem`, users.acct);
    acctId = json(await get('/v1/me', users.acct)).participants.find(
      (p: { organisationId: string }) => p.organisationId === orgId,
    ).id;
    seriesId = json(
      await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
        name: `Night ${run}`,
        sportId: 'pickleball',
      }),
    ).id;
    await put(`/v1/sessions/${seriesId}/regulars`, users.owner, { participantIds: [guestId] });
    // Night 1: both checked in (the guest record and the account). Night 2: the guest only.
    const n1 = json(await post(`/v1/sessions/${seriesId}/start`, users.owner, {})).id;
    for (const pid of [guestId, acctId])
      await post(`/v1/occurrences/${n1}/check-ins`, users.owner, { participantId: pid });
    await post(`/v1/occurrences/${n1}/cancel`, users.owner);
    const n2 = json(
      await post(`/v1/sessions/${seriesId}/start`, users.owner, {
        startsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      }),
    ).id;
    await post(`/v1/occurrences/${n2}/check-ins`, users.owner, { participantId: guestId });
    await post(`/v1/organisations/${orgId}/participants/${guestId}/guest-grants`, users.owner, {
      expiresInHours: 24,
      maxRedeems: 1,
    });
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

  it('refuses the wrong direction and a plain member', async () => {
    expect(
      (
        await post(`/v1/organisations/${orgId}/participants/${acctId}/merge`, users.owner, {
          intoParticipantId: guestId,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(`/v1/organisations/${orgId}/participants/${guestId}/merge`, users.acct, {
          intoParticipantId: acctId,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('moves nights and regular status, keeps the account entry on a shared night, archives the source', async () => {
    const merged = await post(
      `/v1/organisations/${orgId}/participants/${guestId}/merge`,
      users.owner,
      {
        intoParticipantId: acctId,
      },
    );
    expect(merged.statusCode, merged.body).toBe(200);
    expect(json(merged).id).toBe(acctId);

    const entries = await db
      .selectFrom('activities.session_entries')
      .select(['participant_id', 'occurrence_id'])
      .where('participant_id', 'in', [guestId, acctId])
      .execute();
    expect(entries.every((e) => e.participant_id === acctId)).toBe(true);
    expect(new Set(entries.map((e) => e.occurrence_id)).size).toBe(2);
    expect(entries).toHaveLength(2);

    const regulars = json(await get(`/v1/sessions/${seriesId}/regulars`, users.owner)).items;
    expect(regulars.map((r: { participantId: string }) => r.participantId)).toEqual([acctId]);

    const source = json(
      await get(`/v1/organisations/${orgId}/participants/${guestId}`, users.owner),
    );
    expect(source.archivedAt).not.toBeNull();
    const grants = json(
      await get(`/v1/organisations/${orgId}/participants/${guestId}/guest-grants`, users.owner),
    ).items;
    expect(grants.every((g: { revokedAt: string | null }) => g.revokedAt !== null)).toBe(true);

    const mine = json(await get('/v1/me/sessions', users.acct)).items;
    expect(mine.length).toBeGreaterThanOrEqual(1);
  });
});
