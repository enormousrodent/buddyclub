import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { describe, expect, it } from 'vitest';
import { createTokenVerifier, describeTokenHeader } from './index';
import { signTestToken } from './testing';

/**
 * A project mid-rotation signs some tokens with the legacy HS256 secret and some with the new
 * ES256 key. With both configured, the verifier picks the key from the token's alg header.
 */
const secret = 'test-secret-that-is-at-least-32-characters-long';
const issuer = 'https://xvkoukolmdpuvftvvcdd.supabase.co/auth/v1';
const audience = 'authenticated';
const sub = '6d2c1a2e-7f4b-4c8d-9e1f-0a1b2c3d4e5f';

describe('createTokenVerifier (secret + JWKS)', () => {
  it('accepts HS256 and ES256 tokens and explains refusals', async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    const jwks: JSONWebKeySet = {
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' }],
    };
    const both = createTokenVerifier({ issuer, audience, jwtSecret: secret, jwks });

    const hs = await signTestToken({ secret, issuer, audience, sub });
    expect(describeTokenHeader(hs)).toEqual({ alg: 'HS256' });
    expect((await both.verify(hs)).authUserId).toBe(sub);

    const now = Math.floor(Date.now() / 1000);
    const es = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(pair.privateKey);
    expect(describeTokenHeader(es)).toEqual({ alg: 'ES256', kid: 'k1' });
    expect((await both.verify(es)).authUserId).toBe(sub);

    // JWKS-only verifier tells you it cannot check an HS256 token.
    const jwksOnly = createTokenVerifier({ issuer, audience, jwks });
    await expect(jwksOnly.verify(hs)).rejects.toThrow(/HS256-signed/);

    // Wrong secret: the reason names the jose error code.
    const wrongSecret = createTokenVerifier({
      issuer,
      audience,
      jwtSecret: 'a-completely-different-secret-that-is-long',
    });
    await expect(wrongSecret.verify(hs)).rejects.toThrow(/ERR_JWS_SIGNATURE_VERIFICATION_FAILED/);
  });
});
