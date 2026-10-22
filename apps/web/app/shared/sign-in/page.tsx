import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { IconTile } from '../../../components/brand';
import { GoogleSignIn } from '../../../components/google-sign-in';
import { Card, Icon, Muted, Page } from '../../../components/ui';
import { env, type Product } from '../../../lib/env';
import { getSessionUser } from '../../../lib/supabase/server';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

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
    <Page
      title={rally ? 'Your email is your login.' : 'Welcome back'}
      lead={
        rally
          ? "We send a link. Tap it on this phone and you're in. No password to remember."
          : 'Sign in to your clubs, or create an account.'
      }
      back={fallback}
      action={<IconTile product={product} size={48} />}
    >
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
        <Card tone="well" className="mt-4 flex items-center gap-3">
          <Icon name="qr" size={22} className="shrink-0 text-primary" />
          <Muted className="flex-1">Just playing tonight? You don&apos;t need an account.</Muted>
          <a href="/dashboard" className="whitespace-nowrap text-[13px] font-bold text-primary">
            Join by code
          </a>
        </Card>
      ) : null}
      {rally ? (
        <p className="mt-4 text-center text-xs text-muted">
          An account is free: your sports, your buddies, your nights.
        </p>
      ) : (
        <p className="mt-4 text-center text-xs text-muted">
          One account works in Buddy Club and Rally. Apple sign-in is coming.
        </p>
      )}
    </Page>
  );
}
