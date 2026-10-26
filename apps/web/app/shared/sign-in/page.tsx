import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { IconTile } from '../../../components/brand';
import { GoogleSignIn } from '../../../components/google-sign-in';
import { Wide } from '../../../components/rally-marketing';
import { Card, Icon, Muted } from '../../../components/ui';
import { env, type Product } from '../../../lib/env';
import { getSessionUser } from '../../../lib/supabase/server';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

/**
 * Sign-in, inside the front page's frame and width: the words on the left, the form on the
 * right, one column on a phone.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const product = ((await headers()).get('x-buddyclub-product') ?? 'buddyclub') as Product;
  const rally = product === 'rally';
  const fallback = rally ? '/dashboard' : '/';
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
  if (await getSessionUser()) redirect(safeNext);
  const googleClientId = env.googleClientId();
  return (
    <main>
      <Wide className="grid items-start gap-8 py-12 md:grid-cols-[1fr_minmax(0,440px)] md:gap-14 md:py-20">
        <div className="flex flex-col gap-4">
          <IconTile product={product} size={56} />
          <h1 className="font-display text-[40px] font-extrabold uppercase leading-[0.95] sm:text-[52px]">
            {rally ? 'Your email is your login.' : 'Welcome back'}
          </h1>
          <p className="max-w-md text-[16px] leading-7 text-ink-2">
            {rally
              ? "We email you a six-digit code. Type it in and you're in. No password to remember."
              : 'Sign in to your clubs, or create an account.'}
          </p>
          {rally ? (
            <p className="text-[14px] leading-6 text-muted">
              An account is free: your sports, your buddies, your nights.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            {googleClientId ? (
              <>
                <GoogleSignIn clientId={googleClientId} next={safeNext} />
                <div
                  className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
                  aria-hidden
                >
                  <span className="h-px flex-1 bg-hairline" />
                  or with email
                  <span className="h-px flex-1 bg-hairline" />
                </div>
              </>
            ) : null}
            <SignInForm next={safeNext} rally={rally} />
          </Card>
          {rally ? (
            <Card tone="well" className="flex items-center gap-3">
              <Icon name="qr" size={22} className="shrink-0 text-primary" />
              <Muted className="flex-1">
                Just playing tonight? You don&apos;t need an account.
              </Muted>
              <a href="/dashboard" className="whitespace-nowrap text-[13px] font-bold text-primary">
                Join by code
              </a>
            </Card>
          ) : (
            <p className="text-center text-xs text-muted">
              One account works in Buddy Club and Rally. Apple sign-in is coming.
            </p>
          )}
        </div>
      </Wide>
    </main>
  );
}
