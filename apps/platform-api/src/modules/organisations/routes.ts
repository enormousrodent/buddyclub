import {
  CreateInvitationBodySchema,
  CreateOrganisationBodySchema,
  InvitationCreatedSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  InvitationTokenParamsSchema,
  listOf,
  MemberSchema,
  OrganisationSchema,
  OrgIdParamsSchema,
  ProblemDetailsSchema,
  RedeemInvitationResponseSchema,
  UpdateMemberBodySchema,
  UpdateOrganisationBodySchema,
  UuidSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import { expectedVersion } from '../../platform/if-match.js';
import * as svc from './service.js';

export interface OrganisationRoutesOptions {
  getDb: () => Db;
  rateLimited: (max: number) => Record<string, unknown>;
}

const PROBLEMS = {
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const AUTH = [{ bearerAuth: [] }];

export async function organisationRoutes(app: FastifyInstance, options: OrganisationRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.post(
    '/v1/organisations',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['organisations'],
        summary: 'Create an organisation (club); the caller becomes org admin',
        operationId: 'createOrganisation',
        security: AUTH,
        body: CreateOrganisationBodySchema,
        response: { 201: OrganisationSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const org = await svc.createOrganisation(db(), request.actor!, request.body, ctx(request));
      return reply.status(201).send(org);
    },
  );

  typed.get(
    '/v1/organisations/:orgId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['organisations'],
        summary: 'Get an organisation the caller belongs to',
        operationId: 'getOrganisation',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: OrganisationSchema, ...PROBLEMS },
      },
    },
    async (request) => svc.getOrganisation(db(), request.actor!, request.params.orgId),
  );

  typed.patch(
    '/v1/organisations/:orgId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['organisations'],
        summary: 'Update an organisation (If-Match: version)',
        operationId: 'updateOrganisation',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: UpdateOrganisationBodySchema,
        response: { 200: OrganisationSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateOrganisation(
        db(),
        request.actor!,
        request.params.orgId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );

  typed.get(
    '/v1/organisations/:orgId/members',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['organisations'],
        summary: 'List members and their roles',
        operationId: 'listMembers',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(MemberSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listMembers(db(), request.actor!, request.params.orgId),
    }),
  );

  typed.patch(
    '/v1/organisations/:orgId/members/:profileId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['organisations'],
        summary: 'Change a member role or suspend/reactivate',
        operationId: 'updateMember',
        security: AUTH,
        params: OrgIdParamsSchema.extend({ profileId: UuidSchema }),
        body: UpdateMemberBodySchema,
        response: { 200: MemberSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateMember(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.profileId,
        request.body,
        ctx(request),
      ),
  );

  typed.delete(
    '/v1/organisations/:orgId/members/:profileId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['organisations'],
        summary: 'Remove a member (or leave, when it is yourself)',
        operationId: 'removeMember',
        security: AUTH,
        params: OrgIdParamsSchema.extend({ profileId: UuidSchema }),
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await svc.removeMember(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.profileId,
        ctx(request),
      );
      return reply.status(204).send(null);
    },
  );

  typed.post(
    '/v1/organisations/:orgId/invitations',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['invitations'],
        summary: 'Create an invitation link; the token is returned once',
        operationId: 'createInvitation',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateInvitationBodySchema,
        response: { 201: InvitationCreatedSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const created = await svc.createInvitation(
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
    '/v1/organisations/:orgId/invitations',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['invitations'],
        summary: 'List invitations (without tokens)',
        operationId: 'listInvitations',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(InvitationSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listInvitations(db(), request.actor!, request.params.orgId),
    }),
  );

  typed.delete(
    '/v1/organisations/:orgId/invitations/:invitationId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['invitations'],
        summary: 'Revoke an invitation link',
        operationId: 'revokeInvitation',
        security: AUTH,
        params: OrgIdParamsSchema.extend({ invitationId: UuidSchema }),
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await svc.revokeInvitation(
        db(),
        request.actor!,
        request.params.orgId,
        request.params.invitationId,
        ctx(request),
      );
      return reply.status(204).send(null);
    },
  );

  typed.get(
    '/v1/invitations/:token/preview',
    {
      config: options.rateLimited(30),
      schema: {
        tags: ['invitations'],
        summary: 'Preview an invitation before signing in (organisation name and role only)',
        operationId: 'previewInvitation',
        params: InvitationTokenParamsSchema,
        response: {
          200: InvitationPreviewSchema,
          404: ProblemDetailsSchema,
          429: ProblemDetailsSchema,
        },
      },
    },
    async (request) => svc.previewInvitation(db(), request.params.token),
  );

  typed.post(
    '/v1/invitations/:token/redeem',
    {
      config: options.rateLimited(30),
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['invitations'],
        summary: 'Join the organisation using an invitation link',
        operationId: 'redeemInvitation',
        security: AUTH,
        params: InvitationTokenParamsSchema,
        response: { 200: RedeemInvitationResponseSchema, ...PROBLEMS, 429: ProblemDetailsSchema },
      },
    },
    async (request) =>
      svc.redeemInvitation(db(), request.actor!, request.params.token, ctx(request)),
  );
  typed.post(
    '/v1/me/workspace',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['organisations'],
        summary: 'Your personal Rally workspace (created on first call); run sessions with no club',
        operationId: 'ensurePersonalWorkspace',
        security: [{ bearerAuth: [] }],
        response: { 200: OrganisationSchema, 401: ProblemDetailsSchema },
      },
    },
    async (request) =>
      svc.ensurePersonalWorkspace(options.getDb(), request.actor!, { correlationId: request.id }),
  );
}
