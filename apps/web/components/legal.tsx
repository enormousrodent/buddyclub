import type { ReactNode } from 'react';
import { LEGAL, formatEffectiveDate } from '../lib/legal';
import { getSessionUser } from '../lib/supabase/server';
import { FrontFrame } from './front-frame';
import { Wide } from './rally-marketing';

/**
 * The legal documents (/terms, /privacy) in the shared signed-out frame, at the front page's
 * width. Headings span the column; paragraphs wrap at a readable measure.
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
  const signedIn = Boolean(await getSessionUser());
  return (
    <FrontFrame signedIn={signedIn}>
      <main>
        <Wide className="py-12 md:py-16">
          <header className="mb-8">
            <h1 className="font-display text-[40px] font-extrabold uppercase leading-[0.95] sm:text-[52px]">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-[16px] leading-7 text-ink-2">{lead}</p>
            <p className="mt-2 text-sm text-muted">
              Effective {formatEffectiveDate()} · Applies to {LEGAL.hosts.join(' and ')}
            </p>
          </header>
          <article className="text-[15px] leading-7 text-ink-2 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-9 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:leading-7 [&_h2]:text-ink [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:text-ink [&_li]:my-1 [&_li]:max-w-3xl [&_p]:my-3 [&_p]:max-w-3xl [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6">
            {children}
          </article>
          <p className="mt-12 text-sm text-muted">
            {LEGAL.operator} ·{' '}
            <a href={`mailto:${LEGAL.contactEmail}`} className="text-ink">
              {LEGAL.contactEmail}
            </a>
          </p>
        </Wide>
      </main>
    </FrontFrame>
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
