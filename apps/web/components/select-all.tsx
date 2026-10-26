'use client';

import { useRef } from 'react';

/** "All" and "None" for every checkbox of one name inside the enclosing form. */
export function SelectAll({ name, label = 'players' }: { name: string; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const set = (checked: boolean) => {
    const form = ref.current?.closest('form');
    if (!form) return;
    for (const box of form.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="${name}"]`,
    ))
      box.checked = checked;
  };
  return (
    <span ref={ref} className="flex items-center gap-3 text-[13px] font-semibold">
      <button type="button" className="text-primary" onClick={() => set(true)}>
        Tick all {label}
      </button>
      <button type="button" className="text-muted" onClick={() => set(false)}>
        Clear
      </button>
    </span>
  );
}
