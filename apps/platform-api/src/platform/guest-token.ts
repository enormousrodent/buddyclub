import type { GuestScope } from '@buddyclub/shared-types';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';

export const GUEST_TOKEN_ISSUER = 'buddyclub-platform-api';
export const GUEST_TOKEN_AUDIENCE = 'buddyclub-guest';
/** Guest credentials are short-lived; the link can be redeemed again to renew (ADR-008). */
export const GUEST_TOKEN_MAX_TTL_SECONDS = 12 * 60 * 60;

export interface GuestClaims {
  participantId: string;
  organisationId: string;
  grantId: string;
  scopes: GuestScope[];
  expiresAt: number;
}

export class GuestTokenError extends Error {
  constructor(
    public readonly code: 'GUEST_TOKEN_EXPIRED' | 'GUEST_TOKEN_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'GuestTokenError';
  }
}

/** Issues and verifies API-signed guest credentials. Never a Supabase session. */
export class GuestTokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async issue(input: {
    participantId: string;
    organisationId: string;
    grantId: string;
    scopes: GuestScope[];
    grantExpiresAt: Date;
  }): Promise<{ token: string; expiresAt: Date }> {
    const now = Math.floor(Date.now() / 1000);
    const grantExp = Math.floor(input.grantExpiresAt.getTime() / 1000);
    const exp = Math.min(now + GUEST_TOKEN_MAX_TTL_SECONDS, grantExp);
    const token = await new SignJWT({
      org: input.organisationId,
      grant: input.grantId,
      scopes: input.scopes,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.participantId)
      .setIssuer(GUEST_TOKEN_ISSUER)
      .setAudience(GUEST_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  async verify(token: string): Promise<GuestClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: GUEST_TOKEN_ISSUER,
        audience: GUEST_TOKEN_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload['org'] !== 'string' ||
        typeof payload['grant'] !== 'string' ||
        !Array.isArray(payload['scopes']) ||
        typeof payload.exp !== 'number'
      ) {
        throw new GuestTokenError('GUEST_TOKEN_INVALID', 'Guest token is malformed');
      }
      return {
        participantId: payload.sub,
        organisationId: payload['org'],
        grantId: payload['grant'],
        scopes: payload['scopes'] as GuestScope[],
        expiresAt: payload.exp,
      };
    } catch (error) {
      if (error instanceof GuestTokenError) throw error;
      if (error instanceof joseErrors.JWTExpired) {
        throw new GuestTokenError('GUEST_TOKEN_EXPIRED', 'Guest credential has expired');
      }
      throw new GuestTokenError('GUEST_TOKEN_INVALID', 'Guest credential could not be verified');
    }
  }
}
