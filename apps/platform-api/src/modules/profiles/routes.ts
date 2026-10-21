import {
  MyProfileSchema,
  ProblemDetailsSchema,
  SetActivitiesBodySchema,
  SetGearBodySchema,
  UpdateProfileBodySchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import { getMyProfile, setMyActivities, setMyGear, updateMyProfile } from './service.js';

export interface ProfileRoutesOptions {
  getDb: () => Db;
}

const AUTH = [{ bearerAuth: [] }];
const PROBLEMS = {
  400: ProblemDetailsSchema,
  401: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};

/** Buddy profile (Addendum 1.3): the person's own activities, levels, days, gear and switches. */
export async function profileRoutes(app: FastifyInstance, options: ProfileRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.get(
    '/v1/me/profile',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['profiles'],
        summary: 'Your buddy profile: place, activities with level and days, gear, visibility',
        operationId: 'getMyProfile',
        security: AUTH,
        response: { 200: MyProfileSchema, 401: ProblemDetailsSchema },
      },
    },
    async (request) => getMyProfile(db(), request.actor!),
  );

  typed.patch(
    '/v1/me/profile',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['profiles'],
        summary: 'Update place, bio, visibility switches, 18+ confirmation or an onboarded mark',
        operationId: 'updateMyProfile',
        security: AUTH,
        body: UpdateProfileBodySchema,
        response: { 200: MyProfileSchema, ...PROBLEMS },
      },
    },
    async (request) => updateMyProfile(db(), request.actor!, request.body, ctx(request)),
  );

  typed.put(
    '/v1/me/activities',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['profiles'],
        summary: 'Replace your activities, each with an optional level, days and note',
        operationId: 'setMyActivities',
        security: AUTH,
        body: SetActivitiesBodySchema,
        response: { 200: MyProfileSchema, ...PROBLEMS },
      },
    },
    async (request) => setMyActivities(db(), request.actor!, request.body),
  );

  typed.put(
    '/v1/me/gear',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['profiles'],
        summary: 'Replace your gear list',
        operationId: 'setMyGear',
        security: AUTH,
        body: SetGearBodySchema,
        response: { 200: MyProfileSchema, ...PROBLEMS },
      },
    },
    async (request) => setMyGear(db(), request.actor!, request.body),
  );
}
