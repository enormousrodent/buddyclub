/** The verified identity behind a request. Derived only from a validated Supabase access token. */
export interface AuthPrincipal {
  /** `sub` claim: the Supabase `auth.users.id`. */
  authUserId: string;
  email?: string;
  /** Supabase Postgres role claim, normally `authenticated`. Not a business role. */
  authRole: string;
  sessionId?: string;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
}

export type TokenErrorCode = 'TOKEN_MISSING' | 'TOKEN_INVALID' | 'TOKEN_EXPIRED';

export class TokenVerificationError extends Error {
  constructor(
    public readonly code: TokenErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'TokenVerificationError';
  }
}
