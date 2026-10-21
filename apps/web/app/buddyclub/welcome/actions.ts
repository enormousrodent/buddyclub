'use server';

import {
  ACTIVITY_LEVELS,
  activityKey,
  AvailabilitySchema,
  type ActivityLevel,
  type Availability,
} from '@buddyclub/shared-types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../components/action-form';
import { apiForUser, describeError } from '../../../lib/api';

/**
 * Buddy profile actions (Addendum 1.3), shared by the Buddy Club first run (`/welcome`, which
 * passes the next step as `next`) and the profile editor (`/buddy`, which passes null and
 * stays put).
 */

const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();

function finish(next: string | null, message: string): ActionResult {
  revalidatePath('/buddy');
  revalidatePath('/');
  if (next) redirect(next);
  return { ok: true, message };
}

/** Parses `racket_sports:tennis` or `books` into the API's shape. */
function parseKey(key: string): { interestId: string; sportId: string | null } {
  const [interestId, sportId] = key.split(':');
  return { interestId: interestId ?? '', sportId: sportId ?? null };
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

/** The chips: which activities. Keeps level, days and notes for ones already there. */
export async function saveActivities(
  next: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).activities;
    const byKey = new Map(current.map((a) => [activityKey(a), a]));
    const keys = [...new Set(formData.getAll('activity').map(String).filter(Boolean))];
    if (!keys.length) return { error: 'Pick at least one. It is how buddies find you.' };
    await api.profile.setActivities({
      activities: keys.map((key) => {
        const existing = byKey.get(key);
        return {
          ...parseKey(key),
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
    const levels = new Set<string>(ACTIVITY_LEVELS.map((l) => l.id));
    await api.profile.setActivities({
      activities: current.map((a) => {
        const key = activityKey(a);
        const level = text(formData, `level:${key}`);
        let days: Availability = a.days;
        const raw = formData.get(`days:${key}`);
        if (typeof raw === 'string' && raw) {
          const parsed = AvailabilitySchema.safeParse(JSON.parse(raw));
          if (parsed.success) days = parsed.data;
        }
        return {
          interestId: a.interestId,
          sportId: a.sportId,
          level: levels.has(level) ? (level as ActivityLevel) : a.level,
          days,
          note: formData.has(`note:${key}`) ? text(formData, `note:${key}`) || null : a.note,
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
  const key = text(formData, 'activity');
  if (!name) return { error: 'What is it called?' };
  if (!key) return { error: 'Pick the activity it is for' };
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).gear;
    await api.profile.setGear({
      items: [
        ...current.map((g) => ({
          interestId: g.interestId,
          sportId: g.sportId,
          name: g.name,
          detail: g.detail,
        })),
        { ...parseKey(key), name, detail: text(formData, 'detail') || null },
      ],
    });
  } catch (error) {
    return { error: describeError(error) };
  }
  revalidatePath('/welcome');
  return finish(null, `${name} added`);
}

export async function removeGear(gearId: string): Promise<void> {
  try {
    const api = apiForUser();
    const current = (await api.profile.get()).gear;
    await api.profile.setGear({
      items: current
        .filter((g) => g.id !== gearId)
        .map((g) => ({
          interestId: g.interestId,
          sportId: g.sportId,
          name: g.name,
          detail: g.detail,
        })),
    });
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath('/welcome');
  revalidatePath('/buddy');
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
