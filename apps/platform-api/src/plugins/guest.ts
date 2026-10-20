import { extractBearerToken } from '@buddyclub/auth';
import type { GuestScope } from '@buddyclub/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '../db/index.js';
import type { GuestTokenService } from '../platform/guest-token.js';
import { sendProblem } from '../problems.js';

/** A redeemed guest link acting on a request (ADR-008). Distinct from a signed-in Actor. */
export interface GuestContext {
  participantId: string;
  organisationId: string;
  grantId: string;
  scopes: GuestScope[];
  grantExpiresAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    guest: GuestContext | null;
  }
  interface FastifyInstance {
    /** preHandler: requires a valid, unrevoked guest credential. */
    requireGuest: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface GuestPluginOptions {
  guestTokens: GuestTokenService;
  getDb: () => Db;
}

export const guestPlugin = fp<GuestPluginOptions>(
  async (app, options) => {
    app.decorateRequest('guest', null);

    app.decorate('requireGuest', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = extractBearerToken(request.headers.authorization);
      const reject = (detail: string) => {
        reply.header('www-authenticate', 'Bearer realm="buddyclub-guest", error="invalid_token"');
        return sendProblem(
          reply,
          { status: 401, code: 'UNAUTHENTICATED', title: 'Guest credential required', detail },
          request.id,
        );
      };
      if (!token) return reject('No guest credential supplied');

      let claims;
      try {
        claims = await options.guestTokens.verify(token);
      } catch (error) {
        return reject(error instanceof Error ? error.message : 'Invalid guest credential');
      }

      // Revocation and grant expiry are checked on every request, so a revoked link stops working
      // immediately even though the credential itself is stateless.
      const grant = await options
        .getDb()
        .selectFrom('identity.guest_grants')
        .select(['id', 'participant_id', 'expires_at', 'revoked_at'])
        .where('id', '=', claims.grantId)
        .executeTakeFirst();
      if (!grant || grant.participant_id !== claims.participantId)
        return reject('Guest grant not found');
      if (grant.revoked_at) return reject('Guest link has been revoked');
      if (grant.expires_at.getTime() <= Date.now()) return reject('Guest link has expired');

      request.guest = {
        participantId: claims.participantId,
        organisationId: claims.organisationId,
        grantId: claims.grantId,
        scopes: claims.scopes,
        grantExpiresAt: grant.expires_at,
      };
    });

    app.addHook('onSend', async (request, reply) => {
      if (request.guest) reply.header('cache-control', 'no-store');
    });
  },
  { name: 'buddyclub-guest', fastify: '5.x' },
);
