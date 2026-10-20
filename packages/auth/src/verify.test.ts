import { describe, expect, it } from 'vitest';
import { createTokenVerifier, extractBearerToken, TokenVerificationError } from './index';
import { signTestToken } from './testing';

const secret = 'test-secret-that-is-at-least-32-characters-long';
const issuer = 'http://127.0.0.1:54321/auth/v1';
const audience = 'authenticated';
const sub = '6d2c1a2e-7f4b-4c8d-9e1f-0a1b2c3d4e5f';

const verifier = createTokenVerifier({ issuer, audience, jwtSecret: secret });

async function expectCode(promise: Promise<unknown>, code: TokenVerificationError['code']) {
  await expect(promise).rejects.toBeInstanceOf(TokenVerificationError);
  await promise.catch((error: TokenVerificationError) => expect(error.code).toBe(code));
}

describe('createTokenVerifier (HS256)', () => {
  it('accepts a well-formed Supabase-style token and exposes safe claims', async () => {
    const token = await signTestToken({
      secret,
      issuer,
      audience,
      sub,
      email: 'sam@example.com',
      sessionId: 'sess-1',
      userMetadata: { full_name: 'Sam Player' },
    });
    const principal = await verifier.verify(token);
    expect(principal.authUserId).toBe(sub);
    expect(principal.email).toBe('sam@example.com');
    expect(principal.sessionId).toBe('sess-1');
    expect(principal.authRole).toBe('authenticated');
    expect(principal.userMetadata['full_name']).toBe('Sam Player');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signTestToken({
      secret: 'another-secret-that-is-also-long-enough-1',
      issuer,
      audience,
      sub,
    });
    await expectCode(verifier.verify(token), 'TOKEN_INVALID');
  });

  it('rejects an expired token', async () => {
    const token = await signTestToken({ secret, issuer, audience, sub, expiresInSeconds: -120 });
    await expectCode(verifier.verify(token), 'TOKEN_EXPIRED');
  });

  it('rejects the wrong audience', async () => {
    const token = await signTestToken({ secret, issuer, audience: 'anon', sub });
    await expectCode(verifier.verify(token), 'TOKEN_INVALID');
  });

  it('rejects the wrong issuer', async () => {
    const token = await signTestToken({
      secret,
      issuer: 'https://evil.example/auth/v1',
      audience,
      sub,
    });
    await expectCode(verifier.verify(token), 'TOKEN_INVALID');
  });

  it('rejects an empty token', async () => {
    await expectCode(verifier.verify(''), 'TOKEN_MISSING');
  });

  it('refuses to build without any key material', () => {
    expect(() => createTokenVerifier({ issuer, audience })).toThrow();
  });
});

describe('extractBearerToken', () => {
  it('parses a bearer header case-insensitively', () => {
    expect(extractBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('returns null for other schemes or missing headers', () => {
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
  });
});
