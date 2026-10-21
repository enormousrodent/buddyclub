import type { Preset } from '@buddyclub/shared-types';
import { startSession } from '../app/rally/actions';
import { describeSchedule, whenIn } from '../lib/sessions';
import { Button, Icon, LinkButton } from './ui';

/*
 * A session card (Rally dashboard strip and the Start page): the night you run every week, with
 * what it is set up for at a glance and the one thing to do next, always in the same lime button.
 * Live when tonight is on; "Set up" when the next date is known; "Start now" otherwise.
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

/** The one action for a session: open tonight's, open the night set up, set up the next, or start now. */
export function SessionAction({ p }: { p: Preset }) {
  const tz = p.schedule?.timezone ?? null;
  if (p.activeOccurrenceId)
    return (
      <LinkButton href={`/sessions/${p.activeOccurrenceId}`} className="w-full">
        Open tonight&apos;s
        <Icon name="chevron" size={16} />
      </LinkButton>
    );
  if (p.upcomingOccurrenceId)
    return (
      <LinkButton href={`/sessions/${p.upcomingOccurrenceId}/players`} className="w-full">
        <Icon name="users" size={16} />
        {p.upcomingStartsAt ? `Open ${whenIn(p.upcomingStartsAt, tz)}` : 'Open the next one'}
      </LinkButton>
    );
  if (p.nextAt)
    return (
      <form action={startSession.bind(null, p.seriesId, p.nextAt)}>
        <Button type="submit" className="w-full">
          <Icon name="play" size={16} />
          Set up {whenIn(p.nextAt, tz)}
        </Button>
      </form>
    );
  return (
    <form action={startSession.bind(null, p.seriesId, undefined)}>
      <Button type="submit" className="w-full">
        <Icon name="play" size={16} />
        Start now
      </Button>
    </form>
  );
}

export function SessionCard({
  p,
  compact = false,
}: {
  p: Preset;
  /** Fixed width for a horizontal strip. */
  compact?: boolean;
}) {
  const live = Boolean(p.activeOccurrenceId);
  const meta = p.schedule
    ? describeSchedule(p.schedule)
    : p.nextAt
      ? `Next ${whenIn(p.nextAt)}`
      : lastRun(p.lastStartedAt);
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
            {p.asHost
              ? 'You host'
              : p.organisationKind === 'personal'
                ? 'Just me'
                : p.organisationName}
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
          <span className="shrink-0">{meta}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Stat value={p.courts} label={p.courts === 1 ? 'court' : 'courts'} />
        <Stat value={p.defaultRoundMinutes} label="min" />
        <Stat value={p.regulars} label={p.regulars === 1 ? 'regular' : 'regulars'} />
      </div>

      {p.schedule ? (
        <div className="text-[13px] font-semibold">
          {p.activeOccurrenceId
            ? 'On now'
            : (p.upcomingStartsAt ?? p.nextAt)
              ? `Next: ${whenIn((p.upcomingStartsAt ?? p.nextAt) as string, p.schedule.timezone)}`
              : 'No date yet'}
        </div>
      ) : (
        <SessionAction p={p} />
      )}

      <LinkButton href={`/sessions/${p.seriesId}`} className="w-full">
        <Icon name="users" size={16} />
        Configure
      </LinkButton>
    </article>
  );
}
