import {
  BuddyCardSchema,
  BuddySearchQuerySchema,
  BuddySummarySchema,
  HelloSchema,
  listOf,
  ProblemDetailsSchema,
  ReportBuddyBodySchema,
  UuidSchema,
} from '@buddyclub/shared-types';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import {
  blockBuddy,
  getBuddyCard,
  listMyBuddies,
  listMyHellos,
  reportBuddy,
  sayHello,
  searchBuddies,
  unblockBuddy,
} from './service.js';

export interface BuddyRoutesOptions {
  getDb: () => Db;
}

const AUTH = [{ bearerAuth: [] }];
const PROBLEMS = {
  400: ProblemDetailsSchema,
  401: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const Params = z.object({ profileId: UuidSchema });

/** Buddies (Addendum 1.4): people you have played with, Find me, Say hi, block and report. */
export async function buddyRoutes(app: FastifyInstance, options: BuddyRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.get(
    '/v1/me/buddies',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: 'People you have shared a night with, most recent first',
        operationId: 'listMyBuddies',
        security: AUTH,
        response: { 200: listOf(BuddySummarySchema), 401: ProblemDetailsSchema },
      },
    },
    async (request) => ({ items: await listMyBuddies(db(), request.actor!) }),
  );

  typed.get(
    '/v1/me/hellos',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: 'People who said hi to you, newest first; reading marks them seen',
        operationId: 'listMyHellos',
        security: AUTH,
        response: { 200: listOf(HelloSchema), 401: ProblemDetailsSchema },
      },
    },
    async (request) => ({ items: await listMyHellos(db(), request.actor!) }),
  );

  typed.get(
    '/v1/buddies/search',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary:
          'Find me: adults with Find me on, by sport, level, place and when they are free. You must be findable yourself.',
        operationId: 'searchBuddies',
        security: AUTH,
        querystring: BuddySearchQuerySchema,
        response: { 200: listOf(BuddySummarySchema), ...PROBLEMS },
      },
    },
    async (request) => ({ items: await searchBuddies(db(), request.actor!, request.query) }),
  );

  typed.get(
    '/v1/buddies/:profileId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: "A member's card: visible to buddies, or to anyone when they have Find me on",
        operationId: 'getBuddy',
        security: AUTH,
        params: Params,
        response: { 200: BuddyCardSchema, ...PROBLEMS },
      },
    },
    async (request) => getBuddyCard(db(), request.actor!, request.params.profileId),
  );

  typed.post(
    '/v1/buddies/:profileId/hello',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: 'Say hi (once; repeating changes nothing)',
        operationId: 'sayHello',
        security: AUTH,
        params: Params,
        body: z.object({}).optional(),
        response: { 200: BuddyCardSchema, ...PROBLEMS },
      },
    },
    async (request) => sayHello(db(), request.actor!, request.params.profileId, ctx(request)),
  );

  typed.post(
    '/v1/buddies/:profileId/block',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: 'Block: you and they no longer see each other; they are not told',
        operationId: 'blockBuddy',
        security: AUTH,
        params: Params,
        body: z.object({}).optional(),
        response: { 200: BuddyCardSchema, ...PROBLEMS },
      },
    },
    async (request) => blockBuddy(db(), request.actor!, request.params.profileId, ctx(request)),
  );

  typed.delete(
    '/v1/buddies/:profileId/block',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: 'Unblock',
        operationId: 'unblockBuddy',
        security: AUTH,
        params: Params,
        response: { 200: BuddyCardSchema, ...PROBLEMS },
      },
    },
    async (request) => unblockBuddy(db(), request.actor!, request.params.profileId, ctx(request)),
  );

  typed.post(
    '/v1/buddies/:profileId/report',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['buddies'],
        summary: 'Report a person for review; they are not told',
        operationId: 'reportBuddy',
        security: AUTH,
        params: Params,
        body: ReportBuddyBodySchema,
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await reportBuddy(db(), request.actor!, request.params.profileId, request.body, ctx(request));
      return reply.code(204).send(null);
    },
  );
}
