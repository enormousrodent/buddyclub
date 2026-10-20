import type { ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';

export default function BuddyClubLayout({ children }: { children: ReactNode }) {
  return <AppShell product="buddyclub">{children}</AppShell>;
}
