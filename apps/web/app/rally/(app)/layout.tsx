import type { ReactNode } from 'react';
import { AppShell } from '../../../components/app-shell';

export default function RallyLayout({ children }: { children: ReactNode }) {
  return <AppShell product="rally">{children}</AppShell>;
}
