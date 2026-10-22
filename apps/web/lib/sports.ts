import { activityById } from '@buddyclub/shared-types';

/**
 * The racket sports Buddy Club offers (Addendum 1.4): the only activities a person can put on
 * their profile. The wider catalogue stays in shared-types for the parked product. Catalogue ids,
 * display order.
 */
export const RALLY_SPORTS = [
  'pickleball',
  'badminton',
  'padel',
  'tennis',
  'squash',
  'table_tennis',
] as const;

export const RALLY_SPORT_SET: ReadonlySet<string> = new Set(RALLY_SPORTS);

export function rallySportName(id: string): string {
  return activityById(id)?.name ?? id;
}
