import { describe, expect, it } from 'vitest';
import { nextScheduledStart, wallClock, zonedTimeToUtc } from '../src/modules/sessions/schedule.js';

/** Weekly schedule maths (Addendum 1.2), including the two London clock changes. */
describe('schedule', () => {
  const london = 'Europe/London';
  const monday1930 = { weekday: 1, time: '19:30', timezone: london };
  const opts = { durationMinutes: 120 };

  it('finds the coming Monday at 19:30 London time (BST)', () => {
    // Wed 2026-10-21 10:00 UTC. Clocks go back on Sun 25 Oct, so Mon 26 Oct is GMT.
    const from = new Date('2026-10-21T10:00:00Z');
    expect(nextScheduledStart(monday1930, from, opts).toISOString()).toBe(
      '2026-10-26T19:30:00.000Z',
    );
  });

  it('keeps tonight while the night is still running, then moves on', () => {
    // Mon 2026-10-19 is BST: 19:30 local = 18:30 UTC.
    const during = new Date('2026-10-19T19:45:00Z');
    expect(nextScheduledStart(monday1930, during, opts).toISOString()).toBe(
      '2026-10-19T18:30:00.000Z',
    );
    const after = new Date('2026-10-19T20:31:00Z');
    expect(nextScheduledStart(monday1930, after, opts).toISOString()).toBe(
      '2026-10-26T19:30:00.000Z',
    );
  });

  it('handles the spring-forward Sunday', () => {
    // Clocks go forward Sun 2026-03-29 at 01:00 UTC. Sunday 12:00 local is BST = 11:00 UTC.
    const sundayNoon = { weekday: 0, time: '12:00', timezone: london };
    const from = new Date('2026-03-28T09:00:00Z');
    expect(nextScheduledStart(sundayNoon, from, opts).toISOString()).toBe(
      '2026-03-29T11:00:00.000Z',
    );
  });

  it('works for a zone east of UTC where the local date is ahead', () => {
    // Fri 2026-10-23 23:30 UTC is already Saturday 10:30 in Sydney (AEDT, UTC+11).
    const saturdayNoon = { weekday: 6, time: '12:00', timezone: 'Australia/Sydney' };
    const from = new Date('2026-10-23T23:30:00Z');
    expect(nextScheduledStart(saturdayNoon, from, opts).toISOString()).toBe(
      '2026-10-24T01:00:00.000Z',
    );
  });

  it('converts wall clock to instants and back', () => {
    const instant = zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 19, minute: 30 }, london);
    expect(instant.toISOString()).toBe('2026-07-01T18:30:00.000Z');
    const w = wallClock(instant, london);
    expect([w.weekday, w.hour, w.minute]).toEqual([3, 19, 30]);
  });

  it('picks the first valid instant for a wall time that does not exist', () => {
    // 01:30 on 2026-03-29 in London is skipped; the next valid instant is 02:30 BST = 01:30 UTC.
    const instant = zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 1, minute: 30 }, london);
    expect(instant.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });
});
