import type { DiscoverResult, GroupCard, PublicActivityCard } from '@buddyclub/shared-types';
import Link from 'next/link';
import { Badge, Empty, Icon, SectionHeading } from './ui';

/** Discovery blocks shared by the Buddy Club home and the Explore page (ADR-018). */

const TONES = [1, 2, 3, 4, 5, 6].map((n) => `var(--bc-swatch-${n})`);
function toneFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] as string;
}

export function whenShort(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function InterestChips({
  interests,
  current,
  basePath,
  q,
}: {
  interests: DiscoverResult['interests'];
  current?: string | undefined;
  basePath: string;
  q?: string | undefined;
}) {
  const href = (interest?: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (interest) p.set('interest', interest);
    const s = p.toString();
    return `${basePath}${s ? `?${s}` : ''}`;
  };
  const chip = (label: string, active: boolean, to: string) => (
    <Link
      key={to}
      href={to}
      className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${
        active ? 'bg-ink text-on-ink' : 'border border-hairline bg-surface text-ink'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {chip('All', !current, href())}
      {interests.map((i) => chip(i.name, current === i.id, href(i.id)))}
    </div>
  );
}

export function ActivityCard({ a }: { a: PublicActivityCard }) {
  return (
    <Link
      href={`/activities/${a.id}`}
      className="block overflow-hidden rounded-card border border-hairline bg-surface"
    >
      <div
        className="flex h-24 items-start justify-between p-2.5"
        style={{ background: toneFor(a.interest?.id ?? a.groupId) }}
      >
        {a.interest ? <Badge>{a.interest.name}</Badge> : <span />}
        {a.poweredByRally ? <Badge tone="info">Powered by Rally</Badge> : null}
      </div>
      <div className="flex flex-col gap-0.5 p-3.5">
        <div className="text-[13px] font-semibold text-primary">
          {whenShort(a.startsAt)}
          {a.locality ? ` · ${a.locality}` : ''}
        </div>
        <div className="text-[17px] font-bold leading-snug">{a.title}</div>
        <div className="text-[13px] text-muted">
          {a.groupName} · {a.goingCount} going
          {a.capacity ? ` · ${Math.max(0, a.capacity - a.goingCount)} spaces left` : ''}
        </div>
      </div>
    </Link>
  );
}

export function GroupTile({ g }: { g: GroupCard }) {
  return (
    <Link
      href={`/groups/${g.id}`}
      className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-3"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-[11px] font-bold text-ink-2"
        style={{ background: toneFor(g.interests[0]?.id ?? g.id) }}
        aria-hidden
      >
        {g.name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase())
          .join('')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{g.name}</span>
        <span className="block truncate text-[13px] text-muted">
          {g.interests.map((i) => i.name).join(', ') || 'Community'} · {g.memberCount} member
          {g.memberCount === 1 ? '' : 's'}
          {g.locality ? ` · ${g.locality}` : ''}
        </span>
      </span>
      <Icon name="chevron" size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

export function DiscoverBlocks({
  result,
  emptyHint,
}: {
  result: DiscoverResult;
  emptyHint: string;
}) {
  return (
    <>
      <SectionHeading>Happening soon</SectionHeading>
      {result.activities.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {result.activities.slice(0, 8).map((a) => (
            <ActivityCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <Empty>{emptyHint}</Empty>
      )}
      <SectionHeading>Groups</SectionHeading>
      {result.groups.length ? (
        <div className="flex flex-col gap-2">
          {result.groups.map((g) => (
            <GroupTile key={g.id} g={g} />
          ))}
        </div>
      ) : (
        <Empty>No public groups match yet. Start one and be the first.</Empty>
      )}
    </>
  );
}
