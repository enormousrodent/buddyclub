'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/*
 * Small Rally-flavoured pieces used by the session screens (canvas "Rally app screens").
 * Condensed uppercase labels, lime big buttons, a segmented sub-navigation and stat tiles.
 */

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`font-display text-[12px] font-bold uppercase tracking-[0.14em] text-muted ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-3">
      <div className="tnum font-display text-[36px] font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

/** Segmented sub-navigation for one session: Live · Players · Pairings · Share. */
export function SessionTabs({
  base,
  items,
}: {
  base: string;
  items: { href: string; label: string; badge?: ReactNode }[];
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Session"
      className="scroll-hide mb-4 flex gap-1 rounded-control bg-surface-2 p-1 text-sm"
    >
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 font-semibold ${
              active ? 'bg-surface text-ink shadow-raised' : 'text-muted'
            }`}
          >
            {item.label}
            {item.badge}
          </Link>
        );
      })}
    </nav>
  );
}
