import { HealthResponseSchema, ReadinessResponseSchema } from '@buddyclub/shared-types';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export interface HealthRoutesOptions {
  serviceName: string;
  version: string;
  /** Resolves when the database answers; absent when the API runs without one (dev/test). */
  checkDatabase?: () => Promise<void>;
}

export async function healthRoutes(app: FastifyInstance, options: HealthRoutesOptions) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const startedAt = Date.now();

  typed.get(
    '/healthz',
    {
      schema: {
        tags: ['ops'],
        summary: 'Liveness',
        operationId: 'getHealth',
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: options.serviceName,
      version: options.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    }),
  );

  typed.get(
    '/readyz',
    {
      schema: {
        tags: ['ops'],
        summary: 'Readiness (database connectivity when configured)',
        operationId: 'getReadiness',
        response: { 200: ReadinessResponseSchema, 503: ReadinessResponseSchema },
      },
    },
    async (request, reply) => {
      if (!options.checkDatabase) {
        return { status: 'ready' as const, checks: { database: 'skipped' as const } };
      }
      try {
        await options.checkDatabase();
        return { status: 'ready' as const, checks: { database: 'ok' as const } };
      } catch (error) {
        request.log.error({ err: error }, 'database readiness check failed');
        return reply
          .status(503)
          .send({ status: 'degraded' as const, checks: { database: 'error' as const } });
      }
    },
  );
}
