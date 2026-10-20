import {
  AddGroupMemberBodySchema,
  CreateGroupBodySchema,
  GroupDetailSchema,
  GroupIdParamsSchema,
  GroupMemberParamsSchema,
  GroupSchema,
  listOf,
  OrgIdParamsSchema,
  ProblemDetailsSchema,
  SportSchema,
  UpdateGroupBodySchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import { expectedVersion } from '../../platform/if-match.js';
import * as svc from './service.js';

export interface GroupRoutesOptions {
  getDb: () => Db;
}

const PROBLEMS = {
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const AUTH = [{ bearerAuth: [] }];

export async function groupRoutes(app: FastifyInstance, options: GroupRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.get(
    '/v1/sports',
    {
      schema: {
        tags: ['reference'],
        summary: 'Supported sports',
        operationId: 'listSports',
        response: { 200: listOf(SportSchema) },
      },
    },
    async () => {
      const rows = await db()
        .selectFrom('community.sports')
        .select(['id', 'name', 'default_players_per_side'])
        .orderBy('name')
        .execute();
      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          defaultPlayersPerSide: r.default_players_per_side,
        })),
      };
    },
  );

  typed.post(
    '/v1/organisations/:orgId/groups',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['groups'],
        summary: 'Create a group (e.g. Tuesday Social)',
        operationId: 'createGroup',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateGroupBodySchema,
        response: { 201: GroupSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const group = await svc.createGroup(
        db(),
        request.actor!,
        request.params.orgId,
        request.body,
        ctx(request),
      );
      return reply.status(201).send(group);
    },
  );

  typed.get(
    '/v1/organisations/:orgId/groups',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['groups'],
        summary: 'List groups in an organisation',
        operationId: 'listGroups',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(GroupSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listGroups(db(), request.actor!, request.params.orgId),
    }),
  );

  typed.get(
    '/v1/groups/:groupId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['groups'],
        summary: 'Group with its active members',
        operationId: 'getGroup',
        security: AUTH,
        params: GroupIdParamsSchema,
        response: { 200: GroupDetailSchema, ...PROBLEMS },
      },
    },
    async (request) => svc.getGroup(db(), request.actor!, request.params.groupId),
  );

  typed.patch(
    '/v1/groups/:groupId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['groups'],
        summary: 'Update a group (If-Match: version)',
        operationId: 'updateGroup',
        security: AUTH,
        params: GroupIdParamsSchema,
        body: UpdateGroupBodySchema,
        response: { 200: GroupSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateGroup(
        db(),
        request.actor!,
        request.params.groupId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );

  typed.post(
    '/v1/groups/:groupId/members',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['groups'],
        summary: 'Add a participant (registered or guest) to a group',
        operationId: 'addGroupMember',
        security: AUTH,
        params: GroupIdParamsSchema,
        body: AddGroupMemberBodySchema,
        response: { 200: GroupDetailSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.addGroupMember(
        db(),
        request.actor!,
        request.params.groupId,
        request.body.participantId,
        ctx(request),
      ),
  );

  typed.delete(
    '/v1/groups/:groupId/members/:participantId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['groups'],
        summary: 'Remove a participant from a group',
        operationId: 'removeGroupMember',
        security: AUTH,
        params: GroupMemberParamsSchema,
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await svc.removeGroupMember(
        db(),
        request.actor!,
        request.params.groupId,
        request.params.participantId,
        ctx(request),
      );
      return reply.status(204).send(null);
    },
  );
}
