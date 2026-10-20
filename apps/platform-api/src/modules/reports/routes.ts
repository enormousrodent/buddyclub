import {
  ImportResultSchema,
  MeetIdParamsSchema,
  OccurrenceIdParamsSchema,
  OrgIdParamsSchema,
  ProblemDetailsSchema,
  TeamsImportBodySchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import { importTeams, meetCsv, occurrenceCsv, standingsCsv } from './service.js';

export interface ReportRoutesOptions {
  getDb: () => Db;
}

const PROBLEMS = {
  400: ProblemDetailsSchema,
  401: ProblemDetailsSchema,
  403: ProblemDetailsSchema,
  404: ProblemDetailsSchema,
  409: ProblemDetailsSchema,
};
const AUTH = [{ bearerAuth: [] }];

/** CSV import and export. Exports return `text/csv`; the OpenAPI document lists them as text. */
export async function reportRoutes(app: FastifyInstance, options: ReportRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const T = ['reports'];

  typed.post(
    '/v1/organisations/:orgId/teams/import',
    {
      preHandler: [app.requireActor, app.idempotent],
      schema: {
        tags: T,
        summary: 'Import teams and rosters from CSV (team,player[,captain])',
        operationId: 'importTeams',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: TeamsImportBodySchema,
        response: { 200: ImportResultSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      importTeams(db(), request.actor!, request.params.orgId, request.body.csv, {
        correlationId: request.id,
      }),
  );

  const csv = (reply: { header: (k: string, v: string) => unknown }, name: string) => {
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${name}"`);
    reply.header('cache-control', 'no-store');
  };

  typed.get(
    '/v1/meets/:meetId/export.csv',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Fixtures, rubbers, courts and results of a meet as CSV',
        operationId: 'exportMeetCsv',
        security: AUTH,
        params: MeetIdParamsSchema,
        produces: ['text/csv'],
      },
    },
    async (request, reply) => {
      csv(reply, `meet-${request.params.meetId}.csv`);
      return reply.send(await meetCsv(db(), request.actor!, request.params.meetId));
    },
  );

  typed.get(
    '/v1/meets/:meetId/standings.csv',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Standings per division as CSV',
        operationId: 'exportStandingsCsv',
        security: AUTH,
        params: MeetIdParamsSchema,
        produces: ['text/csv'],
      },
    },
    async (request, reply) => {
      csv(reply, `standings-${request.params.meetId}.csv`);
      return reply.send(await standingsCsv(db(), request.actor!, request.params.meetId));
    },
  );

  typed.get(
    '/v1/occurrences/:occurrenceId/export.csv',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Rounds and court assignments of a session as CSV',
        operationId: 'exportOccurrenceCsv',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        produces: ['text/csv'],
      },
    },
    async (request, reply) => {
      csv(reply, `session-${request.params.occurrenceId}.csv`);
      return reply.send(await occurrenceCsv(db(), request.actor!, request.params.occurrenceId));
    },
  );
}
