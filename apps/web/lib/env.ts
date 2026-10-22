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
  /**
   * Which product this deployment serves (Addendum 1.4). `rally` (the default) serves Rally on
   * every host and leaves the wider Buddy Club unreachable; `buddyclub` the reverse; `host` is
   * the earlier two-product routing by hostname prefix (ADR-013).
   */
  product: (): ProductMode => {
    const v = process.env['WEB_PRODUCT'];
    return v === 'buddyclub' || v === 'host' ? v : 'rally';
  },
  rallyHostPrefix: () => process.env['RALLY_HOST_PREFIX'] ?? 'rally.',
  /** Google OAuth client ID (public). Unset hides the Google button. */
  googleClientId: () => process.env['NEXT_PUBLIC_GOOGLE_CLIENT_ID'] || undefined,
  cookieDomain: () => process.env['COOKIE_DOMAIN'] || undefined,
};

export type Product = 'buddyclub' | 'rally';
export type ProductMode = Product | 'host';

export function productForHost(host: string | null | undefined): Product {
  const mode = env.product();
  if (mode !== 'host') return mode;
  const h = (host ?? '').toLowerCase();
  return h.startsWith(env.rallyHostPrefix()) ? 'rally' : 'buddyclub';
}

/**
 * The Rally app's origin for the current request. With one product it is the current origin;
 * with hostname routing it is the prefix in front of the Buddy Club host (`rally.localhost:3000`,
 * `rally-buddyclub.vercel.app`, `rally.buddy-club.com`).
 */
export function rallyOrigin(host: string | null | undefined, proto?: string | null): string {
  const h = (host ?? 'localhost:3000').toLowerCase();
  const scheme = proto ?? (h.includes('localhost') ? 'http' : 'https');
  if (env.product() !== 'host') return `${scheme}://${h}`;
  const bare = h.startsWith(env.rallyHostPrefix()) ? h.slice(env.rallyHostPrefix().length) : h;
  return `${scheme}://${env.rallyHostPrefix()}${bare}`;
}
