import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { AppShell } from '../../../components/app-shell';
import { PageSkeleton } from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';

/**
 * Rally pages. A signed-in person who has not finished the first run is sent into it from every
 * page (Addendum 1.4): without a name and a sport there is nothing to set up or join. The mark
 * lives on the profile, so it follows the account, not the device.
 */
export default async function RallyLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-buddyclub-path') ?? '/';
  return (
    <AppShell product="rally">
      <Suspense fallback={<PageSkeleton />}>
        {path.startsWith('/welcome') ? null : <FirstRunGate />}
        {children}
      </Suspense>
    </AppShell>
  );
}

/**
 * Renders beside the page rather than before it, so the profile check and the page's own data
 * load at the same time; the shared boundary means neither shows until both are done.
 */
async function FirstRunGate() {
  if (!(await getSessionUser())) return null;
  const profile = await apiForUser().profile.get();
  if (!profile.onboarded.rally) redirect('/welcome');
  return null;
}
