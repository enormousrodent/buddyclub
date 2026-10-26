import {
  ClaimBodySchema,
  ClaimPreviewSchema,
  ClaimResultSchema,
  GuestMeSchema,
  GuestRedeemBodySchema,
  GuestSessionSchema,
  ProblemDetailsSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import type { GuestTokenService } from '../../platform/guest-token.js';
import { guestMe, redeemGuestLink, claimGuest, previewClaim } from './service.js';

export interface GuestRoutesOptions {
  getDb: () => Db;
  guestTokens: GuestTokenService;
  rateLimited: (max: number) => Record<string, unknown>;
}

export async function guestRoutes(app: FastifyInstance, options: GuestRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/guest-access/redeem',
    {
      config: options.rateLimited(20),
      schema: {
        tags: ['guest-access'],
        summary: 'Exchange a guest link token for a short-lived guest credential',
        operationId: 'redeemGuestLink',
        body: GuestRedeemBodySchema,
        response: {
          200: GuestSessionSchema,
          404: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
          429: ProblemDetailsSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      return redeemGuestLink(options.getDb(), options.guestTokens, request.body.token, request.id);
    },
  );

  typed.get(
    '/v1/guest/me',
    {
      preHandler: app.requireGuest,
      schema: {
        tags: ['guest-access'],
        summary: 'What this guest credential can see',
        operationId: 'getGuestMe',
        security: [{ bearerAuth: [] }],
        response: { 200: GuestMeSchema, 401: ProblemDetailsSchema, 404: ProblemDetailsSchema },
      },
    },
    async (request) => guestMe(options.getDb(), request.guest!),
  );

  typed.get(
    '/v1/guest/claim',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['guest'],
        summary: 'What claiming a guest link would do (ADR-008)',
        operationId: 'previewClaim',
        security: [{ bearerAuth: [] }],
        querystring: ClaimBodySchema,
        response: { 200: ClaimPreviewSchema, 401: ProblemDetailsSchema, 404: ProblemDetailsSchema },
      },
    },
    async (request) => previewClaim(options.getDb(), request.actor!, request.query.token),
  );

  typed.post(
    '/v1/guest/claim',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['guest'],
        summary: 'Take over the name-only player a guest link points at; the link is spent',
        operationId: 'claimGuest',
        security: [{ bearerAuth: [] }],
        body: ClaimBodySchema,
        response: {
          200: ClaimResultSchema,
          401: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
          409: ProblemDetailsSchema,
        },
      },
    },
    async (request) =>
      claimGuest(options.getDb(), request.actor!, request.body.token, {
        correlationId: request.id,
      }),
  );
}
