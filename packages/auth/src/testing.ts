import { SignJWT } from 'jose';

export interface TestTokenInput {
  secret: string;
  issuer: string;
  audience: string;
  sub: string;
  email?: string;
  role?: string;
  sessionId?: string;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
  /** Seconds from `issuedAt` until expiry. Negative values produce an already-expired token. */
  expiresInSeconds?: number;
  /** Unix seconds; defaults to now. */
  issuedAt?: number;
}

/** Mints an HS256 token shaped like a Supabase access token. Test use only. */
export async function signTestToken(input: TestTokenInput): Promise<string> {
  const iat = input.issuedAt ?? Math.floor(Date.now() / 1000);
  const exp = iat + (input.expiresInSeconds ?? 3600);
  const claims: Record<string, unknown> = {
    role: input.role ?? 'authenticated',
    app_metadata: input.appMetadata ?? { provider: 'email', providers: ['email'] },
    user_metadata: input.userMetadata ?? {},
  };
  if (input.email) claims['email'] = input.email;
  if (input.sessionId) claims['session_id'] = input.sessionId;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.sub)
    .setIssuer(input.issuer)
    .setAudience(input.audience)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(input.secret));
}
