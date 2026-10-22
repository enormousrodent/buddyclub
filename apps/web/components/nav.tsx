'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Product } from '../lib/env';
import { Icon } from './ui';

type Item = {
  href: string;
  label: string;
  icon: 'home' | 'list' | 'calendar' | 'trophy' | 'user' | 'search' | 'users';
};

/** Tab sets per product. The app (Addendum 1.5): home, sessions, buddies, profile; clubs and competitions from home. */
const ITEMS: Record<Product, Item[]> = {
  buddyclub: [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/explore', label: 'Explore', icon: 'search' },
    { href: '/groups', label: 'Mine', icon: 'calendar' },
    { href: '/profile', label: 'Me', icon: 'user' },
  ],
  rally: [
    { href: '/dashboard', label: 'Home', icon: 'home' },
    { href: '/sessions', label: 'Sessions', icon: 'list' },
    { href: '/buddies', label: 'Buddies', icon: 'users' },
    { href: '/profile', label: 'Profile', icon: 'user' },
  ],
};

function isActive(pathname: string, href: string, all: Item[]): boolean {
  if (href === '/' || href === '/dashboard') {
    // Home owns everything no other tab claims.
    return !all.some((i) => i.href !== href && pathname.startsWith(i.href));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar: 3 or 4 destinations per product, 48px targets, active = primary + bold. */
export function BottomNav({ product }: { product: Product }) {
  const pathname = usePathname();
  const items = ITEMS[product];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface/95 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur"
    >
      <div
        className="mx-auto grid max-w-xl gap-1 px-2"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href, items);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-12 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-control text-[11px] leading-none ${
                active ? 'font-bold text-primary' : 'font-semibold text-muted'
              }`}
            >
              <Icon name={item.icon} size={24} className="shrink-0" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
