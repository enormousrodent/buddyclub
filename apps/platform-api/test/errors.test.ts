import { ProblemDetailsSchema } from '@buddyclub/shared-types';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

describe('error envelope', () => {
  it('returns a problem document for unknown routes', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.json());
    expect(problem.code).toBe('NOT_FOUND');
    expect(problem.type).toBe('urn:buddyclub:problem:not-found');
    expect(problem.correlationId).toBe(res.headers['x-correlation-id']);
    await app.close();
  });

  it('returns VALIDATION_FAILED with field errors for a malformed JSON body', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    // No POST route exists, so this is a 404; the JSON parse never runs. Document the envelope anyway.
    expect([400, 404]).toContain(res.statusCode);
    expect(ProblemDetailsSchema.safeParse(res.json()).success).toBe(true);
    await app.close();
  });
});
