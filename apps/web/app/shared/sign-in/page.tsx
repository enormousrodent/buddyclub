import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { IconTile } from '../../../components/brand';
import { Card, Page } from '../../../components/ui';
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
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (await getSessionUser()) redirect(safeNext);
  const product = ((await headers()).get('x-buddyclub-product') ?? 'buddyclub') as Product;
  return (
    <Page
      title="Welcome back"
      lead={
        product === 'rally'
          ? 'Your Buddy Club account works here too.'
          : 'Sign in to your clubs, or create an account.'
      }
      action={<IconTile product={product} size={48} />}
    >
      <Card>
        <SignInForm next={safeNext} />
      </Card>
      <p className="mt-4 text-center text-xs text-muted">
        One account works in Buddy Club and Rally. Apple and Google sign-in are coming.
      </p>
    </Page>
  );
}
