import {
  JoinResultSchema,
  OccurrenceIdParamsSchema,
  MeetIdParamsSchema,
  ProblemDetailsSchema,
  PublicAccessBodySchema,
  PublicAccessSchema,
  PublicBoardSchema,
  PublicEventSchema,
  PublicSlugParamsSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import { setMeetPublicAccess } from '../competitions/meets.js';
import { joinEvent, publicBoard, publicEvent, setOccurrencePublicAccess } from './service.js';

export interface PublicRoutesOptions {
  getDb: () => Db;
  rateLimited: (max: number) => Record<string, unknown>;
}

const PROBLEMS = {
  400: ProblemDetailsSchema,
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
  429: ProblemDetailsSchema,
};

/** Public boards, QR landing and the organiser switches that enable them (ADR-016). */
export async function publicRoutes(app: FastifyInstance, options: PublicRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });
  const T = ['public'];

  typed.get(
    '/v1/public/events/:slug',
    {
      config: options.rateLimited(120),
      preHandler: app.optionalActor,
      schema: {
        tags: T,
        summary: 'Public summary of a session or meet (QR landing); viewer facts when signed in',
        operationId: 'getPublicEvent',
        params: PublicSlugParamsSchema,
        response: { 200: PublicEventSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      return publicEvent(db(), request.params.slug, request.actor ?? null);
    },
  );

  typed.get(
    '/v1/public/events/:slug/board',
    {
      config: options.rateLimited(240),
      schema: {
        tags: T,
        summary: 'Redacted live board for a venue screen or spectators',
        operationId: 'getPublicBoard',
        params: PublicSlugParamsSchema,
        response: { 200: PublicBoardSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'public, max-age=5');
      return publicBoard(db(), request.params.slug);
    },
  );

  typed.post(
    '/v1/public/events/:slug/join',
    {
      config: options.rateLimited(30),
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: T,
        summary: 'Register or check in to a session from its QR code (club members only)',
        operationId: 'joinPublicEvent',
        security: [{ bearerAuth: [] }],
        params: PublicSlugParamsSchema,
        response: { 200: JoinResultSchema, ...PROBLEMS },
      },
    },
    async (request) => joinEvent(db(), request.actor!, request.params.slug, ctx(request)),
  );

  typed.post(
    '/v1/meets/:meetId/public-access',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: T,
        summary: 'Enable or disable the public board for a meet',
        operationId: 'setMeetPublicAccess',
        security: [{ bearerAuth: [] }],
        params: MeetIdParamsSchema,
        body: PublicAccessBodySchema,
        response: { 200: PublicAccessSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      setMeetPublicAccess(
        db(),
        request.actor!,
        request.params.meetId,
        request.body.enabled,
        ctx(request),
      ),
  );

  typed.post(
    '/v1/occurrences/:occurrenceId/public-access',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: T,
        summary: 'Enable or disable the public board and QR join for a session',
        operationId: 'setOccurrencePublicAccess',
        security: [{ bearerAuth: [] }],
        params: OccurrenceIdParamsSchema,
        body: PublicAccessBodySchema,
        response: { 200: PublicAccessSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      setOccurrencePublicAccess(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.body.enabled,
        ctx(request),
      ),
  );
}
