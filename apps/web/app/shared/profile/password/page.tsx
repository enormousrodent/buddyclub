import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card, LinkButton, Muted, Page } from '../../../../components/ui';
import { getSessionUser } from '../../../../lib/supabase/server';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Password' };

/**
 * Set or change the account password. Offered once after a code sign-in (`first=1`), with a way
 * to skip, so people are not sent a code every time; reachable from the profile afterwards.
 */
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; first?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/profile/password');
  const { next, first } = await searchParams;
  const rally = (await headers()).get('x-buddyclub-product') === 'rally';
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/profile';
  return (
    <Page
      title={first ? 'Set a password?' : 'Password'}
      {...(first ? {} : { back: '/profile' })}
      lead={
        first
          ? 'Then next time you can sign in without waiting for a code. You can always use a code instead.'
          : 'Sign in with this next time, or keep using a code.'
      }
    >
      <Card>
        <PasswordForm next={safeNext} rally={rally} />
      </Card>
      {first ? (
        <>
          <LinkButton href={safeNext} variant="ghost" size="lg" className="mt-3 w-full">
            Not now
          </LinkButton>
          <Muted className="mt-2 block text-center text-xs">
            You can set one later from your profile.
          </Muted>
        </>
      ) : null}
    </Page>
  );
}
