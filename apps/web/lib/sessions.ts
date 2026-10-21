import type { MySession } from '@buddyclub/shared-types';

/**
 * Night timing helpers (Addendum 1.2). A night set up days ahead is `open` from the moment a
 * host sets it up, so "happening now" has to look at the start time, not only the state.
 */

const SOON_MS = 3 * 3600 * 1000;

/** Live, or open and within three hours of its start. */
export function isHappeningNow(
  s: Pick<MySession, 'state' | 'startsAt'>,
  now = Date.now(),
): boolean {
  if (s.state === 'live') return true;
  return s.state === 'open' && new Date(s.startsAt).getTime() <= now + SOON_MS;
}

/** Set up for later: draft, or open but not for a while yet. */
export function isUpcoming(s: Pick<MySession, 'state' | 'startsAt'>, now = Date.now()): boolean {
  if (s.state === 'draft') return true;
  return s.state === 'open' && !isHappeningNow(s, now);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? '';
}

/** "Mondays at 19:30". */
export function describeSchedule(schedule: { weekday: number; time: string }): string {
  return `${weekdayName(schedule.weekday)}s at ${schedule.time}`;
}

/** "Mon 27 Oct, 19:30" in the session's own zone when it has one. */
export function whenIn(iso: string, timezone?: string | null): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  });
}
