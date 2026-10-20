import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
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

/** The signed-in Supabase user, or null. Verified against the Auth server, not just the cookie. */
export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Current access token for calling the platform API, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
