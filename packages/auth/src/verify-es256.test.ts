import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTokenVerifier, TokenVerificationError, type TokenVerifier } from './index';

/**
 * The cloud Supabase project signs access tokens with ES256 and publishes its keys at
 * /auth/v1/.well-known/jwks.json. This suite exercises that path with a locally generated key
 * pair and an in-memory key set, so no network is needed.
 */
const issuer = 'https://xvkoukolmdpuvftvvcdd.supabase.co/auth/v1';
const audience = 'authenticated';
const sub = '6d2c1a2e-7f4b-4c8d-9e1f-0a1b2c3d4e5f';

let verifier: TokenVerifier;
type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let privateKey: PrivateKey;
let rogueKey: PrivateKey;

async function sign(
  key: PrivateKey,
  overrides: { iss?: string; aud?: string; exp?: number; kid?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: 'authenticated',
    email: 'cloud@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Cloud User' },
    session_id: 'sess-cloud',
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: overrides.kid ?? 'key-1' })
    .setSubject(sub)
    .setIssuer(overrides.iss ?? issuer)
    .setAudience(overrides.aud ?? audience)
    .setIssuedAt(now)
    .setExpirationTime(overrides.exp ?? now + 3600)
    .sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...publicJwk, kid: 'key-1', alg: 'ES256', use: 'sig', key_ops: ['verify'] }],
  };
  verifier = createTokenVerifier({ issuer, audience, jwks });

  rogueKey = (await generateKeyPair('ES256')).privateKey;
});

describe('createTokenVerifier (ES256 via JWKS)', () => {
  it('accepts a token signed by a published key', async () => {
    const principal = await verifier.verify(await sign(privateKey));
    expect(principal.authUserId).toBe(sub);
    expect(principal.email).toBe('cloud@example.com');
    expect(principal.sessionId).toBe('sess-cloud');
    expect(principal.userMetadata['full_name']).toBe('Cloud User');
  });

  it('rejects a token signed by an unknown key', async () => {
    await expect(verifier.verify(await sign(rogueKey))).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('rejects a token whose kid is not in the key set', async () => {
    await expect(
      verifier.verify(await sign(privateKey, { kid: 'rotated-away' })),
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });

  it('rejects wrong issuer, wrong audience and expiry', async () => {
    await expect(
      verifier.verify(await sign(privateKey, { iss: 'https://other.example/auth/v1' })),
    ).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
    await expect(verifier.verify(await sign(privateKey, { aud: 'anon' }))).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
    const past = Math.floor(Date.now() / 1000) - 120;
    await expect(verifier.verify(await sign(privateKey, { exp: past }))).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });

  it('does not accept an HS256 token when configured for asymmetric keys', async () => {
    const now = Math.floor(Date.now() / 1000);
    const hs = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(new TextEncoder().encode('some-shared-secret-that-is-long-enough-12345'));
    await expect(verifier.verify(hs)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
