import {
  CourtIdParamsSchema,
  CourtSchema,
  CreateCourtBodySchema,
  CreateVenueBodySchema,
  listOf,
  OrgIdParamsSchema,
  ProblemDetailsSchema,
  UpdateCourtBodySchema,
  UpdateVenueBodySchema,
  VenueDetailSchema,
  VenueIdParamsSchema,
  VenueSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import { expectedVersion } from '../../platform/if-match.js';
import * as svc from './service.js';

export interface FacilityRoutesOptions {
  getDb: () => Db;
}

const PROBLEMS = {
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const AUTH = [{ bearerAuth: [] }];

export async function facilityRoutes(app: FastifyInstance, options: FacilityRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });

  typed.post(
    '/v1/organisations/:orgId/venues',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['facilities'],
        summary: 'Create a venue',
        operationId: 'createVenue',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateVenueBodySchema,
        response: { 201: VenueSchema, 400: ProblemDetailsSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const venue = await svc.createVenue(
        db(),
        request.actor!,
        request.params.orgId,
        request.body,
        ctx(request),
      );
      return reply.status(201).send(venue);
    },
  );

  typed.get(
    '/v1/organisations/:orgId/venues',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['facilities'],
        summary: 'List venues',
        operationId: 'listVenues',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(VenueSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listVenues(db(), request.actor!, request.params.orgId),
    }),
  );

  typed.get(
    '/v1/venues/:venueId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['facilities'],
        summary: 'Venue with its courts',
        operationId: 'getVenue',
        security: AUTH,
        params: VenueIdParamsSchema,
        response: { 200: VenueDetailSchema, ...PROBLEMS },
      },
    },
    async (request) => svc.getVenue(db(), request.actor!, request.params.venueId),
  );

  typed.patch(
    '/v1/venues/:venueId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['facilities'],
        summary: 'Update a venue (If-Match: version)',
        operationId: 'updateVenue',
        security: AUTH,
        params: VenueIdParamsSchema,
        body: UpdateVenueBodySchema,
        response: { 200: VenueSchema, 400: ProblemDetailsSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateVenue(
        db(),
        request.actor!,
        request.params.venueId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );

  typed.post(
    '/v1/venues/:venueId/courts',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['facilities'],
        summary: 'Add a court to a venue',
        operationId: 'createCourt',
        security: AUTH,
        params: VenueIdParamsSchema,
        body: CreateCourtBodySchema,
        response: { 201: CourtSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const court = await svc.createCourt(
        db(),
        request.actor!,
        request.params.venueId,
        request.body,
        ctx(request),
      );
      return reply.status(201).send(court);
    },
  );

  typed.patch(
    '/v1/courts/:courtId',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: ['facilities'],
        summary: 'Update or deactivate a court',
        operationId: 'updateCourt',
        security: AUTH,
        params: CourtIdParamsSchema,
        body: UpdateCourtBodySchema,
        response: { 200: CourtSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      svc.updateCourt(db(), request.actor!, request.params.courtId, request.body, ctx(request)),
  );
}
