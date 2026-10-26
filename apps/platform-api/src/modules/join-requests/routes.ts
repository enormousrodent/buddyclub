import {
  CreateJoinRequestBodySchema,
  JoinRequestSchema,
  JoinRequestStatusSchema,
  listOf,
  ProblemDetailsSchema,
  UuidSchema,
} from '@buddyclub/shared-types';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import {
  decideJoinRequest,
  inbox,
  listMyJoinRequests,
  listOrgJoinRequests,
  requestToJoin,
} from './service.js';

export interface JoinRequestRoutesOptions {
  getDb: () => Db;
}

const AUTH = [{ bearerAuth: [] }];
const PROBLEMS = {
  400: ProblemDetailsSchema,
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const T = ['join-requests'];

/** Ask to join a club through one of its public sessions; organisers approve or decline. */
export async function joinRequestRoutes(app: FastifyInstance, options: JoinRequestRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.post(
    '/v1/sessions/:seriesId/join-requests',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary:
          'Ask to join the club behind a public, invitation-only session (201 new, 200 already asked)',
        operationId: 'requestToJoin',
        security: AUTH,
        params: z.object({ seriesId: UuidSchema }),
        body: CreateJoinRequestBodySchema.optional(),
        response: { 200: JoinRequestSchema, 201: JoinRequestSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const { request: r, created } = await requestToJoin(
        db(),
        request.actor!,
        request.params.seriesId,
        request.body ?? {},
        ctx(request),
      );
      return reply.code(created ? 201 : 200).send(r);
    },
  );

  typed.get(
    '/v1/me/join-requests',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Your own requests, newest first',
        operationId: 'listMyJoinRequests',
        security: AUTH,
        response: { 200: listOf(JoinRequestSchema), 401: ProblemDetailsSchema },
      },
    },
    async (request) => ({ items: await listMyJoinRequests(db(), request.actor!) }),
  );

  typed.get(
    '/v1/me/join-requests/inbox',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Pending requests across every club you may invite into',
        operationId: 'joinRequestInbox',
        security: AUTH,
        response: { 200: listOf(JoinRequestSchema), 401: ProblemDetailsSchema },
      },
    },
    async (request) => ({ items: await inbox(db(), request.actor!) }),
  );

  typed.get(
    '/v1/organisations/:orgId/join-requests',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: "A club's requests, pending by default",
        operationId: 'listOrgJoinRequests',
        security: AUTH,
        params: z.object({ orgId: UuidSchema }),
        querystring: z.object({ status: JoinRequestStatusSchema.optional() }),
        response: { 200: listOf(JoinRequestSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await listOrgJoinRequests(
        db(),
        request.actor!,
        request.params.orgId,
        request.query.status ?? 'pending',
      ),
    }),
  );

  for (const decision of ['approve', 'decline'] as const)
    typed.post(
      `/v1/organisations/:orgId/join-requests/:requestId/${decision}`,
      {
        preHandler: app.requireActor,
        schema: {
          tags: T,
          summary:
            decision === 'approve'
              ? 'Approve: club member, player record, regular of the session asked about'
              : 'Decline; the person may ask again later',
          operationId: decision === 'approve' ? 'approveJoinRequest' : 'declineJoinRequest',
          security: AUTH,
          params: z.object({ orgId: UuidSchema, requestId: UuidSchema }),
          body: z.object({}).optional(),
          response: { 200: JoinRequestSchema, ...PROBLEMS },
        },
      },
      async (request) =>
        decideJoinRequest(
          db(),
          request.actor!,
          request.params.orgId,
          request.params.requestId,
          decision === 'approve',
          ctx(request),
        ),
    );
}
