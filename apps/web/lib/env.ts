/** Environment access with clear errors. Read lazily so `next build` works without runtime values. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: () => required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  /** API base URL for server-side calls. */
  apiUrl: () =>
    process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:4000',
  /** API base URL for browser calls (guest pages). */
  publicApiUrl: () => process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:4000',
  rallyHostPrefix: () => process.env['RALLY_HOST_PREFIX'] ?? 'rally.',
  cookieDomain: () => process.env['COOKIE_DOMAIN'] || undefined,
};

export type Product = 'buddyclub' | 'rally';

export function productForHost(host: string | null | undefined): Product {
  const h = (host ?? '').toLowerCase();
  return h.startsWith(env.rallyHostPrefix()) ? 'rally' : 'buddyclub';
}
