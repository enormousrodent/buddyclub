import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Product } from '../lib/env';
import { getSessionUser } from '../lib/supabase/server';
import { apiForUser } from '../lib/api';
import { Avatar } from './ui';
import { Lockup } from './brand';
import { FrontFrame } from './front-frame';
import { BottomNav } from './nav';
import { PullToRefresh } from './pull-to-refresh';

/**
 * Product shell: top bar with the lockup, bottom tab bar when signed in.
 * Pages add their own title; the bar never repeats it. Signed-out pages (sign-in, invites) share
 * the front page's width and bar height so nothing jumps between them; signed in, the app is a
 * phone-width column.
 * The bar has a hairline and a soft shadow so it reads as a header on a
 * white ground.
 */
export async function AppShell({ product, children }: { product: Product; children: ReactNode }) {
  const user = await getSessionUser();
  if (!user && product === 'rally')
    return (
      <FrontFrame signedIn={false}>
        <PullToRefresh />
        {children}
      </FrontFrame>
    );
  const wide = !user;
  const marketing = wide && product === 'buddyclub';
  const me = user
    ? await apiForUser()
        .me()
        .catch(() => null)
    : null;
  return (
    <div className="min-h-dvh">
      <PullToRefresh />
      <header className="sticky top-0 z-10 border-b border-hairline bg-paper/92 shadow-raised backdrop-blur">
        <div
          className={`mx-auto flex items-center justify-between gap-4 px-5 ${wide ? 'h-16 max-w-5xl' : 'h-14 max-w-xl'}`}
        >
          <Link href={product === 'rally' && user ? '/dashboard' : '/'} className="text-ink">
            <Lockup product={product} size={wide ? 40 : 36} />
          </Link>
          {user ? (
            <Link href="/profile" aria-label="Profile" className="inline-flex items-center">
              <Avatar
                name={me?.profile.displayName ?? 'Me'}
                src={me?.profile.avatarUrl}
                size={34}
              />
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              {marketing ? (
                <nav
                  aria-label="Main"
                  className="hidden items-center gap-5 pr-3 text-[15px] font-semibold sm:flex"
                >
                  <Link href="/explore" className="text-ink hover:text-primary">
                    What&apos;s on
                  </Link>
                  <Link href="/rally" className="text-ink hover:text-primary">
                    Rally
                  </Link>
                </nav>
              ) : null}
              <Link
                href="/sign-in"
                className="inline-flex min-h-9 items-center rounded-full border-[1.5px] border-ink px-3.5 text-xs font-bold text-ink hover:bg-surface-2"
              >
                Sign in
              </Link>
              {marketing ? (
                <Link
                  href="/groups/new"
                  className="inline-flex min-h-9 items-center rounded-full bg-primary px-3.5 text-xs font-bold text-primary-ink hover:bg-primary-strong"
                >
                  Start a group
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </header>
      {children}
      {user ? <BottomNav product={product} /> : null}
    </div>
  );
}
