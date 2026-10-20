import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { IconTile } from '../../../components/brand';
import { Card, Icon, Muted, Page } from '../../../components/ui';
import type { Product } from '../../../lib/env';
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
      ) : (
        <p className="mt-4 text-center text-xs text-muted">
          One account works in Buddy Club and Rally. Apple and Google sign-in are coming.
        </p>
      )}
    </Page>
  );
}
