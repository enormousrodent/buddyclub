'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { THEME_COOKIE, THEMES, type Theme } from '../lib/theme';

const LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * Appearance control: a segmented choice between following the device, light and dark.
 * Applies immediately on the client, persists in a cookie and refreshes so the server agrees.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initial);

  const choose = (next: Theme) => {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-1 rounded-control bg-surface-2 p-1 text-sm"
    >
      {THEMES.map((t) => {
        const active = theme === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(t)}
            className={`min-h-10 flex-1 rounded-[9px] px-3 py-2 font-semibold ${
              active ? 'bg-surface text-ink shadow-raised' : 'text-muted'
            }`}
          >
            {LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
