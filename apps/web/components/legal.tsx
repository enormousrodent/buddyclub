import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Product } from '../lib/env';
import { LEGAL, formatEffectiveDate } from '../lib/legal';
import { Lockup } from './brand';

/**
 * Shell for the legal documents (/terms, /privacy). Served from app/public on both hosts, so it
 * carries its own light header and footer instead of the app shell: a lockup for whichever
 * product the host is, a reading column, and links between the two documents.
 */
export async function LegalPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const product = ((await headers()).get('x-buddyclub-product') ?? 'buddyclub') as Product;
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="text-ink">
            <Lockup product={product} size={32} />
          </Link>
          <nav aria-label="Legal" className="flex gap-4 text-sm font-semibold">
            <Link href="/terms" className="text-ink hover:text-primary">
              Terms
            </Link>
            <Link href="/privacy" className="text-ink hover:text-primary">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-8">
        <header className="mb-8">
          <h1 className="font-display text-[32px] font-bold leading-9">{title}</h1>
          <p className="mt-2 text-[15px] leading-6 text-ink-2">{lead}</p>
          <p className="mt-2 text-sm text-muted">
            Effective {formatEffectiveDate()} · Applies to {LEGAL.hosts.join(' and ')}
          </p>
        </header>
        <article className="text-[15px] leading-7 text-ink-2 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-9 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:leading-7 [&_h2]:text-ink [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:text-ink [&_li]:my-1 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>
      </main>
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-muted">
          <span>
            {LEGAL.operator} ·{' '}
            <a href={`mailto:${LEGAL.contactEmail}`} className="text-ink">
              {LEGAL.contactEmail}
            </a>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A short table of contents for long documents. */
export function Contents({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="Contents"
      className="mb-6 rounded-card border border-hairline bg-surface-2 px-5 py-4 text-sm"
    >
      <div className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
        Contents
      </div>
      <ol className="columns-1 gap-6 sm:columns-2">
        {items.map((item, i) => (
          <li key={item.id} className="my-1">
            <a href={`#${item.id}`} className="font-medium text-ink hover:text-primary">
              {i + 1}. {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
