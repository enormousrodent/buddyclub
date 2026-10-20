import { MeResponseSchema, ProblemDetailsSchema } from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MemoryIdentityRepository } from '../src/modules/identity/memory-repository.js';
import { createTestApp, TEST_SECRET, tokenFor } from './helpers.js';

const KNOWN_AUTH_USER = '11111111-1111-4111-8111-111111111111';
const NEW_AUTH_USER = '99999999-9999-4999-8999-999999999999';
const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let app: FastifyInstance;
let repo: MemoryIdentityRepository;

beforeAll(async () => {
  const built = await createTestApp();
  app = built.app;
  repo = built.repo;
  const profile = repo.seedProfile({ authUserId: KNOWN_AUTH_USER, displayName: 'Olive Organiser' });
  repo.seedMembership(profile.id, {
    organisationId: ORG_ID,
    organisationName: 'Demo Badminton Club',
    organisationSlug: 'demo-badminton',
    organisationKind: 'club',
    role: 'org_admin',
    status: 'active',
  });
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1/me', () => {
  it('rejects a request without a token with a problem document and WWW-Authenticate', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['www-authenticate']).toContain('Bearer');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem.code).toBe('UNAUTHENTICATED');
    expect(problem.correlationId).toBe(res.headers['x-correlation-id']);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = await tokenFor(KNOWN_AUTH_USER, { secret: `${TEST_SECRET}-wrong` });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired token with a helpful detail', async () => {
    const token = await tokenFor(KNOWN_AUTH_USER, { expiresInSeconds: -60 });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().detail).toMatch(/expired/i);
  });

  it('rejects a token for a different audience', async () => {
    const token = await tokenFor(KNOWN_AUTH_USER, { audience: 'anon' });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns the shared profile, memberships and apps for a known account', async () => {
    const token = await tokenFor(KNOWN_AUTH_USER, { email: 'organiser@example.com' });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const me = MeResponseSchema.parse(res.json());
    expect(me.profile.authUserId).toBe(KNOWN_AUTH_USER);
    expect(me.profile.displayName).toBe('Olive Organiser');
    expect(me.memberships).toEqual([
      {
        organisationId: ORG_ID,
        organisationName: 'Demo Badminton Club',
        organisationSlug: 'demo-badminton',
        organisationKind: 'club',
        role: 'org_admin',
        status: 'active',
      },
    ]);
    expect(me.apps).toEqual(['buddyclub', 'rally']);
  });

  it('provisions a profile on first sight of a valid account, using token metadata for the name', async () => {
    const token = await tokenFor(NEW_AUTH_USER, {
      email: 'new.person@example.com',
      userMetadata: { full_name: 'New Person', avatar_url: 'https://cdn.example/avatar.png' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const me = MeResponseSchema.parse(res.json());
    expect(me.profile.displayName).toBe('New Person');
    expect(me.profile.avatarUrl).toBe('https://cdn.example/avatar.png');
    expect(me.memberships).toEqual([]);

    // Second call is idempotent: same profile id.
    const again = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(again.json().profile.id).toBe(me.profile.id);
  });

  it('falls back to the email local part when no name metadata is present', async () => {
    const token = await tokenFor('77777777-7777-4777-8777-777777777777', {
      email: 'quiet.one@example.com',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.displayName).toBe('quiet.one');
  });

  it('echoes a well-formed client correlation id and replaces a malformed one', async () => {
    const token = await tokenFor(KNOWN_AUTH_USER);
    const good = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}`, 'x-correlation-id': 'client-trace-0001' },
    });
    expect(good.headers['x-correlation-id']).toBe('client-trace-0001');

    const bad = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}`, 'x-correlation-id': 'bad id with spaces' },
    });
    expect(bad.headers['x-correlation-id']).not.toBe('bad id with spaces');
    expect(bad.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
