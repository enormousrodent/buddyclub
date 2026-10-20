import { ApiError, createApiClient, type ApiClient } from '@buddyclub/api-client';
import { env } from './env';
import { getAccessToken } from './supabase/server';

/** Platform API client bound to the signed-in user's token (server side only). */
export function apiForUser(): ApiClient {
  return createApiClient({ baseUrl: env.apiUrl(), getAccessToken });
}

/** Platform API client for public endpoints (invitation preview, guest redeem). */
export function apiPublic(): ApiClient {
  return createApiClient({ baseUrl: env.apiUrl() });
}

/** Turns an API failure into a short message for forms. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const problem = error.problem;
    if (problem?.fieldErrors?.length) {
      return problem.fieldErrors
        .map((f) => `${f.path.replace(/^body\//, '')}: ${f.message}`)
        .join('; ');
    }
    return problem?.detail ?? problem?.title ?? `Request failed (${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export { ApiError };
