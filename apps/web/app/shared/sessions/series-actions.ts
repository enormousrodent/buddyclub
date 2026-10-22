'use server';

import type { Schedule } from '@buddyclub/shared-types';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '../../../components/action-form';
import { apiForUser, describeError } from '../../../lib/api';
import { FAIRNESS_FACTORS, isFairnessLevel, weightForLevel } from '../../../lib/fairness';

/** Server actions for a session (series) page: settings, schedule, regulars and hosts. */

function refresh(seriesId: string): void {
  revalidatePath(`/sessions/${seriesId}`);
  revalidatePath('/sessions');
  revalidatePath('/dashboard');
  revalidatePath('/start');
}

/** Name, round length and session length. */
export async function updateSession(
  seriesId: string,
  version: number,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const api = apiForUser();
    const mode = String(formData.get('mode') ?? '');
    let rules: Record<string, unknown> | undefined;
    if (mode === 'mix' || mode === 'king_of_the_court') {
      const current = (await api.sessions.get(seriesId)).defaultRules ?? {};
      const rotation = { ...((current as { rotation?: Record<string, unknown> }).rotation ?? {}) };
      rotation['mode'] = mode;
      const format = String(formData.get('format') ?? '');
      if (format === 'singles' || format === 'doubles') rotation['format'] = format;
      // Advanced fairness controls, when the form carried them.
      const weights: Record<string, number> = {
        ...((rotation['weights'] as Record<string, number> | undefined) ?? {}),
      };
      for (const [key] of FAIRNESS_FACTORS) {
        const raw = formData.get(`weight_${key}`);
        if (raw === null || raw === '') continue;
        if (!isFairnessLevel(raw)) return { error: 'Pick Off, Low, Medium or High' };
        weights[key] = weightForLevel(raw);
      }
      if (Object.keys(weights).length) rotation['weights'] = weights;
      const maxRests = formData.get('maxConsecutiveRests');
      if (maxRests !== null) {
        if (String(maxRests).trim() === '') delete rotation['maxConsecutiveRests'];
        else {
          const n = Number(maxRests);
          if (!Number.isInteger(n) || n < 1 || n > 10)
            return { error: 'Pick how many times in a row someone may sit out' };
          rotation['maxConsecutiveRests'] = n;
        }
      }
      rules = { ...current, rotation };
    }
    await api.sessions.update(
      seriesId,
      {
        name: String(formData.get('name') ?? '').trim(),
        description: String(formData.get('description') ?? '').trim() || null,
        ...(formData.get('visibility') === 'public' || formData.get('visibility') === 'private'
          ? { visibility: formData.get('visibility') as 'public' | 'private' }
          : {}),
        ...(formData.get('joinPolicy') === 'open' || formData.get('joinPolicy') === 'invite'
          ? { joinPolicy: formData.get('joinPolicy') as 'open' | 'invite' }
          : {}),
        locality: String(formData.get('locality') ?? '').trim() || null,
        defaultRoundMinutes: Number(formData.get('roundMinutes') || 12),
        defaultDurationMinutes: Number(formData.get('durationMinutes') || 120),
        ...(rules ? { rules } : {}),
      },
      { ifMatch: version },
    );
    refresh(seriesId);
    return { ok: true, message: 'Saved' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/** Weekly schedule (or none), the check-in window and the host switch. */
export async function saveSchedule(
  seriesId: string,
  version: number,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const weekday = String(formData.get('weekday') ?? '');
    const time = String(formData.get('time') ?? '').trim();
    const timezone = String(formData.get('timezone') ?? '').trim();
    let schedule: Schedule | null = null;
    if (weekday !== '') {
      if (!time) return { error: 'Pick a start time' };
      schedule = { weekday: Number(weekday), time: time.slice(0, 5), timezone };
    }
    await apiForUser().sessions.update(
      seriesId,
      {
        schedule,
        checkInWindowMinutes: Number(formData.get('checkInWindowMinutes') ?? 10),
        hostsEnabled: formData.get('hostsEnabled') === 'on',
      },
      { ifMatch: version },
    );
    refresh(seriesId);
    return { ok: true, message: schedule ? 'Schedule saved' : 'Schedule cleared' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/** The regulars: everyone ticked in the form. */
export async function saveRegulars(
  seriesId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const participantIds = formData.getAll('participantId').map(String).filter(Boolean);
    await apiForUser().sessions.setRegulars(seriesId, { participantIds });
    refresh(seriesId);
    return {
      ok: true,
      message: `${participantIds.length} regular${participantIds.length === 1 ? '' : 's'} saved`,
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/** Adds one keep-apart pair to the session's defaults. */
export async function addKeepApart(
  seriesId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const participantA = String(formData.get('participantA') ?? '');
  const participantB = String(formData.get('participantB') ?? '');
  if (!participantA || !participantB) return { error: 'Pick two players' };
  if (participantA === participantB) return { error: 'Pick two different players' };
  try {
    const api = apiForUser();
    const current = (await api.sessions.keepApart(seriesId)).items;
    await api.sessions.setKeepApart(seriesId, {
      pairs: [...current, { participantA, participantB }].map((p) => ({
        participantA: p.participantA,
        participantB: p.participantB,
      })),
    });
    refresh(seriesId);
    return { ok: true, message: 'Kept apart' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

/** Removes one keep-apart pair. */
export async function removeKeepApart(
  seriesId: string,
  participantA: string,
  participantB: string,
): Promise<void> {
  const key = [participantA, participantB].sort().join(':');
  try {
    const api = apiForUser();
    const current = (await api.sessions.keepApart(seriesId)).items;
    await api.sessions.setKeepApart(seriesId, {
      pairs: current
        .filter((p) => [p.participantA, p.participantB].sort().join(':') !== key)
        .map((p) => ({ participantA: p.participantA, participantB: p.participantB })),
    });
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  refresh(seriesId);
}

/** The hosts: everyone ticked in the form. */
export async function saveHosts(
  seriesId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const profileIds = formData.getAll('profileId').map(String).filter(Boolean);
    await apiForUser().sessions.setHosts(seriesId, { profileIds });
    refresh(seriesId);
    return {
      ok: true,
      message: `${profileIds.length} host${profileIds.length === 1 ? '' : 's'} saved`,
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}
