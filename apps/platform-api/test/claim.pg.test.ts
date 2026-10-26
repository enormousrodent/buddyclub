import { randomUUID } from 'node:crypto';
import { ClaimPreviewSchema } from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Guest claim (ADR-008, decided 2026-10-26): the organiser's guest link is the proof. A signed-in
 * holder takes over the name-only player: the record gets the account and its name, membership
 * follows, nights stay, the link is spent. An account with an empty record in the club has it
 * folded in; one that has played is refused.
 */
describe.skipIf(!databaseUrl)('Guest claim', () => {
  const run = randomUUID().slice(0, 8);
  const users = { owner: randomUUID(), liz: randomUUID(), other: randomUUID() };
  let db: Db;
  let app: FastifyInstance;
  let orgId = '';
  let seriesId = '';
  let lizId = '';
  let token = '';

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
                ${`claim-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: name === 'liz' ? 'Liz Shelley' : `Claim ${name}` })}::jsonb, now(), now())
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
      name: `Claim Bandits ${run}`,
      slug: `claim-bandits-${run}`,
    });
    expect(org.statusCode, org.body).toBe(201);
    orgId = json(org).id;
    const guest = await post(`/v1/organisations/${orgId}/participants`, users.owner, {
      displayName: 'Liz',
    });
    expect(guest.statusCode, guest.body).toBe(201);
    lizId = json(guest).id;
    const series = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
      name: `Monday ${run}`,
      sportId: 'pickleball',
    });
    seriesId = json(series).id;
    expect(
      (await put(`/v1/sessions/${seriesId}/regulars`, users.owner, { participantIds: [lizId] }))
        .statusCode,
    ).toBe(200);
    // One night played as a guest.
    const night = await post(`/v1/sessions/${seriesId}/start`, users.owner, {});
    expect(night.statusCode, night.body).toBe(201);
    expect(
      (
        await post(`/v1/occurrences/${json(night).id}/check-ins`, users.owner, {
          participantId: lizId,
        })
      ).statusCode,
    ).toBe(200);
    const link = await post(
      `/v1/organisations/${orgId}/participants/${lizId}/guest-grants`,
      users.owner,
      {
        expiresInHours: 24,
        maxRedeems: 3,
      },
    );
    expect(link.statusCode, link.body).toBe(201);
    token = json(link).token;
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

  it('previews what a claim does', async () => {
    const preview = ClaimPreviewSchema.parse(
      json(await get(`/v1/guest/claim?token=${encodeURIComponent(token)}`, users.liz)),
    );
    expect(preview).toMatchObject({
      participant: { id: lizId, displayName: 'Liz' },
      organisation: { id: orgId },
      nightsPlayed: 1,
      claimable: true,
      reason: null,
    });
    expect((await get(`/v1/guest/claim?token=nope-nope-nope-nope`, users.liz)).statusCode).toBe(
      404,
    );
  });

  it('claims: the account takes the record, its name and membership; the link is spent', async () => {
    const claimed = await post('/v1/guest/claim', users.liz, { token });
    expect(claimed.statusCode, claimed.body).toBe(200);
    expect(json(claimed)).toMatchObject({
      participant: { id: lizId, displayName: 'Liz Shelley' },
      organisation: { id: orgId },
    });
    const me = json(await get('/v1/me', users.liz));
    expect(
      me.memberships.find((m: { organisationId: string }) => m.organisationId === orgId),
    ).toMatchObject({ role: 'participant' });
    expect(
      me.participants.find((p: { organisationId: string }) => p.organisationId === orgId),
    ).toMatchObject({
      id: lizId,
      displayName: 'Liz Shelley',
    });
    // Still a regular, under the new name; the night played is still hers.
    const regulars = json(await get(`/v1/sessions/${seriesId}/regulars`, users.owner)).items;
    expect(regulars).toEqual([
      expect.objectContaining({ participantId: lizId, displayName: 'Liz Shelley' }),
    ]);
    const mine = json(await get('/v1/me/sessions', users.liz)).items;
    expect(mine.length).toBeGreaterThan(0);
    // The link is spent for everyone, and the record cannot be claimed twice.
    expect((await post('/v1/guest/claim', users.other, { token })).statusCode).toBe(409);
    expect(
      json(await get(`/v1/guest/claim?token=${encodeURIComponent(token)}`, users.liz)).reason,
    ).toMatch(/used or revoked/);
    expect((await post('/v1/guest-access/redeem', users.other, { token })).statusCode).toBe(409);
  });

  it('an account with an empty record in the club has it folded in; one that has played is refused', async () => {
    // "other" joins the club by an invitation link first, so they have an empty player record.
    const invite = await post(`/v1/organisations/${orgId}/invitations`, users.owner, {
      role: 'participant',
      maxUses: 1,
    });
    expect(invite.statusCode, invite.body).toBe(201);
    expect(
      (await post(`/v1/invitations/${json(invite).token}/redeem`, users.other)).statusCode,
    ).toBe(200);
    const before = json(await get('/v1/me', users.other)).participants.find(
      (p: { organisationId: string }) => p.organisationId === orgId,
    );
    expect(before).toBeTruthy();

    const guest = await post(`/v1/organisations/${orgId}/participants`, users.owner, {
      displayName: 'Sam',
    });
    const samId = json(guest).id;
    const link = await post(
      `/v1/organisations/${orgId}/participants/${samId}/guest-grants`,
      users.owner,
      {
        expiresInHours: 24,
        maxRedeems: 1,
      },
    );
    const claimed = await post('/v1/guest/claim', users.other, { token: json(link).token });
    expect(claimed.statusCode, claimed.body).toBe(200);
    const after = json(await get('/v1/me', users.other)).participants.filter(
      (p: { organisationId: string }) => p.organisationId === orgId,
    );
    expect(after).toEqual([expect.objectContaining({ id: samId, displayName: 'Claim other' })]);

    // Liz has played as herself now; a second guest record for her cannot be claimed.
    const twice = await post(`/v1/organisations/${orgId}/participants`, users.owner, {
      displayName: 'Liz again',
    });
    const link2 = await post(
      `/v1/organisations/${orgId}/participants/${json(twice).id}/guest-grants`,
      users.owner,
      {
        expiresInHours: 24,
        maxRedeems: 1,
      },
    );
    const refused = await post('/v1/guest/claim', users.liz, { token: json(link2).token });
    expect(refused.statusCode).toBe(409);
    expect(json(refused).title).toMatch(/already play/);
  });
});
