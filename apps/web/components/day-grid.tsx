'use client';

import {
  DAY_SLOTS,
  WEEKDAY_KEYS,
  type Availability,
  type DaySlot,
  type WeekdayKey,
} from '@buddyclub/shared-types';
import { useState } from 'react';

/**
 * When someone is free for an activity (Addendum 1.3): a week grid of mornings, afternoons and
 * evenings. Tap a cell, or fill a whole row or column in one go. The result travels with the
 * form as one hidden JSON field.
 */

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
const SLOT_LABEL: Record<DaySlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export function DayGrid({ name, initial }: { name: string; initial: Availability }) {
  const [days, setDays] = useState<Availability>(initial);
  const has = (d: WeekdayKey, s: DaySlot) => (days[d] ?? []).includes(s);
  const set = (next: Availability) => setDays(next);

  const toggle = (d: WeekdayKey, s: DaySlot) => {
    const current = days[d] ?? [];
    set({ ...days, [d]: has(d, s) ? current.filter((x) => x !== s) : [...current, s] });
  };
  const fillSlot = (s: DaySlot) => {
    const all = WEEKDAY_KEYS.every((d) => has(d, s));
    const next: Availability = { ...days };
    for (const d of WEEKDAY_KEYS) {
      const current = next[d] ?? [];
      next[d] = all ? current.filter((x) => x !== s) : [...new Set([...current, s])];
    }
    set(next);
  };
  const fillDay = (d: WeekdayKey) => {
    const all = DAY_SLOTS.every((s) => has(d, s));
    set({ ...days, [d]: all ? [] : [...DAY_SLOTS] });
  };
  const fillAll = () => {
    const all = WEEKDAY_KEYS.every((d) => DAY_SLOTS.every((s) => has(d, s)));
    const next: Availability = {};
    for (const d of WEEKDAY_KEYS) next[d] = all ? [] : [...DAY_SLOTS];
    set(next);
  };

  const cell =
    'flex h-9 items-center justify-center rounded-[8px] text-[12px] font-bold transition';
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(days)} />
      <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1">
        <button
          type="button"
          onClick={fillAll}
          className={`${cell} text-[11px] text-primary`}
          aria-label="Every day, any time"
        >
          All
        </button>
        {WEEKDAY_KEYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => fillDay(d)}
            className={`${cell} text-[11px] uppercase tracking-[0.06em] text-muted hover:text-ink`}
            aria-label={`All of ${DAY_LABEL[d]}`}
          >
            {DAY_LABEL[d]}
          </button>
        ))}
        {DAY_SLOTS.map((s) => (
          <div key={s} className="contents">
            <button
              type="button"
              onClick={() => fillSlot(s)}
              className={`${cell} justify-start pl-1 text-[12px] text-muted hover:text-ink`}
              aria-label={`Every ${SLOT_LABEL[s].toLowerCase()}`}
            >
              {SLOT_LABEL[s]}
            </button>
            {WEEKDAY_KEYS.map((d) => (
              <button
                key={`${d}-${s}`}
                type="button"
                role="checkbox"
                aria-checked={has(d, s)}
                aria-label={`${DAY_LABEL[d]} ${SLOT_LABEL[s].toLowerCase()}`}
                onClick={() => toggle(d, s)}
                className={`${cell} ${
                  has(d, s)
                    ? 'bg-primary text-primary-ink'
                    : 'bg-surface-2 text-transparent hover:bg-hairline'
                }`}
              >
                ✓
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Tap a cell, a day, or a time of day. &ldquo;All&rdquo; fills the week.
      </p>
    </div>
  );
}
