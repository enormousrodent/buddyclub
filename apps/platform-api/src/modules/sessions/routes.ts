import {
  AddEntryBodySchema,
  BoardSchema,
  CheckInBodySchema,
  CommitRotationBodySchema,
  CreateGuestGrantBodySchema,
  CreateOccurrenceBodySchema,
  CreatePairLockBodySchema,
  CreateRulesetBodySchema,
  CreateSessionSeriesBodySchema,
  EntrySchema,
  GuestGrantCreatedSchema,
  listOf,
  ListOccurrencesQuerySchema,
  MyScheduleSchema,
  MySessionSchema,
  OccurrenceIdParamsSchema,
  OccurrenceSchema,
  PresetSchema,
  RegularSchema,
  SetRegularsBodySchema,
  StartPresetBodySchema,
  OrgIdParamsSchema,
  PairLockSchema,
  ProblemDetailsSchema,
  RotationPreviewRequestSchema,
  RotationPreviewSchema,
  RoundIdParamsSchema,
  RoundSchema,
  RulesetSchema,
  SeriesIdParamsSchema,
  SessionSeriesSchema,
  UpdateOccurrenceBodySchema,
  UpdateSessionSeriesBodySchema,
  UuidSchema,
  WithdrawBodySchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import { expectedVersion } from '../../platform/if-match.js';
import { createGuestGrant } from '../participants/service.js';
import { createRuleset, listRulesets } from '../rulesets/service.js';
import * as occurrences from './occurrences.js';
import * as readModels from './read-models.js';
import * as roster from './roster.js';
import * as rotation from './rotation.js';
import { myPresets } from './home.js';
import { transitionRound, type RoundAction } from './rounds.js';
import * as series from './series.js';
import * as regulars from './regulars.js';

export interface SessionRoutesOptions {
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
const WithdrawResultSchema = z.object({
  entry: EntrySchema,
  cancelledRoundIds: z.array(UuidSchema),
  currentMatch: z.object({ matchId: UuidSchema, action: z.enum(['finish', 'cancel']) }).nullable(),
});

export async function sessionRoutes(app: FastifyInstance, options: SessionRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = options.getDb;
  const ctx = (request: { id: string }) => ({ correlationId: request.id });
  const manage = [app.requireActor, app.idempotent];

  // Rulesets --------------------------------------------------------------
  typed.post(
    '/v1/organisations/:orgId/rulesets',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Create a named social-session ruleset',
        operationId: 'createRuleset',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateRulesetBodySchema,
        response: { 201: RulesetSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await createRuleset(
            db(),
            request.actor!,
            request.params.orgId,
            request.body,
            ctx(request),
          ),
        ),
  );

  typed.get(
    '/v1/organisations/:orgId/rulesets',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'List rulesets',
        operationId: 'listRulesets',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(RulesetSchema), ...PROBLEMS },
      },
    },
    async (request) => ({ items: await listRulesets(db(), request.actor!, request.params.orgId) }),
  );

  // Series ---------------------------------------------------------------
  typed.post(
    '/v1/organisations/:orgId/sessions',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Create a session (one-off or recurring definition)',
        operationId: 'createSession',
        security: AUTH,
        params: OrgIdParamsSchema,
        body: CreateSessionSeriesBodySchema,
        response: { 201: SessionSeriesSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await series.createSeries(
            db(),
            request.actor!,
            request.params.orgId,
            request.body,
            ctx(request),
          ),
        ),
  );

  typed.get(
    '/v1/organisations/:orgId/sessions',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'List sessions',
        operationId: 'listSessions',
        security: AUTH,
        params: OrgIdParamsSchema,
        response: { 200: listOf(SessionSeriesSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await series.listSeries(db(), request.actor!, request.params.orgId),
    }),
  );

  typed.get(
    '/v1/sessions/:seriesId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Get a session definition',
        operationId: 'getSession',
        security: AUTH,
        params: SeriesIdParamsSchema,
        response: { 200: SessionSeriesSchema, ...PROBLEMS },
      },
    },
    async (request) => series.getSeries(db(), request.actor!, request.params.seriesId),
  );

  typed.patch(
    '/v1/sessions/:seriesId',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Update a session definition (If-Match: version)',
        operationId: 'updateSession',
        security: AUTH,
        params: SeriesIdParamsSchema,
        body: UpdateSessionSeriesBodySchema,
        response: { 200: SessionSeriesSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      series.updateSeries(
        db(),
        request.actor!,
        request.params.seriesId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );

  // Occurrences ----------------------------------------------------------
  typed.post(
    '/v1/sessions/:seriesId/occurrences',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Schedule an occurrence of a session',
        operationId: 'createOccurrence',
        security: AUTH,
        params: SeriesIdParamsSchema,
        body: CreateOccurrenceBodySchema,
        response: { 201: OccurrenceSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await occurrences.createOccurrence(
            db(),
            request.actor!,
            request.params.seriesId,
            request.body,
            ctx(request),
          ),
        ),
  );

  typed.get(
    '/v1/organisations/:orgId/occurrences',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'List occurrences in an organisation',
        operationId: 'listOccurrences',
        security: AUTH,
        params: OrgIdParamsSchema,
        querystring: ListOccurrencesQuerySchema,
        response: { 200: listOf(OccurrenceSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await occurrences.listOccurrences(
        db(),
        request.actor!,
        request.params.orgId,
        request.query,
      ),
    }),
  );

  typed.get(
    '/v1/occurrences/:occurrenceId',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Get an occurrence',
        operationId: 'getOccurrence',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        response: { 200: OccurrenceSchema, ...PROBLEMS },
      },
    },
    async (request) => occurrences.getOccurrence(db(), request.actor!, request.params.occurrenceId),
  );

  typed.patch(
    '/v1/occurrences/:occurrenceId',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Update times, venue, courts or round length (If-Match: version)',
        operationId: 'updateOccurrence',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        body: UpdateOccurrenceBodySchema,
        response: { 200: OccurrenceSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      occurrences.updateOccurrence(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.body,
        expectedVersion(request),
        ctx(request),
      ),
  );

  for (const action of ['open', 'complete', 'cancel'] as const) {
    typed.post(
      `/v1/occurrences/:occurrenceId/${action}`,
      {
        preHandler: manage,
        schema: {
          tags: ['sessions'],
          summary: `${action[0]!.toUpperCase()}${action.slice(1)} the session`,
          operationId: `${action}Occurrence`,
          security: AUTH,
          params: OccurrenceIdParamsSchema,
          response: { 200: OccurrenceSchema, ...PROBLEMS },
        },
      },
      async (request) =>
        occurrences.transitionOccurrence(
          db(),
          request.actor!,
          request.params.occurrenceId,
          action,
          ctx(request),
        ),
    );
  }

  // Roster ---------------------------------------------------------------
  typed.post(
    '/v1/occurrences/:occurrenceId/participants',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Add a club player, or a walk-in guest by name, to the session',
        operationId: 'addEntry',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        body: AddEntryBodySchema,
        response: { 201: EntrySchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await roster.addEntry(
            db(),
            request.actor!,
            request.params.occurrenceId,
            request.body,
            ctx(request),
          ),
        ),
  );

  typed.get(
    '/v1/occurrences/:occurrenceId/participants',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Session roster',
        operationId: 'listEntries',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        response: { 200: listOf(EntrySchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: (await readModels.board(db(), request.actor!, request.params.occurrenceId)).entries,
    }),
  );

  typed.post(
    '/v1/occurrences/:occurrenceId/check-ins',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Check a player in (yourself, or anyone as organiser)',
        operationId: 'checkIn',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        body: CheckInBodySchema,
        response: { 200: EntrySchema, ...PROBLEMS },
      },
    },
    async (request) =>
      roster.checkIn(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.body.participantId,
        ctx(request),
      ),
  );

  typed.post(
    '/v1/occurrences/:occurrenceId/participants/:participantId/withdraw',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Mark a player as left; past rounds are kept, future placements are reset',
        operationId: 'withdrawEntry',
        security: AUTH,
        params: OccurrenceIdParamsSchema.extend({ participantId: UuidSchema }),
        body: WithdrawBodySchema,
        response: { 200: WithdrawResultSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      roster.withdraw(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.params.participantId,
        request.body,
        ctx(request),
      ),
  );

  typed.post(
    '/v1/occurrences/:occurrenceId/participants/:participantId/no-show',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Mark a registered player as a no-show',
        operationId: 'markNoShow',
        security: AUTH,
        params: OccurrenceIdParamsSchema.extend({ participantId: UuidSchema }),
        response: { 200: EntrySchema, ...PROBLEMS },
      },
    },
    async (request) =>
      roster.markNoShow(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.params.participantId,
        ctx(request),
      ),
  );

  typed.post(
    '/v1/occurrences/:occurrenceId/participants/:participantId/guest-grants',
    {
      preHandler: manage,
      schema: {
        tags: ['guest-access'],
        summary: 'Issue a guest link scoped to this session (shows their court and timer)',
        operationId: 'createSessionGuestGrant',
        security: AUTH,
        params: OccurrenceIdParamsSchema.extend({ participantId: UuidSchema }),
        body: CreateGuestGrantBodySchema,
        response: { 201: GuestGrantCreatedSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const occ = await occurrences.getOccurrence(
        db(),
        request.actor!,
        request.params.occurrenceId,
      );
      const created = await createGuestGrant(
        db(),
        request.actor!,
        occ.organisationId,
        request.params.participantId,
        request.body,
        ctx(request),
        request.params.occurrenceId,
      );
      return reply.status(201).send(created);
    },
  );

  // Pair locks -----------------------------------------------------------
  typed.post(
    '/v1/occurrences/:occurrenceId/pair-locks',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Lock two players as partners',
        operationId: 'createPairLock',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        body: CreatePairLockBodySchema,
        response: { 201: PairLockSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await roster.createPairLock(
            db(),
            request.actor!,
            request.params.occurrenceId,
            request.body,
            ctx(request),
          ),
        ),
  );

  typed.get(
    '/v1/occurrences/:occurrenceId/pair-locks',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Active partner locks',
        operationId: 'listPairLocks',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        response: { 200: listOf(PairLockSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await roster.listPairLocks(db(), request.actor!, request.params.occurrenceId),
    }),
  );

  typed.delete(
    '/v1/occurrences/:occurrenceId/pair-locks/:lockId',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Release a partner lock',
        operationId: 'releasePairLock',
        security: AUTH,
        params: OccurrenceIdParamsSchema.extend({ lockId: UuidSchema }),
        response: { 204: z.null(), ...PROBLEMS },
      },
    },
    async (request, reply) => {
      await roster.releasePairLock(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.params.lockId,
        ctx(request),
      );
      return reply.status(204).send(null);
    },
  );

  // Rotation -------------------------------------------------------------
  typed.post(
    '/v1/occurrences/:occurrenceId/rotations/preview',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Generate a candidate next round (not persisted as a round)',
        operationId: 'previewRotation',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        body: RotationPreviewRequestSchema.default({}),
        response: { 200: RotationPreviewSchema, ...PROBLEMS },
      },
    },
    async (request) =>
      rotation.previewRotation(
        db(),
        request.actor!,
        request.params.occurrenceId,
        request.body ?? {},
        ctx(request),
      ),
  );

  typed.post(
    '/v1/occurrences/:occurrenceId/rotations/commit',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Publish a previewed round (If-Match: occurrence version)',
        operationId: 'commitRotation',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        body: CommitRotationBodySchema,
        response: { 201: RoundSchema, ...PROBLEMS },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await rotation.commitRotation(
            db(),
            request.actor!,
            request.params.occurrenceId,
            request.body.previewId,
            expectedVersion(request),
            ctx(request),
          ),
        ),
  );

  // Rounds ---------------------------------------------------------------
  for (const action of ['start', 'pause', 'resume', 'complete', 'cancel'] as RoundAction[]) {
    typed.post(
      `/v1/rounds/:roundId/${action}`,
      {
        preHandler: manage,
        schema: {
          tags: ['sessions'],
          summary: `${action[0]!.toUpperCase()}${action.slice(1)} a round (server is the timer authority)`,
          operationId: `${action}Round`,
          security: AUTH,
          params: RoundIdParamsSchema,
          response: { 200: RoundSchema, ...PROBLEMS },
        },
      },
      async (request) =>
        transitionRound(db(), request.actor!, request.params.roundId, action, ctx(request)),
    );
  }

  // Read models ----------------------------------------------------------
  typed.get(
    '/v1/occurrences/:occurrenceId/board',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Live court board for members',
        operationId: 'getBoard',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        response: { 200: BoardSchema, ...PROBLEMS },
      },
    },
    async (request) => readModels.board(db(), request.actor!, request.params.occurrenceId),
  );

  typed.get(
    '/v1/occurrences/:occurrenceId/my-schedule',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Your court, partner and opponents now and next',
        operationId: 'getMySchedule',
        security: AUTH,
        params: OccurrenceIdParamsSchema,
        response: { 200: MyScheduleSchema, ...PROBLEMS },
      },
    },
    async (request) => readModels.mySchedule(db(), request.actor!, request.params.occurrenceId),
  );

  typed.get(
    '/v1/guest/schedule',
    {
      preHandler: app.requireGuest,
      schema: {
        tags: ['guest-access'],
        summary: 'Guest view of their own court and timer for the linked session',
        operationId: 'getGuestSchedule',
        security: AUTH,
        response: {
          200: MyScheduleSchema,
          401: ProblemDetailsSchema,
          403: ProblemDetailsSchema,
          404: ProblemDetailsSchema,
        },
      },
    },
    async (request) => readModels.guestSchedule(db(), request.guest!),
  );

  typed.get(
    '/v1/me/sessions',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Your upcoming and recent sessions across clubs',
        operationId: 'listMySessions',
        security: AUTH,
        response: { 200: listOf(MySessionSchema), 401: ProblemDetailsSchema },
      },
    },
    async (request) => ({ items: await readModels.mySessions(db(), request.actor!) }),
  );

  // Rally home (Addendum 1.1): presets and one-tap start
  typed.get(
    '/v1/me/presets',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'Session series you can start with one tap, across clubs and your workspace',
        operationId: 'listMyPresets',
        security: AUTH,
        response: { 200: listOf(PresetSchema), 401: ProblemDetailsSchema },
      },
    },
    async (request) => ({ items: await myPresets(db(), request.actor!) }),
  );
  typed.get(
    '/v1/sessions/:seriesId/regulars',
    {
      preHandler: app.requireActor,
      schema: {
        tags: ['sessions'],
        summary: 'People usually in this session; registered automatically when it starts',
        operationId: 'listRegulars',
        security: AUTH,
        params: SeriesIdParamsSchema,
        response: { 200: listOf(RegularSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await regulars.listRegulars(db(), request.actor!, request.params.seriesId),
    }),
  );
  typed.put(
    '/v1/sessions/:seriesId/regulars',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Replace the regulars of a session',
        operationId: 'setRegulars',
        security: AUTH,
        params: SeriesIdParamsSchema,
        body: SetRegularsBodySchema,
        response: { 200: listOf(RegularSchema), ...PROBLEMS },
      },
    },
    async (request) => ({
      items: await regulars.setRegulars(
        db(),
        request.actor!,
        request.params.seriesId,
        request.body.participantIds,
      ),
    }),
  );
  typed.post(
    '/v1/sessions/:seriesId/start',
    {
      preHandler: manage,
      schema: {
        tags: ['sessions'],
        summary: 'Start a session from a preset now: creates an occurrence and opens check-in',
        operationId: 'startPreset',
        security: AUTH,
        params: SeriesIdParamsSchema,
        body: StartPresetBodySchema,
        response: { 201: OccurrenceSchema, ...PROBLEMS },
      },
    },
    async (request, reply) => {
      const created = await occurrences.createOccurrence(
        db(),
        request.actor!,
        request.params.seriesId,
        { startsAt: request.body.startsAt ?? new Date().toISOString() },
        ctx(request),
      );
      await regulars.registerRegulars(db(), request.params.seriesId, created.id);
      const result = request.body.open
        ? await occurrences.transitionOccurrence(
            db(),
            request.actor!,
            created.id,
            'open',
            ctx(request),
          )
        : created;
      return reply.status(201).send(result);
    },
  );
}
