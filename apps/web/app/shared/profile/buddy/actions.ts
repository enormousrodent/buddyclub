'use server';

import {
  AvailabilitySchema,
  isValidLevel,
  levelsFor,
  type Availability,
} from '@buddyclub/shared-types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';
import { RALLY_SPORT_SET } from '../../../../lib/sports';

/**
 * Buddy profile actions (Addendum 1.3), shared by the profile editor (`/profile/buddy`, which
 * passes null as `next` and stays put) and the parked Buddy Club first run (which passes the
 * next step). Activities are catalogue ids.
 */

const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();

function finish(next: string | null, message: string): ActionResult {
  revalidatePath('/profile/buddy');
  revalidatePath('/welcome');
  revalidatePath('/');
  if (next) redirect(next);
  return { ok: true, message };
}

export async function saveAbout(
  next: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const api = apiForUser();
    const displayName = text(formData, 'displayName');
    if (displayName) await api.updateMe({ displayName });
    await api.profile.update({
      locality: text(formData, 'locality') || null,
      bio: text(formData, 'bio') || null,
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  return finish(next, 'Saved');
}

/** The picker: which of the six racket sports. Keeps level, days and notes for ones already
 * there; anything else on the profile (parked catalogue entries, suggestions) is dropped. */
export async function saveActivities(
  next: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).activities;
    const ids = [...new Set(formData.getAll('activity').map(String))].filter((id) =>
      RALLY_SPORT_SET.has(id),
    );
    if (!ids.length) return { error: 'Pick at least one. It is how buddies find you.' };
    const byId = new Map(current.map((a) => [a.activityId, a]));
    await api.profile.setActivities({
      activities: ids.map((activityId) => {
        const existing = byId.get(activityId);
        return {
          activityId,
          level: existing?.level ?? null,
          days: existing?.days ?? {},
          note: existing?.note ?? null,
        };
      }),
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  return finish(next, 'Saved');
}

/** Level, days and a note for every activity on the form. */
export async function saveActivityDetails(
  next: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).activities;
    await api.profile.setActivities({
      activities: current.map((a) => {
        const raw = text(formData, `level:${a.activityId}`);
        let level: string | null = a.level;
        if (formData.has(`level:${a.activityId}`)) {
          level = raw || null;
          if (level && levelsFor(a.activityId).kind === 'handicap') level = String(Number(level));
          if (!isValidLevel(a.activityId, level)) level = a.level;
        }
        let days: Availability = a.days;
        const rawDays = formData.get(`days:${a.id}`);
        if (typeof rawDays === 'string' && rawDays) {
          const parsed = AvailabilitySchema.safeParse(JSON.parse(rawDays));
          if (parsed.success) days = parsed.data;
        }
        return {
          activityId: a.activityId,
          ...(a.activityId === 'other' ? { customName: a.customName } : {}),
          level,
          days,
          note: formData.has(`note:${a.id}`) ? text(formData, `note:${a.id}`) || null : a.note,
        };
      }),
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  return finish(next, 'Saved');
}

export async function addGear(
  next: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const name = text(formData, 'name');
  const activityId = text(formData, 'activity');
  if (!name) return { error: 'What is it called?' };
  if (!activityId) return { error: 'Pick the activity it is for' };
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).gear;
    await api.profile.setGear({
      items: [
        ...current.map((g) => ({ activityId: g.activityId, name: g.name, detail: g.detail })),
        { activityId, name, detail: text(formData, 'detail') || null },
      ],
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  return finish(next, `${name} added`);
}

export async function removeGear(gearId: string): Promise<void> {
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).gear;
    await api.profile.setGear({
      items: current
        .filter((g) => g.id !== gearId)
        .map((g) => ({ activityId: g.activityId, name: g.name, detail: g.detail })),
    });
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath('/welcome');
  revalidatePath('/profile/buddy');
}

/** Find me and Show my gear. Find me needs the 18+ box ticked. */
export async function saveVisibility(
  next: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const discoverable = formData.get('discoverable') === 'on';
  const adult = formData.get('adult') === 'on';
  if (discoverable && !adult) return { error: 'Tick the 18 or over box to switch Find me on' };
  try {
    await apiForUser().profile.update({
      discoverable,
      showGear: formData.get('showGear') === 'on',
      ...(adult ? { adultConfirmed: true as const } : {}),
      ...(next === null ? {} : { onboarded: 'buddyclub' as const }),
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  return finish(next, 'Saved');
}
