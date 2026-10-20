import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Product } from '../lib/env';
import { getSessionUser } from '../lib/supabase/server';
import { Lockup } from './brand';
import { BottomNav } from './nav';

/**
 * Product shell: top bar with the lockup, bottom tab bar when signed in.
 * Pages add their own title; the bar never repeats it. Signed-out visitors on Buddy Club get the
 * wider marketing pages, so the bar widens with them and offers the two marketing actions.
 * The bar carries a coral brand stripe, a hairline and a soft shadow so it reads as a header on a
 * white ground.
 */
export async function AppShell({ product, children }: { product: Product; children: ReactNode }) {
  const user = await getSessionUser();
  const wide = !user && product === 'buddyclub';
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-hairline bg-paper/92 shadow-raised backdrop-blur">
        <div className="h-[3px] bg-highlight" aria-hidden />
        <div
          className={`mx-auto flex h-14 items-center justify-between gap-4 px-5 ${wide ? 'max-w-5xl' : 'max-w-xl'}`}
        >
          <Link href="/" className="text-ink">
            <Lockup product={product} size={26} />
          </Link>
          {user ? (
            <form action="/sign-out" method="post">
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-full border border-hairline bg-surface px-3 text-xs font-bold text-ink hover:bg-surface-2"
              >
                Sign out
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              {wide ? (
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
              {wide ? (
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
