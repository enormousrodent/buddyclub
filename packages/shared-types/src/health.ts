import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessCheckStatusSchema = z.enum(['ok', 'skipped', 'error']);

export const ReadinessResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    database: ReadinessCheckStatusSchema,
  }),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
