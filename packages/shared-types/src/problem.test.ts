import { describe, expect, it } from 'vitest';
import { MeResponseSchema, ProblemDetailsSchema, problemTypeFor } from './index';

describe('shared-types contracts', () => {
  it('derives a URN problem type from the error code', () => {
    expect(problemTypeFor('VERSION_CONFLICT')).toBe('urn:buddyclub:problem:version-conflict');
  });

  it('rejects a problem document with an unknown code', () => {
    const result = ProblemDetailsSchema.safeParse({
      type: 'urn:buddyclub:problem:x',
      title: 'x',
      status: 400,
      code: 'MADE_UP',
      correlationId: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal /me response', () => {
    const parsed = MeResponseSchema.parse({
      profile: {
        id: '0b7a8a4e-0d0e-4a4e-8a2b-1a2b3c4d5e6f',
        authUserId: '1b7a8a4e-0d0e-4a4e-8a2b-1a2b3c4d5e6f',
        displayName: 'Sam',
        avatarUrl: null,
        locale: 'en-GB',
      },
      memberships: [],
      participants: [],
      apps: ['buddyclub', 'rally'],
    });
    expect(parsed.apps).toHaveLength(2);
  });
});
