import {
  CreateGuestGrantBodySchema,
  CreateParticipantBodySchema,
  GuestGrantCreatedSchema,
  GuestGrantSchema,
  listOf,
  OrgIdParamsSchema,
  ParticipantSchema,
  ProblemDetailsSchema,
  UpdateParticipantBodySchema,
  UuidSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import { expectedVersion } from '../../platform/if-match.js';
import { AppError } from '../../problems.js';
import * as svc from './service.js';

export interface ParticipantRoutesOptions {
  getDb: () => Db;
}

const PROBLEMS = {
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const AUTH = [{ bearerAuth: [] }];
const ParticipantParams = OrgIdParamsSchema.extend({ participantId: UuidSchema });

export async function participantRoutes(app: FastifyInstance, options: ParticipantRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.post(
    '/v1/organisations/:orgId/participants',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['participants'],
        summary: 'Add a guest participant by name (no account needed)',
        operationId: 'createParticipant',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateParticipantBodySchema,
        response: { 201: ParticipantSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const created = await svc.createParticipant(
        db(),
        request.actor!,
        request.params.orgId,
        request.body,
        ctx(request),
      );
      return reply.status(201).send(created);
    },
  );

  typed.get(
    '/v1/organisations/:orgId/participants',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['participants'],
        summary: 'List participants in an organisation',
        operationId: 'listParticipants',
        security: AUTH,
        params: OrgIdParamsSchema,
        querystring: z.object({ includeArchived: z.enum(['true', 'false']).optional() }),
        response: { 200: listOf(ParticipantSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listParticipants(
        db(),
        request.actor!,
        request.params.orgId,
        request.query.includeArchived === 'true',
      ),
    }),
  );

  typed.get(
    '/v1/organisations/:orgId/participants/:participantId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['participants'],
        summary: 'Get a participant',
        operationId: 'getParticipant',
        security: AUTH,
        params: ParticipantParams,
        response: { 200: ParticipantSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.getParticipant(db(), request.actor!, request.params.orgId, request.params.participantId),
  );

  typed.patch(
    '/v1/organisations/:orgId/participants/:participantId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['participants'],
        summary: 'Update a participant (If-Match: version)',
        operationId: 'updateParticipant',
        security: AUTH,
        params: ParticipantParams,
        body: UpdateParticipantBodySchema,
        response: { 200: ParticipantSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateParticipant(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.participantId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );

  typed.post(
    '/v1/organisations/:orgId/participants/:participantId/archive',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['participants'],
        summary: 'Archive a participant and revoke their guest links; history is kept',
        operationId: 'archiveParticipant',
        security: AUTH,
        params: ParticipantParams,
        response: { 200: ParticipantSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.archiveParticipant(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.participantId,
        ctx(request),
      ),
  );

  typed.post(
    '/v1/organisations/:orgId/participants/:participantId/guest-grants',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['guest-access'],
        summary: 'Issue a guest view link for a participant; the token is returned once',
        operationId: 'createGuestGrant',
        security: AUTH,
        params: ParticipantParams,
        body: CreateGuestGrantBodySchema,
        response: { 201: GuestGrantCreatedSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const created = await svc.createGuestGrant(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.participantId,
        request.body,
        ctx(request),
      );
      return reply.status(201).send(created);
    },
  );

  typed.get(
    '/v1/organisations/:orgId/participants/:participantId/guest-grants',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['guest-access'],
        summary: 'List guest links issued for a participant',
        operationId: 'listGuestGrants',
        security: AUTH,
        params: ParticipantParams,
        response: { 200: listOf(GuestGrantSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listGuestGrants(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.participantId,
      ),
    }),
  );

  typed.delete(
    '/v1/organisations/:orgId/participants/:participantId/guest-grants/:grantId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['guest-access'],
        summary: 'Revoke a guest link immediately',
        operationId: 'revokeGuestGrant',
        security: AUTH,
        params: ParticipantParams.extend({ grantId: UuidSchema }),
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await svc.revokeGuestGrant(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.participantId,
        request.params.grantId,
        ctx(request),
      );
      return reply.status(204).send(null);
    },
  );

  // Guest-to-account linking waits on ADR-008 (proof of identity). Reserved paths return 501.
  for (const suffix of ['claim-intents', 'confirm-claim'] as const) {
    typed.post(
      `/v1/organisations/:orgId/participants/:participantId/${suffix}`,
      {
        preHandler: app.requireActor,
        schema: {
          tags: ['participants'],
          summary: `Reserved: guest claim (${suffix}); disabled until ADR-008 is decided`,
          operationId: suffix === 'claim-intents' ? 'createClaimIntent' : 'confirmClaim',
          security: AUTH,
          params: ParticipantParams,
          response: { 501: ProblemDetailsSchema, ...PROBLEMS },
        },
      },
      async () => {
        throw new AppError(
          501,
          'NOT_IMPLEMENTED',
          'Guest claim is not available yet',
          'See ADR-008',
        );
      },
    );
  }
}
