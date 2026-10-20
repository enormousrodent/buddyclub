import { randomUUID } from 'node:crypto';
import {
  GroupDetailSchema,
  GuestGrantCreatedSchema,
  GuestSessionSchema,
  InvitationCreatedSchema,
  MeResponseSchema,
  OrganisationSchema,
  ParticipantSchema,
  ProblemDetailsSchema,
  VenueDetailSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

/**
 * Phase 1 end-to-end behaviour against a real Postgres (TEST_DATABASE_URL). Creates its own
 * accounts and organisations and removes them afterwards. Audit rows are append-only by design
 * and remain.
 */
const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!databaseUrl)('Phase 1: clubs, members, guests, groups, venues', () => {
  const run = randomUUID().slice(0, 8);
  const users = {
    admin: randomUUID(),
    member: randomUUID(),
    outsider: randomUUID(),
  };
  const createdOrgIds: string[] = [];
  let db: Db;
  let app: FastifyInstance;

  const call = async (opts: InjectOptions) => app.inject(opts);
  const json = (res: { statusCode: number; body: string }) => {
    try {
      return JSON.parse(res.body);
    } catch {
      throw new Error(`non-JSON response ${res.statusCode}: ${res.body.slice(0, 300)}`);
    }
  };

  beforeAll(async () => {
    db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
    await pingDb(db);
    for (const [name, id] of Object.entries(users)) {
      await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`p1-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `P1 ${name}` })}::jsonb, now(), now())
      `.execute(db);
    }
    const built = await createTestApp({
      repo: new PgIdentityRepository(db),
      db,
      idempotencyStore: new PgIdempotencyStore(db),
    });
    app = built.app;
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    for (const orgId of createdOrgIds) {
      await db.deleteFrom('platform.invitation_links').where('scope_id', '=', orgId).execute();
      await db.deleteFrom('community.organisations').where('id', '=', orgId).execute();
    }
    const authIds = Object.values(users);
    const profiles = await db
      .selectFrom('identity.user_profiles')
      .select('id')
      .where('auth_user_id', 'in', authIds)
      .execute();
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length) {
      await db
        .deleteFrom('platform.idempotency_keys')
        .where(
          'scope',
          'in',
          profileIds.map((id) => `user:${id}`),
        )
        .execute();
      await db.deleteFrom('identity.user_profiles').where('id', 'in', profileIds).execute();
    }
    await sql`delete from auth.users where id = any(${authIds}::uuid[])`.execute(db);
    await db.destroy();
  });

  let orgId: string;
  let inviteToken: string;
  let guestParticipantId: string;
  let guestLinkToken: string;
  let guestAccessToken: string;

  it('creates a club; the creator is org admin with a participant record', async () => {
    const res = await call({
      method: 'POST',
      url: '/v1/organisations',
      headers: await bearer(users.admin),
      payload: { name: `Phase One Club ${run}` },
    });
    expect(res.statusCode).toBe(201);
    const org = OrganisationSchema.parse(json(res));
    expect(org.slug).toBe(`phase-one-club-${run}`);
    expect(org.myRole).toBe('org_admin');
    orgId = org.id;
    createdOrgIds.push(orgId);

    const me = await call({ method: 'GET', url: '/v1/me', headers: await bearer(users.admin) });
    const body = MeResponseSchema.parse(json(me));
    expect(body.memberships).toEqual([
      expect.objectContaining({ organisationId: orgId, role: 'org_admin' }),
    ]);
    expect(body.participants).toEqual([expect.objectContaining({ organisationId: orgId })]);
  });

  it('rejects a duplicate slug with 409', async () => {
    const res = await call({
      method: 'POST',
      url: '/v1/organisations',
      headers: await bearer(users.admin),
      payload: { name: 'Another', slug: `phase-one-club-${run}` },
    });
    expect(res.statusCode).toBe(409);
    expect(json(res).code).toBe('CONFLICT');
  });

  it('hides the club from non-members (403)', async () => {
    const res = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}`,
      headers: await bearer(users.outsider),
    });
    expect(res.statusCode).toBe(403);
    expect(ProblemDetailsSchema.parse(json(res)).code).toBe('FORBIDDEN');
  });

  it('replays an idempotent create and rejects key reuse with a different body', async () => {
    const key = `idem-${run}`;
    const first = await call({
      method: 'POST',
      url: '/v1/organisations',
      headers: { ...(await bearer(users.admin)), 'idempotency-key': key },
      payload: { name: `Idem Club ${run}` },
    });
    expect(first.statusCode).toBe(201);
    createdOrgIds.push(json(first).id);

    const replay = await call({
      method: 'POST',
      url: '/v1/organisations',
      headers: { ...(await bearer(users.admin)), 'idempotency-key': key },
      payload: { name: `Idem Club ${run}` },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(json(replay).id).toBe(json(first).id);

    const conflict = await call({
      method: 'POST',
      url: '/v1/organisations',
      headers: { ...(await bearer(users.admin)), 'idempotency-key': key },
      payload: { name: `Different ${run}` },
    });
    expect(conflict.statusCode).toBe(409);
    expect(json(conflict).code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('updates the club with If-Match and rejects a stale version', async () => {
    const stale = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}`,
      headers: { ...(await bearer(users.admin)), 'if-match': '99' },
      payload: { name: 'Renamed' },
    });
    expect(stale.statusCode).toBe(409);
    expect(json(stale).code).toBe('VERSION_CONFLICT');

    const ok = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}`,
      headers: { ...(await bearer(users.admin)), 'if-match': '1' },
      payload: { name: `Phase One Club ${run} Renamed` },
    });
    expect(ok.statusCode).toBe(200);
    expect(json(ok).version).toBe(2);
  });

  it('issues an invitation, previews it publicly and lets another account join once', async () => {
    const created = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/invitations`,
      headers: await bearer(users.admin),
      payload: { role: 'participant', maxUses: 1 },
    });
    expect(created.statusCode).toBe(201);
    inviteToken = InvitationCreatedSchema.parse(json(created)).token;

    const preview = await call({ method: 'GET', url: `/v1/invitations/${inviteToken}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(json(preview)).toMatchObject({ role: 'participant', redeemable: true });

    const redeem = await call({
      method: 'POST',
      url: `/v1/invitations/${inviteToken}/redeem`,
      headers: await bearer(users.member),
    });
    expect(redeem.statusCode).toBe(200);
    expect(json(redeem)).toMatchObject({
      organisationId: orgId,
      role: 'participant',
      alreadyMember: false,
    });

    const again = await call({
      method: 'POST',
      url: `/v1/invitations/${inviteToken}/redeem`,
      headers: await bearer(users.member),
    });
    expect(json(again).alreadyMember).toBe(true);

    const exhausted = await call({
      method: 'POST',
      url: `/v1/invitations/${inviteToken}/redeem`,
      headers: await bearer(users.outsider),
    });
    expect(exhausted.statusCode).toBe(409);

    const list = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}/invitations`,
      headers: await bearer(users.admin),
    });
    expect(json(list).items[0]).toMatchObject({ useCount: 1, maxUses: 1 });
    expect(json(list).items[0].token).toBeUndefined();
  });

  it('enforces member management rules, including the last-admin guard', async () => {
    const members = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}/members`,
      headers: await bearer(users.member),
    });
    expect(members.statusCode).toBe(200);
    const items = json(members).items as { profileId: string; role: string }[];
    expect(items.map((m) => m.role).sort()).toEqual(['org_admin', 'participant']);
    const adminProfileId = items.find((m) => m.role === 'org_admin')!.profileId;
    const memberProfileId = items.find((m) => m.role === 'participant')!.profileId;

    const forbidden = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}/members/${adminProfileId}`,
      headers: await bearer(users.member),
      payload: { role: 'participant' },
    });
    expect(forbidden.statusCode).toBe(403);

    const lastAdmin = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}/members/${adminProfileId}`,
      headers: await bearer(users.admin),
      payload: { role: 'session_organiser' },
    });
    expect(lastAdmin.statusCode).toBe(409);

    const promote = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}/members/${memberProfileId}`,
      headers: await bearer(users.admin),
      payload: { role: 'session_organiser' },
    });
    expect(promote.statusCode).toBe(200);
    expect(json(promote).role).toBe('session_organiser');
  });

  it('lets an organiser add a walk-in guest by name only, and outsiders cannot see them', async () => {
    const res = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/participants`,
      headers: await bearer(users.member),
      payload: { displayName: 'Walk-in Sam' },
    });
    expect(res.statusCode).toBe(201);
    const guest = ParticipantSchema.parse(json(res));
    expect(guest).toMatchObject({ source: 'guest', userProfileId: null, version: 1 });
    guestParticipantId = guest.id;

    const list = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}/participants`,
      headers: await bearer(users.admin),
    });
    expect(json(list).items.map((p: { displayName: string }) => p.displayName)).toContain(
      'Walk-in Sam',
    );

    const outsider = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}/participants`,
      headers: await bearer(users.outsider),
    });
    expect(outsider.statusCode).toBe(403);

    const stale = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}/participants/${guestParticipantId}`,
      headers: { ...(await bearer(users.member)), 'if-match': '5' },
      payload: { skillRating: 3.5 },
    });
    expect(stale.statusCode).toBe(409);

    const updated = await call({
      method: 'PATCH',
      url: `/v1/organisations/${orgId}/participants/${guestParticipantId}`,
      headers: { ...(await bearer(users.member)), 'if-match': '1' },
      payload: { skillRating: 3.5 },
    });
    expect(updated.statusCode).toBe(200);
    expect(json(updated)).toMatchObject({ skillRating: 3.5, version: 2 });
  });

  it('issues a guest link, redeems it into a scoped credential, and revocation takes effect immediately', async () => {
    const created = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/participants/${guestParticipantId}/guest-grants`,
      headers: await bearer(users.member),
      payload: { maxRedeems: 2 },
    });
    expect(created.statusCode).toBe(201);
    const grant = GuestGrantCreatedSchema.parse(json(created));
    guestLinkToken = grant.token;

    const redeemed = await call({
      method: 'POST',
      url: '/v1/guest-access/redeem',
      payload: { token: guestLinkToken },
    });
    expect(redeemed.statusCode).toBe(200);
    const session = GuestSessionSchema.parse(json(redeemed));
    expect(session.participant.id).toBe(guestParticipantId);
    expect(session.organisation.id).toBe(orgId);
    guestAccessToken = session.accessToken;

    const me = await call({
      method: 'GET',
      url: '/v1/guest/me',
      headers: { authorization: `Bearer ${guestAccessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(json(me).participant.displayName).toBe('Walk-in Sam');
    expect(me.headers['cache-control']).toBe('no-store');

    // A guest credential is not a user credential.
    const notUser = await call({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${guestAccessToken}` },
    });
    expect(notUser.statusCode).toBe(401);

    const revoked = await call({
      method: 'DELETE',
      url: `/v1/organisations/${orgId}/participants/${guestParticipantId}/guest-grants/${grant.id}`,
      headers: await bearer(users.member),
    });
    expect(revoked.statusCode).toBe(204);

    const afterRevoke = await call({
      method: 'GET',
      url: '/v1/guest/me',
      headers: { authorization: `Bearer ${guestAccessToken}` },
    });
    expect(afterRevoke.statusCode).toBe(401);
    const reRedeem = await call({
      method: 'POST',
      url: '/v1/guest-access/redeem',
      payload: { token: guestLinkToken },
    });
    expect(reRedeem.statusCode).toBe(409);
  });

  it('keeps guest claim endpoints dark until ADR-008 (501)', async () => {
    const res = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/participants/${guestParticipantId}/claim-intents`,
      headers: await bearer(users.admin),
    });
    expect(res.statusCode).toBe(501);
    expect(json(res).code).toBe('NOT_IMPLEMENTED');
  });

  it('creates a group, adds the guest, and rejects unknown sports', async () => {
    const bad = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/groups`,
      headers: await bearer(users.admin),
      payload: { name: 'Nope', sportId: 'quidditch' },
    });
    expect(bad.statusCode).toBe(400);
    expect(json(bad).fieldErrors?.[0]?.path).toBe('body/sportId');

    const created = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/groups`,
      headers: await bearer(users.admin),
      payload: { name: 'Tuesday Social', sportId: 'badminton' },
    });
    expect(created.statusCode).toBe(201);
    const groupId = json(created).id as string;

    const added = await call({
      method: 'POST',
      url: `/v1/groups/${groupId}/members`,
      headers: await bearer(users.member),
      payload: { participantId: guestParticipantId },
    });
    expect(added.statusCode).toBe(200);
    const detail = GroupDetailSchema.parse(json(added));
    expect(detail.memberCount).toBe(1);
    expect(detail.members[0]).toMatchObject({ participantId: guestParticipantId, source: 'guest' });

    const removed = await call({
      method: 'DELETE',
      url: `/v1/groups/${groupId}/members/${guestParticipantId}`,
      headers: await bearer(users.member),
    });
    expect(removed.statusCode).toBe(204);
    const after = await call({
      method: 'GET',
      url: `/v1/groups/${groupId}`,
      headers: await bearer(users.admin),
    });
    expect(json(after).memberCount).toBe(0);
  });

  it('creates a venue with validated timezone and unique court codes', async () => {
    const badTz = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/venues`,
      headers: await bearer(users.admin),
      payload: { name: 'Sports Hall', timezone: 'Mars/Olympus' },
    });
    expect(badTz.statusCode).toBe(400);
    expect(json(badTz).fieldErrors?.[0]?.path).toBe('body/timezone');

    const venue = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/venues`,
      headers: await bearer(users.admin),
      payload: {
        name: 'Sports Hall',
        timezone: 'Europe/London',
        address: { town: 'Basingstoke', country: 'GB' },
      },
    });
    expect(venue.statusCode).toBe(201);
    const venueId = json(venue).id as string;

    const court = await call({
      method: 'POST',
      url: `/v1/venues/${venueId}/courts`,
      headers: await bearer(users.member),
      payload: { code: '1', sportIds: ['badminton'] },
    });
    expect(court.statusCode).toBe(201);
    const dup = await call({
      method: 'POST',
      url: `/v1/venues/${venueId}/courts`,
      headers: await bearer(users.member),
      payload: { code: '1' },
    });
    expect(dup.statusCode).toBe(409);

    const deactivated = await call({
      method: 'PATCH',
      url: `/v1/courts/${json(court).id}`,
      headers: await bearer(users.admin),
      payload: { active: false },
    });
    expect(deactivated.statusCode).toBe(200);

    const detail = await call({
      method: 'GET',
      url: `/v1/venues/${venueId}`,
      headers: await bearer(users.member),
    });
    const parsed = VenueDetailSchema.parse(json(detail));
    expect(parsed.address).toEqual({ town: 'Basingstoke', country: 'GB' });
    expect(parsed.courts).toEqual([expect.objectContaining({ code: '1', active: false })]);

    const outsider = await call({
      method: 'GET',
      url: `/v1/venues/${venueId}`,
      headers: await bearer(users.outsider),
    });
    expect(outsider.statusCode).toBe(403);
  });

  it('archives the guest and revokes outstanding links', async () => {
    const res = await call({
      method: 'POST',
      url: `/v1/organisations/${orgId}/participants/${guestParticipantId}/archive`,
      headers: await bearer(users.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(json(res).archivedAt).not.toBeNull();

    const visible = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}/participants`,
      headers: await bearer(users.admin),
    });
    expect(
      json(visible).items.find((p: { id: string }) => p.id === guestParticipantId),
    ).toBeUndefined();
    const all = await call({
      method: 'GET',
      url: `/v1/organisations/${orgId}/participants?includeArchived=true`,
      headers: await bearer(users.admin),
    });
    expect(json(all).items.find((p: { id: string }) => p.id === guestParticipantId)).toBeDefined();
  });

  it('writes audit events for the privileged changes above', async () => {
    const rows = await db
      .selectFrom('platform.audit_events')
      .select(['entity_type', 'operation'])
      .where('correlation_id', 'is not', null)
      .where('entity_id', '=', orgId)
      .execute();
    expect(rows).toEqual(
      expect.arrayContaining([
        { entity_type: 'organisation', operation: 'create' },
        { entity_type: 'organisation', operation: 'update' },
      ]),
    );
  });
});
