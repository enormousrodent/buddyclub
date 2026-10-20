/**
 * Theme preference (ADR-015 amendment, 2026-10-20). `system` follows the device; `light` and
 * `dark` force one. Stored in a cookie so the server renders the chosen theme with no flash.
 * This module is safe for client components; the cookie reader lives in `theme-server.ts`.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'bc-theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
