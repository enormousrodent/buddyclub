import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './index';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
}

const meBody = {
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
};

describe('api-client', () => {
  it('sends the bearer token and parses /v1/me', async () => {
    let seenAuth: string | null = null;
    const client = createApiClient({
      baseUrl: 'http://api.test/',
      getAccessToken: () => 'tok',
      fetch: fakeFetch((url, init) => {
        expect(url).toBe('http://api.test/v1/me');
        seenAuth = new Headers(init.headers).get('authorization');
        return new Response(JSON.stringify(meBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    });
    const me = await client.me();
    expect(me.profile.displayName).toBe('Sam');
    expect(seenAuth).toBe('Bearer tok');
  });

  it('turns a problem document into an ApiError with the code', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              type: 'urn:buddyclub:problem:unauthenticated',
              title: 'Unauthenticated',
              status: 401,
              code: 'UNAUTHENTICATED',
              correlationId: 'corr-1',
            }),
            { status: 401, headers: { 'content-type': 'application/problem+json' } },
          ),
      ),
    });
    const error = await client.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).code).toBe('UNAUTHENTICATED');
  });

  it('rejects a response that does not match the contract', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fakeFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 })),
    });
    await expect(client.me()).rejects.toThrow();
  });
});
