import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { env } from '../env';

/** Supabase client for server components, route handlers and server actions. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const domain = env.cookieDomain();
  return createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    ...(domain ? { cookieOptions: { domain } } : {}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
}

/** What the app needs to know about the signed-in person, taken from the verified token. */
export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user, or null. The access token is verified locally against the project's
 * signing keys (`getClaims`), so this costs no round trip to the Auth server once the keys are
 * cached; `getUser()` did one per call. Memoised per request: the proxy, the layout, the shell
 * and the page all share one verification.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
});

/** Current access token for calling the platform API, or null when signed out. */
export const getAccessToken = cache(async (): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});
