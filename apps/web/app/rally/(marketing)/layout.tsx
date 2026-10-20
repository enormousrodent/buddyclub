import type { ReactNode } from 'react';
import { RallyMarketingFooter, RallyMarketingHeader } from '../../../components/rally-marketing';
import { getSessionUser } from '../../../lib/supabase/server';

/**
 * Rally's front door: its own night-court brand (dark ground, lime, court blue, condensed
 * display face), its own header and footer, no app shell. The app lives under /dashboard.
 */
export default async function RallyMarketingLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="theme-night min-h-dvh bg-paper text-ink">
      <RallyMarketingHeader signedIn={Boolean(user)} />
      {children}
      <RallyMarketingFooter />
    </div>
  );
}
