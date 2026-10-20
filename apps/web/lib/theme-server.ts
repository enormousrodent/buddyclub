import { cookies } from 'next/headers';
import { THEME_COOKIE, isTheme, type Theme } from './theme';

/** Reads the theme choice the Profile screen stored; `system` when absent or unknown. */
export async function readTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : 'system';
}
