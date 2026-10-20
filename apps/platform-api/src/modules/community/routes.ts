import {
  ActivityIdParamsSchema,
  ActivitySchema,
  CreateActivityBodySchema,
  CreateCommunityGroupBodySchema,
  DiscoverQuerySchema,
  DiscoverResultSchema,
  GroupCardSchema,
  GroupIdParamsSchema,
  InterestSchema,
  LinkRallyBodySchema,
  listOf,
  MyCommunitySchema,
  MyGroupSchema,
  ProblemDetailsSchema,
  RsvpBodySchema,
  UpdateCommunityGroupBodySchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import * as svc from './service.js';

export interface CommunityRoutesOptions {
  getDb: () => Db;
  rateLimited: (max: number) => Record<string, unknown>;
}

const PROBLEMS = {
  400: ProblemDetailsSchema,
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const AUTH = [{ bearerAuth: [] }];
const GroupPageSchema = z.object({
  group: GroupCardSchema,
  activities: z.array(ActivitySchema),
  myRole: z.enum(['organiser', 'member']).nullable(),
});

/** Buddy Club community: interests, discovery, groups, activities and RSVPs (ADR-018). */
export async function communityRoutes(app: FastifyInstance, options: CommunityRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });
  const manage = [app.requireActor, app.idempotent];
  const T = ['community'];

  typed.get(
    '/v1/interests',
    {
      schema: {
        tags: T,
        summary: 'Interest categories (sports are one of many)',
        operationId: 'listInterests',
        response: { 200: listOf(InterestSchema) },
      },
    },
    async () => ({ items: await svc.listInterests(db()) }),
  );

  typed.get(
    '/v1/public/discover',
    {
      config: options.rateLimited(120),
      schema: {
        tags: T,
        summary: 'Public groups and upcoming activities by text, interest and locality',
        operationId: 'discover',
        querystring: DiscoverQuerySchema,
        response: {
          200: DiscoverResultSchema,
          400: ProblemDetailsSchema,
          429: ProblemDetailsSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'public, max-age=30');
      return svc.discover(db(), request.query);
    },
  );

  typed.post(
    '/v1/community/groups',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Create a community group (a club is created around it when none is given)',
        operationId: 'createCommunityGroup',
        security: AUTH,
        body: CreateCommunityGroupBodySchema,
        response: { 201: GroupCardSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await svc.createCommunityGroup(db(), request.actor!, request.body, ctx(request))),
  );

  typed.get(
    '/v1/community/groups/:groupId',
    {
      preHandler: app.optionalActor,
      schema: {
        tags: T,
        summary: 'Group page: public for public groups, members only otherwise',
        operationId: 'getCommunityGroup',
        params: GroupIdParamsSchema,
        response: { 200: GroupPageSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      if (!request.actor) reply.header('cache-control', 'public, max-age=30');
      return svc.getCommunityGroup(db(), request.actor ?? null, request.params.groupId);
    },
  );

  typed.patch(
    '/v1/community/groups/:groupId',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Update a group (organisers)',
        operationId: 'updateCommunityGroup',
        security: AUTH,
        params: GroupIdParamsSchema,
        body: UpdateCommunityGroupBodySchema,
        response: { 200: GroupCardSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateCommunityGroup(
        db(),
        request.actor!,
        request.params.groupId,
        request.body,
        ctx(request),
      ),
  );

  typed.post(
    '/v1/community/groups/:groupId/join',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Join a public open group (becomes a club member if needed)',
        operationId: 'joinGroup',
        security: AUTH,
        params: GroupIdParamsSchema,
        response: { 200: MyGroupSchema, ...PROBLEMS },
      },
    },
    async (request) => svc.joinGroup(db(), request.actor!, request.params.groupId, ctx(request)),
  );

  typed.post(
    '/v1/community/groups/:groupId/activities',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Create a gathering in a group, optionally run by a Rally session',
        operationId: 'createActivity',
        security: AUTH,
        params: GroupIdParamsSchema,
        body: CreateActivityBodySchema,
        response: { 201: ActivitySchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await svc.createActivity(
            db(),
            request.actor!,
            request.params.groupId,
            request.body,
            ctx(request),
          ),
        ),
  );

  typed.get(
    '/v1/community/activities/:activityId',
    {
      preHandler: app.optionalActor,
      schema: {
        tags: T,
        summary: 'Activity details with counts and, when signed in, your RSVP',
        operationId: 'getActivity',
        params: ActivityIdParamsSchema,
        response: { 200: ActivitySchema, ...PROBLEMS },
      },
    },
    async (request) => svc.getActivity(db(), request.actor ?? null, request.params.activityId),
  );

  typed.post(
    '/v1/community/activities/:activityId/rsvp',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'RSVP going, maybe or not going (registers on the Rally session when linked)',
        operationId: 'rsvp',
        security: AUTH,
        params: ActivityIdParamsSchema,
        body: RsvpBodySchema,
        response: { 200: ActivitySchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.rsvp(db(), request.actor!, request.params.activityId, request.body.status, ctx(request)),
  );

  typed.post(
    '/v1/community/activities/:activityId/cancel',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Cancel an activity (organisers)',
        operationId: 'cancelActivity',
        security: AUTH,
        params: ActivityIdParamsSchema,
        response: { 200: ActivitySchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.cancelActivity(db(), request.actor!, request.params.activityId, ctx(request)),
  );

  typed.post(
    '/v1/community/activities/:activityId/rally-link',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Link or unlink the Rally session that runs this activity (session organisers)',
        operationId: 'linkRally',
        security: AUTH,
        params: ActivityIdParamsSchema,
        body: LinkRallyBodySchema,
        response: { 200: ActivitySchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.linkRally(
        db(),
        request.actor!,
        request.params.activityId,
        request.body.occurrenceId,
        ctx(request),
      ),
  );

  typed.get(
    '/v1/me/community',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Your groups and upcoming gatherings',
        operationId: 'getMyCommunity',
        security: AUTH,
        response: { 200: MyCommunitySchema, 401: ProblemDetailsSchema },
      },
    },
    async (request) => svc.myCommunity(db(), request.actor!),
  );
}
