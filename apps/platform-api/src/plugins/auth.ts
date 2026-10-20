import {
  describeTokenHeader,
  extractBearerToken,
  TokenVerificationError,
  type AuthPrincipal,
  type TokenVerifier,
} from '@buddyclub/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { sendProblem } from '../problems.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Verified identity, set by `requireAuth`. Null on public routes. */
    principal: AuthPrincipal | null;
  }
  interface FastifyInstance {
    /** preHandler that rejects requests without a valid Supabase access token. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  tokenVerifier: TokenVerifier;
  /** Include the verifier's reason in 401 responses (never in production). */
  exposeReasons?: boolean;
}

export const authPlugin = fp<AuthPluginOptions>(
  async (app, options) => {
    app.decorateRequest('principal', null);

    app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = extractBearerToken(request.headers.authorization);
      if (!token) {
        reply.header('www-authenticate', 'Bearer realm="buddyclub"');
        return sendProblem(
          reply,
          { status: 401, code: 'UNAUTHENTICATED', title: 'Authentication required' },
          request.id,
        );
      }
      try {
        request.principal = await options.tokenVerifier.verify(token);
      } catch (error) {
        const reason = error instanceof TokenVerificationError ? error.message : 'Invalid token';
        // Log enough to diagnose key/algorithm mismatches without ever logging the token.
        request.log.warn(
          { ...describeTokenHeader(token), reason, cause: (error as { cause?: unknown }).cause },
          'access token rejected',
        );
        reply.header('www-authenticate', 'Bearer realm="buddyclub", error="invalid_token"');
        return sendProblem(
          reply,
          {
            status: 401,
            code: 'UNAUTHENTICATED',
            title: 'Authentication required',
            detail: options.exposeReasons ? reason : 'Invalid or expired token',
          },
          request.id,
        );
      }
    });

    // Private responses must never be cached by intermediaries (spec section 6).
    app.addHook('onSend', async (request, reply) => {
      if (request.principal) reply.header('cache-control', 'no-store');
    });
  },
  { name: 'buddyclub-auth', fastify: '5.x' },
);
