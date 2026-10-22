import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/app-shell';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';

/**
 * Rally pages. A signed-in person who has not finished the first run is sent into it from every
 * page (Addendum 1.4): without a name and a sport there is nothing to set up or join. The mark
 * lives on the profile, so it follows the account, not the device.
 */
export default async function RallyLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-buddyclub-path') ?? '/';
  if (!path.startsWith('/welcome') && (await getSessionUser())) {
    const profile = await apiForUser().profile.get();
    if (!profile.onboarded.rally) redirect('/welcome');
  }
  return <AppShell product="rally">{children}</AppShell>;
}
