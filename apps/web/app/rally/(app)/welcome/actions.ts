'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';
import { ONBOARDED_COOKIE, ROLE_COOKIE, SPORTS_COOKIE } from './cookies';

const YEAR = 60 * 60 * 24 * 365;

/** Step 1: display name (saved to the profile) and the sports the person plays (kept on the device until the API has a field for it). */
export async function saveNameAndSports(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) return { error: 'Tell us what to call you' };
  try {
    await apiForUser().updateMe({ displayName });
  } catch (error) {
    return { error: describeError(error) };
  }
  const sports = formData.getAll('sport').map(String).filter(Boolean).join(',');
  (await cookies()).set(SPORTS_COOKIE, sports, { path: '/', maxAge: YEAR, sameSite: 'lax' });
  redirect('/welcome?step=2');
}

/** Step 2: organiser or player first. Only decides what the dashboard leads with. */
export async function saveRole(role: 'organiser' | 'player'): Promise<void> {
  (await cookies()).set(ROLE_COOKIE, role, { path: '/', maxAge: YEAR, sameSite: 'lax' });
  redirect(role === 'organiser' ? '/welcome?step=3' : '/dashboard?welcome=done');
}

/** Step 3 or skip: mark onboarding done and land on the dashboard (or the session builder). */
export async function finishOnboarding(to: '/dashboard' | '/start'): Promise<void> {
  (await cookies()).set(ONBOARDED_COOKIE, '1', { path: '/', maxAge: YEAR, sameSite: 'lax' });
  redirect(to);
}
