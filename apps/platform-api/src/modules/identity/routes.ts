import {
  MeResponseSchema,
  ProblemDetailsSchema,
  UpdateMeBodySchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IdentityRepository } from './repository.js';
import { getMe, updateMe } from './service.js';

export interface IdentityRoutesOptions {
  identityRepo: IdentityRepository;
}

export async function identityRoutes(app: FastifyInstance, options: IdentityRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/v1/me',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['identity'],
        summary: 'Current account: shared profile, organisation memberships, participants and apps',
        operationId: 'getMe',
        security: [{ bearerAuth: [] }],
        response: { 200: MeResponseSchema, 401: ProblemDetailsSchema },
      },
    },
    async (request) => getMe(options.identityRepo, request.principal!),
  );

  typed.patch(
    '/v1/me',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['identity'],
        summary: 'Update display name or locale',
        operationId: 'updateMe',
        security: [{ bearerAuth: [] }],
        body: UpdateMeBodySchema,
        response: { 200: MeResponseSchema, 401: ProblemDetailsSchema },
      },
    },
    async (request) => updateMe(options.identityRepo, request.principal!, request.body),
  );
}
