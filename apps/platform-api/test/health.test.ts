import { HealthResponseSchema, ReadinessResponseSchema } from '@buddyclub/shared-types';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

describe('health endpoints', () => {
  it('reports liveness without authentication', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body.service).toBe('buddyclub-platform-api');
    expect(res.headers['cache-control']).toBeUndefined();
    await app.close();
  });

  it('marks the database check as skipped when no database is configured', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(ReadinessResponseSchema.parse(res.json())).toEqual({
      status: 'ready',
      checks: { database: 'skipped' },
    });
    await app.close();
  });

  it('returns 503 when the database check fails', async () => {
    const { app } = await createTestApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'error' } });
    await app.close();
  });
});
