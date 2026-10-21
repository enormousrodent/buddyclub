import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';
import { apiForUser } from '../../lib/api';
import { getSessionUser } from '../../lib/supabase/server';

/**
 * Buddy Club pages. A signed-in person who has not finished the Buddy Club first run is sent
 * into it from every page (Addendum 1.3): without activities the product has nothing to offer
 * them. Independent of Rally's own first run.
 */
export default async function BuddyClubLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get('x-buddyclub-path') ?? '/';
  if (!path.startsWith('/welcome') && (await getSessionUser())) {
    const profile = await apiForUser().profile.get();
    if (!profile.onboarded.buddyclub) redirect('/welcome');
  }
  return <AppShell product="buddyclub">{children}</AppShell>;
}
