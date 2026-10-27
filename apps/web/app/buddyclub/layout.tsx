import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';
import { PageSkeleton } from '../../components/ui';
import { apiForUser } from '../../lib/api';
import { getSessionUser } from '../../lib/supabase/server';

/**
 * Buddy Club pages. A signed-in person who has not finished the Buddy Club first run is sent
 * into it from every page (Addendum 1.3): without activities the product has nothing to offer
 * them. Independent of Rally's own first run.
 */
export default async function BuddyClubLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-buddyclub-path') ?? '/';
  return (
    <AppShell product="buddyclub">
      <Suspense fallback={<PageSkeleton />}>
        {path.startsWith('/welcome') ? null : <FirstRunGate />}
        {children}
      </Suspense>
    </AppShell>
  );
}

/** Runs beside the page, not before it (see the Rally layout). */
async function FirstRunGate() {
  if (!(await getSessionUser())) return null;
  const profile = await apiForUser().profile.get();
  if (!profile.onboarded.buddyclub) redirect('/welcome');
  return null;
}
