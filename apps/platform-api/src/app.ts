import { randomUUID } from 'node:crypto';
import type { TokenVerifier } from '@buddyclub/auth';
import { CORRELATION_ID_HEADER, CORRELATION_ID_PATTERN } from '@buddyclub/shared-types';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config.js';
import type { Db } from './db/index.js';
import { facilityRoutes } from './modules/facilities/routes.js';
import { groupRoutes } from './modules/groups/routes.js';
import { guestRoutes } from './modules/guest/routes.js';
import type { IdentityRepository } from './modules/identity/repository.js';
import { identityRoutes } from './modules/identity/routes.js';
import { profileRoutes } from './modules/profiles/routes.js';
import { buddyRoutes } from './modules/buddies/routes.js';
import { organisationRoutes } from './modules/organisations/routes.js';
import { participantRoutes } from './modules/participants/routes.js';
import { communityRoutes } from './modules/community/routes.js';
import { publicRoutes } from './modules/public/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { sessionRoutes } from './modules/sessions/routes.js';
import { competitionRoutes } from './modules/competitions/routes.js';
import { ActorService, actorPlugin } from './platform/actor.js';
import { GuestTokenService } from './platform/guest-token.js';
import { authPlugin } from './plugins/auth.js';
import { guestPlugin } from './plugins/guest.js';
import {
  idempotencyPlugin,
  MemoryIdempotencyStore,
  PgIdempotencyStore,
  type IdempotencyStore,
} from './plugins/idempotency.js';
import { AppError, codeForStatus, sendProblem } from './problems.js';
import { healthRoutes } from './routes/health.js';

export const SERVICE_NAME = 'buddyclub-platform-api';

export interface AppDeps {
  config: AppConfig;
  tokenVerifier: TokenVerifier;
  identityRepo: IdentityRepository;
  /** Absent in hermetic tests and database-less local runs; database-backed routes then return 503. */
  db?: Db;
  idempotencyStore?: IdempotencyStore;
  checkDatabase?: () => Promise<void>;
  logger?: FastifyServerOptions['logger'];
}

function correlationIdFor(headerValue: string | string[] | undefined): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return candidate && CORRELATION_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

/** Builds a fully wired Fastify instance. No network side effects until `listen`. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;

  const app = Fastify({
    logger: deps.logger ?? false,
    // Correlation id: honour a well-formed client value, otherwise mint one (spec section 4).
    genReqId: (req) => correlationIdFor(req.headers[CORRELATION_ID_HEADER]),
    requestIdHeader: false,
    trustProxy: config.nodeEnv === 'production',
    bodyLimit: 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: false,
    exposedHeaders: [CORRELATION_ID_HEADER, 'idempotent-replayed'],
  });

  if (config.rateLimitEnabled) {
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (request, context) => ({
        type: 'urn:buddyclub:problem:rate-limited',
        title: 'Too many requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: `Retry after ${context.after}`,
        correlationId: request.id,
      }),
    });
  }
  const rateLimited = (max: number): Record<string, unknown> =>
    config.rateLimitEnabled ? { rateLimit: { max, timeWindow: '1 minute' } } : {};

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Buddy Club Platform API',
        version: config.apiVersion,
        description:
          'Sole write surface for Buddy Club and Rally. Errors use application/problem+json.',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'ops', description: 'Health and readiness' },
        { name: 'identity', description: 'Accounts, profiles and memberships' },
        { name: 'organisations', description: 'Clubs and their members' },
        { name: 'invitations', description: 'Invitation links' },
        { name: 'participants', description: 'People who play, including guests' },
        { name: 'guest-access', description: 'Scoped guest links and credentials' },
        { name: 'groups', description: 'Buddy Club groups' },
        { name: 'facilities', description: 'Venues and courts' },
        { name: 'reference', description: 'Reference data' },
        { name: 'sessions', description: 'Social sessions, rosters, rotations and rounds' },
        { name: 'competitions', description: 'Leagues, seasons and divisions' },
        { name: 'teams', description: 'Teams and rosters' },
        { name: 'meets', description: 'Meets, division assignments, court pools, fixtures' },
        { name: 'fixtures', description: 'Lineups, court calls and results' },
        { name: 'standings', description: 'Standings and promotion/relegation' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  if (config.nodeEnv !== 'production') {
    const { default: swaggerUi } = await import('@fastify/swagger-ui');
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  const getDb = (): Db => {
    if (!deps.db) {
      throw new AppError(
        503,
        'INTERNAL',
        'Database not configured',
        'Set DATABASE_URL to use this endpoint',
      );
    }
    return deps.db;
  };
  const guestTokens = new GuestTokenService(config.guestTokenSecret);
  const idempotencyStore =
    deps.idempotencyStore ??
    (deps.db ? new PgIdempotencyStore(deps.db) : new MemoryIdempotencyStore());

  await app.register(authPlugin, {
    tokenVerifier: deps.tokenVerifier,
    exposeReasons: config.nodeEnv !== 'production',
  });
  await app.register(actorPlugin, { actorService: new ActorService(deps.identityRepo) });
  await app.register(guestPlugin, { guestTokens, getDb });
  await app.register(idempotencyPlugin, { store: idempotencyStore });

  app.setNotFoundHandler((request, reply) =>
    sendProblem(
      reply,
      {
        status: 404,
        code: 'NOT_FOUND',
        title: 'Route not found',
        detail: `${request.method} ${request.url}`,
      },
      request.id,
    ),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fieldErrors = error.validation.map((issue) => ({
        path: `${error.validationContext ?? 'request'}${issue.instancePath}`,
        message: issue.message ?? 'Invalid value',
        code: issue.keyword,
      }));
      return sendProblem(
        reply,
        { status: 400, code: 'VALIDATION_FAILED', title: 'Request failed validation', fieldErrors },
        request.id,
      );
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response did not match its schema');
      return sendProblem(
        reply,
        { status: 500, code: 'INTERNAL', title: 'Internal error' },
        request.id,
      );
    }

    if (error instanceof AppError) {
      const problem = { status: error.status, code: error.code, title: error.title } as Parameters<
        typeof sendProblem
      >[1];
      if (error.detail) problem.detail = error.detail;
      if (error.fieldErrors) problem.fieldErrors = error.fieldErrors;
      return sendProblem(reply, problem, request.id);
    }

    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }
    return sendProblem(
      reply,
      {
        status,
        code: codeForStatus(status),
        title: status >= 500 ? 'Internal error' : (error.message ?? 'Request failed'),
      },
      request.id,
    );
  });

  const healthOptions: Parameters<typeof healthRoutes>[1] = {
    serviceName: SERVICE_NAME,
    version: config.apiVersion,
  };
  if (deps.checkDatabase) healthOptions.checkDatabase = deps.checkDatabase;
  await app.register(healthRoutes, healthOptions);
  await app.register(identityRoutes, { identityRepo: deps.identityRepo });
  await app.register(profileRoutes, { getDb });
  await app.register(buddyRoutes, { getDb });
  await app.register(organisationRoutes, { getDb, rateLimited });
  await app.register(participantRoutes, { getDb });
  await app.register(guestRoutes, { getDb, guestTokens, rateLimited });
  await app.register(groupRoutes, { getDb });
  await app.register(facilityRoutes, { getDb });
  await app.register(sessionRoutes, { getDb });
  await app.register(competitionRoutes, { getDb });
  await app.register(publicRoutes, { getDb, rateLimited });
  await app.register(communityRoutes, { getDb, rateLimited });
  await app.register(reportRoutes, { getDb });

  return app;
}
