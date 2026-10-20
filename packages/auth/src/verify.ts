import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import { TokenVerificationError, type AuthPrincipal } from './principal';

export interface TokenVerifierOptions {
  /** Expected `iss`, normally `${SUPABASE_URL}/auth/v1`. */
  issuer: string;
  /** Expected `aud`, normally `authenticated`. */
  audience: string;
  /** Symmetric Supabase JWT secret (HS256): legacy projects, local dev, or a project that still signs with it. */
  jwtSecret?: string;
  /**
   * JWKS endpoint for projects using asymmetric signing keys (ES256/RS256), e.g.
   * `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Preferred for cloud projects.
   */
  jwksUrl?: string;
  /** An in-memory key set, for tests or air-gapped verification. Takes precedence over jwksUrl. */
  jwks?: JSONWebKeySet;
  clockToleranceSeconds?: number;
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthPrincipal>;
}

/** Algorithms accepted for asymmetric Supabase signing keys. */
export const ASYMMETRIC_ALGORITHMS = ['ES256', 'RS256'] as const;

/** Safe-to-log facts about a token: never the token itself. */
export interface TokenHeaderInfo {
  alg?: string;
  kid?: string;
}

export function describeTokenHeader(token: string): TokenHeaderInfo {
  try {
    const header = decodeProtectedHeader(token);
    const info: TokenHeaderInfo = {};
    if (typeof header.alg === 'string') info.alg = header.alg;
    if (typeof header.kid === 'string') info.kid = header.kid;
    return info;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function principalFromClaims(claims: JWTPayload): AuthPrincipal {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new TokenVerificationError('TOKEN_INVALID', 'Token has no subject');
  }
  if (typeof claims.exp !== 'number' || typeof claims.iat !== 'number') {
    throw new TokenVerificationError('TOKEN_INVALID', 'Token is missing exp/iat');
  }
  const principal: AuthPrincipal = {
    authUserId: claims.sub,
    authRole: typeof claims['role'] === 'string' ? claims['role'] : 'authenticated',
    appMetadata: asRecord(claims['app_metadata']),
    userMetadata: asRecord(claims['user_metadata']),
    issuedAt: claims.iat,
    expiresAt: claims.exp,
  };
  if (typeof claims['email'] === 'string') principal.email = claims['email'];
  if (typeof claims['session_id'] === 'string') principal.sessionId = claims['session_id'];
  return principal;
}

/**
 * Builds a verifier that checks signature, issuer, audience and expiry (spec section 6).
 * Key material: a symmetric secret (HS256), a JWKS (ES256/RS256), or both. With both, the
 * token's own `alg` header selects the key, so a project mid-rotation (legacy secret current,
 * asymmetric key on standby) keeps working.
 */
export function createTokenVerifier(options: TokenVerifierOptions): TokenVerifier {
  const { issuer, audience } = options;
  const clockTolerance = options.clockToleranceSeconds ?? 5;

  if (!options.jwtSecret && !options.jwksUrl && !options.jwks) {
    throw new Error('createTokenVerifier requires jwtSecret, jwksUrl or jwks');
  }

  const secretKey = options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : null;
  const jwks = options.jwks
    ? createLocalJWKSet(options.jwks)
    : options.jwksUrl
      ? createRemoteJWKSet(new URL(options.jwksUrl))
      : null;

  return {
    async verify(token: string): Promise<AuthPrincipal> {
      if (!token) throw new TokenVerificationError('TOKEN_MISSING', 'No bearer token supplied');
      const { alg } = describeTokenHeader(token);
      try {
        const base = { issuer, audience, clockTolerance };
        let payload: JWTPayload;
        if (alg === 'HS256') {
          if (!secretKey) {
            throw new TokenVerificationError(
              'TOKEN_INVALID',
              'Token is HS256-signed but the API has no SUPABASE_JWT_SECRET configured',
            );
          }
          payload = (await jwtVerify(token, secretKey, { ...base, algorithms: ['HS256'] })).payload;
        } else {
          if (!jwks) {
            throw new TokenVerificationError(
              'TOKEN_INVALID',
              `Token is ${alg ?? 'unknown'}-signed but the API has no JWKS configured`,
            );
          }
          payload = (
            await jwtVerify(token, jwks, { ...base, algorithms: [...ASYMMETRIC_ALGORITHMS] })
          ).payload;
        }
        return principalFromClaims(payload);
      } catch (error) {
        if (error instanceof TokenVerificationError) throw error;
        if (error instanceof joseErrors.JWTExpired) {
          throw new TokenVerificationError('TOKEN_EXPIRED', 'Token has expired', { cause: error });
        }
        const reason =
          error instanceof joseErrors.JOSEError ? `${error.code}: ${error.message}` : 'unknown';
        throw new TokenVerificationError(
          'TOKEN_INVALID',
          `Token could not be verified (${reason})`,
          {
            cause: error,
          },
        );
      }
    },
  };
}

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
