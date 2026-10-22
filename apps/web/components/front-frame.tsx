import type { ReactNode } from 'react';
import { RallyMarketingFooter, RallyMarketingHeader } from './rally-marketing';

/**
 * The signed-out frame: the front page's night theme, header, footer and width, shared by
 * the home page, sign-in, invites and the legal documents so nothing jumps between them.
 * Signed in, the app shell takes over with its phone-width column and tab bar.
 */
export function FrontFrame({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return (
    <div className="theme-night flex min-h-dvh flex-col bg-paper text-ink">
      <RallyMarketingHeader signedIn={signedIn} />
      <div className="flex-1">{children}</div>
      <RallyMarketingFooter />
    </div>
  );
}
