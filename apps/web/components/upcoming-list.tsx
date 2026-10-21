import type { MySession, ScheduledSession } from '@buddyclub/shared-types';
import { Fragment } from 'react';
import { startSession } from '../app/rally/actions';
import { openNight } from '../app/shared/sessions/actions';
import { isHappeningNow } from '../lib/sessions';
import { Badge, List, Row, StateBadge } from './ui';

/**
 * Tonight and upcoming (Addendum 1.2): nights that exist, plus every scheduled session's next
 * date even when nobody has set it up yet. Organisers and hosts set it up from here; everyone
 * else is told it is not set up yet. Sorted by date, grouped by month, with the date as a tile
 * so the day is the first thing you read.
 */

function part(
  iso: string,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  return new Date(iso).toLocaleString('en-GB', {
    ...options,
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

/** Weekday over a big day number: "MON / 26". */
function DateTile({ iso, timezone }: { iso: string; timezone?: string | null }) {
  return (
    <span className="flex h-13 w-13 shrink-0 flex-col items-center justify-center rounded-control bg-surface-2">
      <span className="text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-muted">
        {part(iso, timezone, { weekday: 'short' })}
      </span>
      <span className="tnum font-display text-[26px] font-extrabold leading-none">
        {part(iso, timezone, { day: 'numeric' })}
      </span>
    </span>
  );
}

function SetUpButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="inline-flex h-7 items-center rounded-full bg-primary px-3 text-xs font-bold text-primary-ink"
      >
        Set up
      </button>
    </form>
  );
}

export function UpcomingList({
  nights,
  scheduled,
}: {
  nights: MySession[];
  scheduled: ScheduledSession[];
}) {
  type Item =
    | { kind: 'night'; at: string; tz: string | null; night: MySession }
    | { kind: 'scheduled'; at: string; tz: string | null; session: ScheduledSession };
  const items: Item[] = [
    ...nights.map((night): Item => ({ kind: 'night', at: night.startsAt, tz: null, night })),
    ...scheduled
      // A session whose next night exists already shows as that night.
      .filter((s) => s.nextAt && !s.nextOccurrenceId)
      .map((session): Item => ({
        kind: 'scheduled',
        at: session.nextAt as string,
        tz: session.schedule?.timezone ?? null,
        session,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (!items.length) return null;

  // Group by month, in each item's own zone.
  const months: { label: string; items: Item[] }[] = [];
  for (const item of items) {
    const label = part(item.at, item.tz, { month: 'long', year: 'numeric' });
    const last = months.at(-1);
    if (last && last.label === label) last.items.push(item);
    else months.push({ label, items: [item] });
  }

  const time = (item: Item) => part(item.at, item.tz, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      {months.map((month) => (
        <Fragment key={month.label}>
          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
            {month.label}
          </div>
          <List>
            {month.items.map((item) =>
              item.kind === 'night' ? (
                <Row
                  key={item.night.occurrenceId}
                  href={
                    item.night.canManage && item.night.state === 'draft'
                      ? undefined
                      : item.night.canManage
                        ? `/sessions/${item.night.occurrenceId}`
                        : `/sessions/${item.night.occurrenceId}/me`
                  }
                  leading={<DateTile iso={item.at} />}
                  title={item.night.seriesName}
                  subtitle={`${time(item)} · ${item.night.organisationName}${item.night.venueName ? ` · ${item.night.venueName}` : ''}`}
                  right={
                    item.night.canManage && item.night.state === 'draft' ? (
                      // A planned night: the owner or host finishes setting it up from here.
                      <SetUpButton action={openNight.bind(null, item.night.occurrenceId)} />
                    ) : (
                      <StateBadge state={isHappeningNow(item.night) ? 'live' : item.night.state} />
                    )
                  }
                />
              ) : (
                <Row
                  key={item.session.seriesId}
                  href={item.session.canRun ? undefined : `/sessions/${item.session.seriesId}`}
                  leading={<DateTile iso={item.at} timezone={item.tz} />}
                  title={item.session.name}
                  subtitle={`${time(item)} · ${item.session.organisationName}${item.session.venueName ? ` · ${item.session.venueName}` : ''}`}
                  right={
                    item.session.canRun ? (
                      <SetUpButton
                        action={startSession.bind(null, item.session.seriesId, item.at)}
                      />
                    ) : (
                      <Badge>Not set up yet</Badge>
                    )
                  }
                />
              ),
            )}
          </List>
        </Fragment>
      ))}
    </div>
  );
}
