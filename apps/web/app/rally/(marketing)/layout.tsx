import type { ReactNode } from 'react';
import { FrontFrame } from '../../../components/front-frame';
import { getSessionUser } from '../../../lib/supabase/server';

/** The front page, in the shared signed-out frame. The app lives under /dashboard. */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <FrontFrame signedIn={Boolean(user)}>{children}</FrontFrame>;
}
