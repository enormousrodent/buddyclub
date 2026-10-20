'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for client components (sign-in form). Uses the publishable key only. */
export function createSupabaseBrowserClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Supabase public configuration is missing');
  const domain = process.env['NEXT_PUBLIC_COOKIE_DOMAIN'];
  return createBrowserClient(url, key, domain ? { cookieOptions: { domain } } : {});
}
