import type { Preset } from '@buddyclub/shared-types';
import Link from 'next/link';
import { startPreset } from '../app/rally/actions';
import { Button, Icon, LinkButton } from './ui';

/*
 * A preset card (Rally dashboard strip and the Start page): the night you run every week, with
 * what it is set up for at a glance and one tap to start it. Live when tonight's session is open.
 */

const sportName = (id: string) =>
  id
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

function lastRun(iso: string | null): string {
  if (!iso) return 'Not run yet';
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1) return 'Earlier today';
  if (days < 7)
    return `Last ${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return `Last ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-control bg-surface-2 px-2.5 py-2">
      <span className="tnum font-display text-[24px] font-extrabold leading-none">{value}</span>
      <span className="text-[11px] font-semibold leading-tight text-muted">{label}</span>
    </div>
  );
}

export function PresetCard({
  p,
  featured = false,
  compact = false,
}: {
  p: Preset;
  /** Lime start button; the first card in a list. */
  featured?: boolean;
  /** Fixed width for a horizontal strip. */
  compact?: boolean;
}) {
  const live = Boolean(p.activeOccurrenceId);
  return (
    <article
      className={`relative flex flex-col gap-3 rounded-card border bg-surface p-4 ${
        live ? 'border-2 border-live' : 'border-hairline'
      } ${compact ? 'w-72 shrink-0 sm:w-auto sm:min-w-0 sm:flex-1 sm:basis-56' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-6 items-center rounded-full bg-tint px-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-tint-ink">
          {sportName(p.sportId)}
        </span>
        {live ? (
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-live">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
            </span>
            Live now
          </span>
        ) : (
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            {p.organisationKind === 'personal' ? 'Just me' : p.organisationName}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="font-display text-[26px] font-bold uppercase leading-[0.95] tracking-[0.01em]">
          {p.name}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
          {p.venueName ? (
            <>
              <Icon name="pin" size={13} className="shrink-0" />
              <span className="truncate">{p.venueName}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span className="shrink-0">{lastRun(p.lastStartedAt)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Stat value={p.courts} label={p.courts === 1 ? 'court' : 'courts'} />
        <Stat value={p.defaultRoundMinutes} label="min" />
        <Stat value={p.regulars} label={p.regulars === 1 ? 'regular' : 'regulars'} />
      </div>

      {live ? (
        <LinkButton href={`/sessions/${p.activeOccurrenceId}`} className="w-full">
          Open tonight&apos;s
          <Icon name="chevron" size={16} />
        </LinkButton>
      ) : (
        <form action={startPreset.bind(null, p.seriesId)}>
          <Button type="submit" variant={featured ? 'primary' : 'tonal'} className="w-full">
            <Icon name="play" size={16} />
            Start now
          </Button>
        </form>
      )}

      <Link
        href={`/presets/${p.seriesId}`}
        className="-mx-1 -mb-1 flex min-h-9 items-center justify-between rounded-control px-1 text-[13px] font-semibold text-primary hover:bg-surface-2"
      >
        <span className="inline-flex items-center gap-1.5">
          <Icon name="users" size={15} />
          Regulars and settings
        </span>
        <Icon name="chevron" size={16} className="text-muted" />
      </Link>
    </article>
  );
}
