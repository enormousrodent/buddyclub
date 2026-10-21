import type { Schedule } from '@buddyclub/shared-types';

/**
 * Weekly schedule maths (Addendum 1.2). A schedule is a weekday and a wall-clock time in a
 * named zone; "next" is the first start whose night has not yet ended. Nothing is stored:
 * the API computes `nextAt` on every read, so a skipped week needs no clean-up.
 */

const DAY_MS = 86_400_000;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** The wall clock in `timezone` at `instant`. */
export function wallClock(instant: Date, timezone: string): WallClock {
  const parts: Record<string, string> = {};
  for (const p of formatter(timezone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']) % 24,
    minute: Number(parts['minute']),
    second: Number(parts['second']),
    weekday: WEEKDAYS.indexOf(parts['weekday'] ?? ''),
  };
}

/** Offset of `timezone` from UTC at `instant`, in milliseconds (east positive). */
function offsetAt(instant: Date, timezone: string): number {
  const w = wallClock(instant, timezone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timezone` reads the given local date and time.
 * Around a DST change a wall time can occur twice or not at all; this takes the first valid
 * instant after it, which is what people mean by "7:30 on the Sunday the clocks go forward".
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let instant = new Date(guess - offsetAt(new Date(guess), timezone));
  // One correction pass for the case where the guess straddles a transition.
  const corrected = new Date(guess - offsetAt(instant, timezone));
  if (corrected.getTime() !== instant.getTime()) {
    const back = wallClock(corrected, timezone);
    const matches = back.hour === local.hour && back.minute === local.minute;
    instant = matches ? corrected : new Date(Math.max(instant.getTime(), corrected.getTime()));
  }
  return instant;
}

export interface NextOptions {
  /** How long a night lasts; tonight's start still counts as "next" until it has ended. */
  durationMinutes: number;
}

/** The next scheduled start on or after `from`, allowing for a night that is under way. */
export function nextScheduledStart(schedule: Schedule, from: Date, options: NextOptions): Date {
  const [h, m] = schedule.time.split(':').map(Number) as [number, number];
  const today = wallClock(from, schedule.timezone);
  // Walk day by day in local wall-clock terms, starting yesterday so a night that began before
  // midnight and is still running is found.
  const base = Date.UTC(today.year, today.month - 1, today.day);
  for (let d = -1; d <= 7; d++) {
    const local = new Date(base + d * DAY_MS);
    if (local.getUTCDay() !== schedule.weekday) continue;
    const start = zonedTimeToUtc(
      {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hour: h,
        minute: m,
      },
      schedule.timezone,
    );
    if (start.getTime() + options.durationMinutes * 60_000 > from.getTime()) return start;
  }
  /* istanbul ignore next: the loop covers a full week plus a day, so one weekday always matches. */
  throw new Error('no scheduled start found in the coming week');
}

/** Postgres `time` is `HH:MM:SS`; the API speaks `HH:MM`. */
export function timeToDb(time: string): string {
  return `${time}:00`;
}

export function timeFromDb(time: string): string {
  return time.slice(0, 5);
}
