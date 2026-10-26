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
  '/claim',
  '/sessions',
  '/league',
];

/** Public pages (venue boards, QR landing, legal documents) have no app chrome and work signed out. */
const PUBLIC_PREFIXES = ['/board', '/join', '/terms', '/privacy'];

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
  requestHeaders.set('x-buddyclub-path', pathname);

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
  // Refreshes the session cookie when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rally's front page is marketing; a signed-in person lands on the app instead.
  if (product === 'rally' && pathname === '/' && user) {
    const to = request.nextUrl.clone();
    to.pathname = '/dashboard';
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}

export const config = {
  // Everything except Next internals, the API path and static files (anything with a file
  // extension: icons, the manifest, the interest photos and whatever lands in public/ later).
  matcher: ['/((?!_next/static|_next/image|api/|.*\\.[a-z0-9]{2,12}$).*)'],
};
