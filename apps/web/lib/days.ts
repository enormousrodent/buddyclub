import { WEEKDAY_KEYS, type Availability } from '@buddyclub/shared-types';

const DAY: Record<(typeof WEEKDAY_KEYS)[number], string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
const SLOT: Record<string, string> = { morning: 'am', afternoon: 'pm', evening: 'eve' };

/** "Mon eve · Sat am/pm", or null when no day is marked. */
export function describeDays(days: Availability): string | null {
  const parts = WEEKDAY_KEYS.filter((d) => days[d]?.length).map(
    (d) => `${DAY[d]} ${(days[d] ?? []).map((s) => SLOT[s] ?? s).join('/')}`,
  );
  return parts.length ? parts.join(' · ') : null;
}

/** "3 nights" / "1 night". */
export function nights(n: number): string {
  return `${n} night${n === 1 ? '' : 's'}`;
}
