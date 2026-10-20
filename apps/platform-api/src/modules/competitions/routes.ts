import {
  CommitProgressionBodySchema,
  CompetitionIdParamsSchema,
  CompetitionSchema,
  CourtCallBodySchema,
  CreateCompetitionBodySchema,
  CreateMeetBodySchema,
  CreateSeasonBodySchema,
  CreateTeamBodySchema,
  DisputeSchema,
  FixtureIdParamsSchema,
  KnockoutAdvanceSchema,
  ResolveDisputeBodySchema,
  SetMeetEntriesBodySchema,
  FixturePreviewSchema,
  FixtureSchema,
  LineupBodySchema,
  listOf,
  MatchIdParamsSchema,
  MeetIdParamsSchema,
  MyCompetitionsSchema,
  MeetSchema,
  OrgIdParamsSchema,
  ProblemDetailsSchema,
  ProgressionPreviewSchema,
  RosterChangeBodySchema,
  SeasonIdParamsSchema,
  SeasonSchema,
  SetDivisionCourtsBodySchema,
  SetDivisionTeamsBodySchema,
  StandingsSchema,
  SubmitResultBodySchema,
  TeamDetailSchema,
  TeamIdParamsSchema,
  TeamSchema,
  UpdateTeamBodySchema,
  UuidSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import { expectedVersion } from '../../platform/if-match.js';
import * as meets from './meets.js';
import { myCompetitions } from './mine.js';
import * as results from './results.js';
import * as svc from './service.js';
import * as standings from './standings.js';
import * as teams from './teams.js';

export interface CompetitionRoutesOptions {
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
const CompetitionDetailSchema = CompetitionSchema.extend({ seasons: z.array(SeasonSchema) });

export async function competitionRoutes(app: FastifyInstance, options: CompetitionRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });
  const manage = [app.requireActor, app.idempotent];
  const T = ['competitions'];

  typed.post(
    '/v1/organisations/:orgId/competitions',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Create a league or tournament',
        operationId: 'createCompetition',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateCompetitionBodySchema,
        response: { 201: CompetitionSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await svc.createCompetition(
            db(),
            request.actor!,
            request.params.orgId,
            request.body,
            ctx(request),
          ),
        ),
  );
  typed.get(
    '/v1/organisations/:orgId/competitions',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'List competitions',
        operationId: 'listCompetitions',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(CompetitionSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await svc.listCompetitions(db(), request.actor!, request.params.orgId),
    }),
  );
  typed.get(
    '/v1/competitions/:competitionId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Competition with its seasons',
        operationId: 'getCompetition',
        security: AUTH,
        params: CompetitionIdParamsSchema,
        response: { 200: CompetitionDetailSchema, ...PROBLEMS },
      },
    },
    async (request) => svc.getCompetition(db(), request.actor!, request.params.competitionId),
  );
  typed.post(
    '/v1/competitions/:competitionId/seasons',
    {
      preHandler: manage,
      schema: {
        tags: T,
        summary: 'Create a season with divisions and a rules snapshot',
        operationId: 'createSeason',
        security: AUTH,
        params: CompetitionIdParamsSchema,
        body: CreateSeasonBodySchema,
        response: { 201: SeasonSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await svc.createSeason(
            db(),
            request.actor!,
            request.params.competitionId,
            request.body,
            ctx(request),
          ),
        ),
  );
  typed.get(
    '/v1/seasons/:seasonId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: T,
        summary: 'Get a season',
        operationId: 'getSeason',
        security: AUTH,
        params: SeasonIdParamsSchema,
        response: { 200: SeasonSchema, ...PROBLEMS },
      },
    },
    async (request) => svc.getSeason(db(), request.actor!, request.params.seasonId),
  );

  // Teams
  typed.post(
    '/v1/organisations/:orgId/teams',
    {
      preHandler: manage,
      schema: {
        tags: ['teams'],
        summary: 'Create a team',
        operationId: 'createTeam',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateTeamBodySchema,
        response: { 201: TeamSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await teams.createTeam(
            db(),
            request.actor!,
            request.params.orgId,
            request.body,
            ctx(request),
          ),
        ),
  );
  typed.get(
    '/v1/organisations/:orgId/teams',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['teams'],
        summary: 'List teams',
        operationId: 'listTeams',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(TeamSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await teams.listTeams(db(), request.actor!, request.params.orgId),
    }),
  );
  typed.get(
    '/v1/teams/:teamId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['teams'],
        summary: 'Team with roster',
        operationId: 'getTeam',
        security: AUTH,
        params: TeamIdParamsSchema,
        response: { 200: TeamDetailSchema, ...PROBLEMS },
      },
    },
    async (request) => teams.getTeam(db(), request.actor!, request.params.teamId),
  );
  typed.patch(
    '/v1/teams/:teamId',
    {
      preHandler: manage,
      schema: {
        tags: ['teams'],
        summary: 'Update a team (If-Match: version)',
        operationId: 'updateTeam',
        security: AUTH,
        params: TeamIdParamsSchema,
        body: UpdateTeamBodySchema,
        response: { 200: TeamSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      teams.updateTeam(
        db(),
        request.actor!,
        request.params.teamId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );
  typed.post(
    '/v1/teams/:teamId/roster',
    {
      preHandler: manage,
      schema: {
        tags: ['teams'],
        summary: 'Add a participant to the roster',
        operationId: 'addToRoster',
        security: AUTH,
        params: TeamIdParamsSchema,
        body: RosterChangeBodySchema,
        response: { 200: TeamDetailSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      teams.addToRoster(
        db(),
        request.actor!,
        request.params.teamId,
        request.body.participantId,
        ctx(request),
      ),
  );
  typed.delete(
    '/v1/teams/:teamId/roster/:participantId',
    {
      preHandler: manage,
      schema: {
        tags: ['teams'],
        summary: 'Remove a participant from the roster',
        operationId: 'removeFromRoster',
        security: AUTH,
        params: TeamIdParamsSchema.extend({ participantId: UuidSchema }),
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await teams.removeFromRoster(
        db(),
        request.actor!,
        request.params.teamId,
        request.params.participantId,
        ctx(request),
      );
      return reply.status(204).send(null);
    },
  );

  // Meets
  typed.post(
    '/v1/seasons/:seasonId/meets',
    {
      preHandler: manage,
      schema: {
        tags: ['meets'],
        summary: 'Create a meet',
        operationId: 'createMeet',
        security: AUTH,
        params: SeasonIdParamsSchema,
        body: CreateMeetBodySchema,
        response: { 201: MeetSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await meets.createMeet(
            db(),
            request.actor!,
            request.params.seasonId,
            request.body,
            ctx(request),
          ),
        ),
  );
  typed.get(
    '/v1/seasons/:seasonId/meets',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['meets'],
        summary: 'List meets in a season',
        operationId: 'listMeets',
        security: AUTH,
        params: SeasonIdParamsSchema,
        response: { 200: listOf(MeetSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await meets.listMeets(db(), request.actor!, request.params.seasonId),
    }),
  );
  typed.get(
    '/v1/meets/:meetId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['meets'],
        summary: 'Meet with divisions, teams and courts',
        operationId: 'getMeet',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: MeetSchema, ...PROBLEMS },
      },
    },
    async (request) => meets.getMeet(db(), request.actor!, request.params.meetId),
  );
  typed.put(
    '/v1/meets/:meetId/divisions/:divisionId/teams',
    {
      preHandler: manage,
      schema: {
        tags: ['meets'],
        summary: 'Set the teams in a division for this meet',
        operationId: 'setDivisionTeams',
        security: AUTH,
        params: MeetIdParamsSchema.extend({ divisionId: UuidSchema }),
        body: SetDivisionTeamsBodySchema,
        response: { 200: MeetSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      meets.setDivisionTeams(
        db(),
        request.actor!,
        request.params.meetId,
        request.params.divisionId,
        request.body.teamIds,
        ctx(request),
      ),
  );
  typed.put(
    '/v1/meets/:meetId/divisions/:divisionId/courts',
    {
      preHandler: manage,
      schema: {
        tags: ['meets'],
        summary: 'Dedicate courts to a division for this meet',
        operationId: 'setDivisionCourts',
        security: AUTH,
        params: MeetIdParamsSchema.extend({ divisionId: UuidSchema }),
        body: SetDivisionCourtsBodySchema,
        response: { 200: MeetSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      meets.setDivisionCourts(
        db(),
        request.actor!,
        request.params.meetId,
        request.params.divisionId,
        request.body.courtIds,
        request.body.exclusive,
        ctx(request),
      ),
  );
  typed.post(
    '/v1/meets/:meetId/fixtures/preview',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['meets'],
        summary: 'Preview the round-robin fixture plan',
        operationId: 'previewFixtures',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: FixturePreviewSchema, ...PROBLEMS },
      },
    },
    async (request) => meets.previewFixtures(db(), request.actor!, request.params.meetId),
  );
  typed.post(
    '/v1/meets/:meetId/fixtures/commit',
    {
      preHandler: manage,
      schema: {
        tags: ['meets'],
        summary: 'Publish fixtures and rubbers; snapshots the rules',
        operationId: 'commitFixtures',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: MeetSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      meets.commitFixtures(db(), request.actor!, request.params.meetId, ctx(request)),
  );
  typed.get(
    '/v1/meets/:meetId/fixtures',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['meets'],
        summary: 'Fixtures with rubbers, lineups, courts and results',
        operationId: 'listFixtures',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: listOf(FixtureSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await meets.getFixtures(db(), request.actor!, request.params.meetId),
    }),
  );

  // Lineups, court operations, results
  typed.put(
    '/v1/fixtures/:fixtureId/lineups/:teamId',
    {
      preHandler: manage,
      schema: {
        tags: ['fixtures'],
        summary: 'Submit a team lineup per rubber (captain or director)',
        operationId: 'submitLineup',
        security: AUTH,
        params: FixtureIdParamsSchema.extend({ teamId: UuidSchema }),
        body: LineupBodySchema,
        response: { 200: FixtureSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      results.submitLineup(
        db(),
        request.actor!,
        request.params.fixtureId,
        request.params.teamId,
        request.body,
        ctx(request),
      ),
  );
  typed.post(
    '/v1/matches/:matchId/call',
    {
      preHandler: manage,
      schema: {
        tags: ['fixtures'],
        summary: 'Call a rubber to a court in the division pool (override needs a reason)',
        operationId: 'callMatch',
        security: AUTH,
        params: MatchIdParamsSchema,
        body: CourtCallBodySchema,
        response: { 200: FixtureSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      results.callToCourt(
        db(),
        request.actor!,
        request.params.matchId,
        request.body.courtId,
        request.body.overrideReason,
        ctx(request),
      ),
  );
  typed.post(
    '/v1/matches/:matchId/start',
    {
      preHandler: manage,
      schema: {
        tags: ['fixtures'],
        summary: 'Start a called rubber',
        operationId: 'startMatch',
        security: AUTH,
        params: MatchIdParamsSchema,
        response: { 200: FixtureSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      results.startMatch(db(), request.actor!, request.params.matchId, ctx(request)),
  );
  typed.post(
    '/v1/matches/:matchId/results',
    {
      preHandler: manage,
      schema: {
        tags: ['fixtures'],
        summary: 'Submit a rubber score (validated against the rules)',
        operationId: 'submitResult',
        security: AUTH,
        params: MatchIdParamsSchema,
        body: SubmitResultBodySchema,
        response: { 200: FixtureSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      results.submitResult(
        db(),
        request.actor!,
        request.params.matchId,
        request.body,
        ctx(request),
      ),
  );
  for (const action of ['confirm', 'dispute'] as const) {
    typed.post(
      `/v1/matches/:matchId/results/:revision/${action}`,
      {
        preHandler: manage,
        schema: {
          tags: ['fixtures'],
          summary: `${action === 'confirm' ? 'Confirm' : 'Dispute'} a submitted score (opposing captain or director)`,
          operationId: `${action}Result`,
          security: AUTH,
          params: MatchIdParamsSchema.extend({ revision: z.coerce.number().int().min(1) }),
          body: z.object({ reason: z.string().trim().max(400).optional() }).default({}),
          response: { 200: FixtureSchema, ...PROBLEMS },
        },
      },
      async (request) =>
        results.confirmResult(
          db(),
          request.actor!,
          request.params.matchId,
          request.params.revision,
          action,
          request.body?.reason,
          ctx(request),
        ),
    );
  }

  // Standings and progression
  typed.get(
    '/v1/meets/:meetId/standings',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['standings'],
        summary: 'Standings per division with ruleset version and unresolved ties',
        operationId: 'getStandings',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: StandingsSchema, ...PROBLEMS },
      },
    },
    async (request) => standings.getStandings(db(), request.actor!, request.params.meetId),
  );
  typed.post(
    '/v1/meets/:meetId/progression/preview',
    {
      preHandler: manage,
      schema: {
        tags: ['standings'],
        summary: 'Preview promotion and relegation for the next meet',
        operationId: 'previewProgression',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: ProgressionPreviewSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      standings.previewProgression(db(), request.actor!, request.params.meetId, ctx(request)),
  );
  typed.post(
    '/v1/meets/:meetId/progression/commit',
    {
      preHandler: manage,
      schema: {
        tags: ['standings'],
        summary: 'Approve a progression preview and assign the next meet',
        operationId: 'commitProgression',
        security: AUTH,
        params: MeetIdParamsSchema,
        body: CommitProgressionBodySchema,
        response: { 200: ProgressionPreviewSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      standings.commitProgression(
        db(),
        request.actor!,
        request.params.meetId,
        request.body,
        ctx(request),
      ),
  );

  typed.get(
    '/v1/me/competitions',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['competitions'],
        summary: 'Your teams, meets and fixtures across clubs (player view)',
        operationId: 'getMyCompetitions',
        security: AUTH,
        response: { 200: MyCompetitionsSchema, 401: ProblemDetailsSchema },
      },
    },
    async (request) => myCompetitions(db(), request.actor!),
  );

  // Tournaments (Phase 4)
  typed.put(
    '/v1/meets/:meetId/entries',
    {
      preHandler: manage,
      schema: {
        tags: ['tournaments'],
        summary: 'Set the entrants and draw them into the pools by seed',
        operationId: 'setMeetEntries',
        security: AUTH,
        params: MeetIdParamsSchema,
        body: SetMeetEntriesBodySchema,
        response: { 200: MeetSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      meets.setMeetEntries(db(), request.actor!, request.params.meetId, request.body, ctx(request)),
  );
  typed.post(
    '/v1/meets/:meetId/knockout/advance',
    {
      preHandler: manage,
      schema: {
        tags: ['tournaments'],
        summary: 'Fill knockout ties whose pools or feeder ties are decided',
        operationId: 'advanceKnockout',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: KnockoutAdvanceSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      meets.advanceKnockout(db(), request.actor!, request.params.meetId, ctx(request)),
  );

  // Disputes (Phase 4)
  typed.get(
    '/v1/meets/:meetId/disputes',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['fixtures'],
        summary: 'Open result disputes at a meet',
        operationId: 'listDisputes',
        security: AUTH,
        params: MeetIdParamsSchema,
        response: { 200: listOf(DisputeSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await results.listDisputes(db(), request.actor!, request.params.meetId),
    }),
  );
  typed.post(
    '/v1/matches/:matchId/results/:revision/resolve',
    {
      preHandler: manage,
      schema: {
        tags: ['fixtures'],
        summary: 'Director resolves a dispute: uphold the score or void it',
        operationId: 'resolveDispute',
        security: AUTH,
        params: MatchIdParamsSchema.extend({ revision: z.coerce.number().int().min(1) }),
        body: ResolveDisputeBodySchema,
        response: { 200: FixtureSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      results.resolveDispute(
        db(),
        request.actor!,
        request.params.matchId,
        request.params.revision,
        request.body,
        ctx(request),
      ),
  );
}
