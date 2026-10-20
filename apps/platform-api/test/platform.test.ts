import { describe, expect, it } from 'vitest';
import { GuestTokenService } from '../src/platform/guest-token.js';
import { generateOpaqueToken, hashToken, slugify } from '../src/platform/tokens.js';
import { MemoryIdempotencyStore } from '../src/plugins/idempotency.js';
import { createTestApp } from './helpers.js';

describe('tokens', () => {
  it('generates distinct URL-safe tokens and 64-char hashes', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });

  it('slugifies names the way the organisation check constraint expects', () => {
    expect(slugify('New Forest Badminton Club')).toBe('new-forest-badminton-club');
    expect(slugify('  Café   Élan!! ')).toBe('cafe-elan');
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(63);
  });
});

describe('GuestTokenService', () => {
  const service = new GuestTokenService('guest-token-secret-for-tests-at-least-32-chars');
  const input = {
    participantId: '6d2c1a2e-7f4b-4c8d-9e1f-0a1b2c3d4e5f',
    organisationId: '7d2c1a2e-7f4b-4c8d-9e1f-0a1b2c3d4e5f',
    grantId: '8d2c1a2e-7f4b-4c8d-9e1f-0a1b2c3d4e5f',
    scopes: ['schedule.view' as const],
  };

  it('round-trips claims and caps the lifetime at the grant expiry', async () => {
    const grantExpiresAt = new Date(Date.now() + 60_000);
    const issued = await service.issue({ ...input, grantExpiresAt });
    expect(issued.expiresAt.getTime()).toBeLessThanOrEqual(grantExpiresAt.getTime());
    const claims = await service.verify(issued.token);
    expect(claims).toMatchObject({
      participantId: input.participantId,
      grantId: input.grantId,
      scopes: ['schedule.view'],
    });
  });

  it('rejects tokens from a different secret', async () => {
    const other = new GuestTokenService('another-guest-secret-that-is-also-32-chars-long');
    const issued = await other.issue({ ...input, grantExpiresAt: new Date(Date.now() + 60_000) });
    await expect(service.verify(issued.token)).rejects.toMatchObject({
      code: 'GUEST_TOKEN_INVALID',
    });
  });
});

describe('MemoryIdempotencyStore', () => {
  it('reserves, completes and replays within scope', async () => {
    const store = new MemoryIdempotencyStore();
    expect(await store.begin('user:a', 'k1', 'h1', 1000)).toBeNull();
    expect(await store.begin('user:a', 'k1', 'h1', 1000)).toEqual({
      requestHash: 'h1',
      response: null,
    });
    await store.complete('user:a', 'k1', { statusCode: 201, body: { id: 1 } });
    expect(await store.begin('user:a', 'k1', 'h1', 1000)).toEqual({
      requestHash: 'h1',
      response: { statusCode: 201, body: { id: 1 } },
    });
    expect(await store.begin('user:b', 'k1', 'h1', 1000)).toBeNull();
  });
});

describe('database-backed routes without a database', () => {
  it('return 503 with a problem document instead of crashing', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/sports' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('INTERNAL');
    expect(res.json().detail).toContain('DATABASE_URL');
    await app.close();
  });

  it('still require authentication before touching the database', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/organisations',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('validates bodies before authorisation-dependent work', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/guest-access/redeem',
      payload: { token: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
    expect(res.json().fieldErrors[0].path).toBe('body/token');
    await app.close();
  });
});
