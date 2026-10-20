import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env, productForHost } from './lib/env';

/**
 * Hostname routing (ADR-013) plus Supabase session refresh.
 * - Paths shared by both products (auth, profile, invite, guest) are served from app/shared.
 * - Everything else is served from app/buddyclub or app/rally depending on the host.
 * The URL the visitor sees never changes; only the internal route does.
 */
const SHARED_PREFIXES = [
  '/sign-in',
  '/auth',
  '/sign-out',
  '/profile',
  '/invite',
  '/guest',
  '/sessions',
  '/league',
];

/** Public pages (venue boards, QR landing) have no app chrome and work signed out. */
const PUBLIC_PREFIXES = ['/board', '/join'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const product = productForHost(request.headers.get('host'));
  const matches = (prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const internalPrefix = matches(PUBLIC_PREFIXES)
    ? '/public'
    : matches(SHARED_PREFIXES)
      ? '/shared'
      : `/${product}`;

  const target = request.nextUrl.clone();
  target.pathname = `${internalPrefix}${pathname === '/' ? '' : pathname}` || '/';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-buddyclub-product', product);

  let response = NextResponse.rewrite(target, { request: { headers: requestHeaders } });

  const domain = env.cookieDomain();
  const supabase = createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    ...(domain ? { cookieOptions: { domain } } : {}),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });
  // Refreshes the session cookie when needed; result is unused here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|icons/|api/).*)',
  ],
};
