'use server';

import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';
import { RALLY_SPORTS } from '../../../../lib/sports';

/**
 * Rally first run (Addendum 1.4, step 2). The answers live on the profile, not on the device:
 * sports go to the person's activities and finishing sets the Rally onboarded mark that the app
 * layout checks on every page.
 */

/** Step 1: display name and at least one racket sport. Other activities already on the profile stay. */
export async function saveNameAndSports(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) return { error: 'Tell us what to call you' };
  const picked = new Set<string>(RALLY_SPORTS);
  const sports = [...new Set(formData.getAll('sport').map(String))].filter((id) => picked.has(id));
  if (!sports.length) return { error: 'Pick at least one sport. It is how we set up your nights.' };
  try {
    const api = apiForUser();
    await api.updateMe({ displayName });
    const current = (await api.profile.get()).activities;
    const byId = new Map(current.map((a) => [a.activityId, a]));
    const kept = current.filter((a) => !picked.has(a.activityId));
    await api.profile.setActivities({
      activities: [
        ...sports.map((activityId) => {
          const existing = byId.get(activityId);
          return {
            activityId,
            level: existing?.level ?? null,
            days: existing?.days ?? {},
            note: existing?.note ?? null,
          };
        }),
        ...kept.map((a) => ({
          activityId: a.activityId,
          ...(a.activityId === 'other' ? { customName: a.customName } : {}),
          level: a.level,
          days: a.days,
          note: a.note,
        })),
      ],
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect('/welcome?step=2');
}

/** Step 2: organiser or player first. Either way the first run is done; organisers get one more screen. */
export async function chooseRole(role: 'organiser' | 'player'): Promise<void> {
  try {
    await apiForUser().profile.update({ onboarded: 'rally' });
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  redirect(role === 'organiser' ? '/welcome?step=3' : '/dashboard');
}
