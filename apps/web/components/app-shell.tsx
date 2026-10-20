import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Product } from '../lib/env';
import { getSessionUser } from '../lib/supabase/server';
import { Lockup } from './brand';
import { BottomNav } from './nav';

/**
 * Product shell: slim top bar with the lockup, bottom tab bar when signed in.
 * Pages add their own title; the bar never repeats it.
 */
export async function AppShell({ product, children }: { product: Product; children: ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-5">
          <Link href="/" className="text-ink">
            <Lockup product={product} size={26} />
          </Link>
          {user ? (
            <form action="/sign-out" method="post">
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-full border border-hairline bg-surface px-3 text-xs font-bold text-ink"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex min-h-9 items-center rounded-full bg-ink px-3.5 text-xs font-bold text-on-ink"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      {children}
      {user ? <BottomNav product={product} /> : null}
    </div>
  );
}
