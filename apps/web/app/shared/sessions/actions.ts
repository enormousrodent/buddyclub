'use server';

import type { RotationPreview } from '@buddyclub/shared-types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../components/action-form';
import { apiForUser, describeError } from '../../../lib/api';
import { absoluteUrl } from '../../../lib/links';

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim();
const optional = (formData: FormData, key: string) => {
  const v = text(formData, key);
  return v.length ? v : undefined;
};

async function run(work: () => Promise<unknown>, revalidate: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(revalidate);
}

/** Creates a session definition and its first occurrence in one go. */
export async function createSessionWithOccurrence(
  orgId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let occurrenceId: string;
  try {
    const api = apiForUser();
    const venueId = optional(formData, 'venueId');
    const series = await api.sessions.create(orgId, {
      name: text(formData, 'name'),
      sportId: text(formData, 'sportId') || 'badminton',
      ...(venueId ? { venueId } : {}),
      defaultRoundMinutes: Number(formData.get('roundMinutes') || 12),
      defaultDurationMinutes: Number(formData.get('durationMinutes') || 120),
    });
    const startsAt = new Date(text(formData, 'startsAt'));
    if (Number.isNaN(startsAt.getTime())) return { error: 'Pick a start date and time' };
    const occurrence = await api.sessions.createOccurrence(series.id, {
      startsAt: startsAt.toISOString(),
    });
    occurrenceId = occurrence.id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/sessions/${occurrenceId}`);
}

export async function scheduleOccurrence(
  seriesId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let occurrenceId: string;
  try {
    const startsAt = new Date(text(formData, 'startsAt'));
    if (Number.isNaN(startsAt.getTime())) return { error: 'Pick a start date and time' };
    const occurrence = await apiForUser().sessions.createOccurrence(seriesId, {
      startsAt: startsAt.toISOString(),
    });
    occurrenceId = occurrence.id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/sessions/${occurrenceId}`);
}

export async function transitionOccurrence(
  occurrenceId: string,
  action: 'open' | 'complete' | 'cancel',
): Promise<void> {
  await run(
    () => apiForUser().occurrences.transition(occurrenceId, action),
    `/sessions/${occurrenceId}`,
  );
}

export async function addWalkIn(
  occurrenceId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().occurrences.addEntry(occurrenceId, {
      displayName: text(formData, 'displayName'),
      checkIn: true,
    });
    revalidatePath(`/sessions/${occurrenceId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function addClubPlayer(
  occurrenceId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().occurrences.addEntry(occurrenceId, {
      participantId: text(formData, 'participantId'),
      checkIn: formData.get('checkIn') === 'on',
    });
    revalidatePath(`/sessions/${occurrenceId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function checkIn(occurrenceId: string, participantId?: string): Promise<void> {
  await run(
    () => apiForUser().occurrences.checkIn(occurrenceId, participantId),
    `/sessions/${occurrenceId}`,
  );
}

export async function withdraw(occurrenceId: string, participantId: string): Promise<void> {
  await run(
    () =>
      apiForUser().occurrences.withdraw(occurrenceId, participantId, { currentMatch: 'finish' }),
    `/sessions/${occurrenceId}`,
  );
}

export async function noShow(occurrenceId: string, participantId: string): Promise<void> {
  await run(
    () => apiForUser().occurrences.noShow(occurrenceId, participantId),
    `/sessions/${occurrenceId}`,
  );
}

export async function issueSessionGuestLink(
  occurrenceId: string,
  participantId: string,
): Promise<ActionResult> {
  try {
    const grant = await apiForUser().occurrences.guestGrant(occurrenceId, participantId, {
      scopes: ['schedule.view'],
      expiresInHours: 12,
      maxRedeems: 3,
    });
    return {
      ok: true,
      message: 'Guest link issued; shown once.',
      link: await absoluteUrl(`/guest/${grant.token}`),
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function addPairLock(
  occurrenceId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().occurrences.createPairLock(occurrenceId, {
      participantA: text(formData, 'participantA'),
      participantB: text(formData, 'participantB'),
      kind: 'hard',
    });
    revalidatePath(`/sessions/${occurrenceId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function releasePairLock(occurrenceId: string, lockId: string): Promise<void> {
  await run(
    () => apiForUser().occurrences.releasePairLock(occurrenceId, lockId),
    `/sessions/${occurrenceId}`,
  );
}

export async function previewRotation(
  occurrenceId: string,
): Promise<{ preview?: RotationPreview; error?: string }> {
  try {
    return { preview: await apiForUser().occurrences.previewRotation(occurrenceId) };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function commitRotation(
  occurrenceId: string,
  previewId: string,
  version: number,
): Promise<{ error?: string }> {
  try {
    await apiForUser().occurrences.commitRotation(occurrenceId, previewId, { ifMatch: version });
    revalidatePath(`/sessions/${occurrenceId}`);
    return {};
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function transitionRound(
  occurrenceId: string,
  roundId: string,
  action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel',
): Promise<void> {
  await run(() => apiForUser().rounds.transition(roundId, action), `/sessions/${occurrenceId}`);
}

export async function setOccurrencePublicAccess(
  occurrenceId: string,
  enabled: boolean,
  _prev: ActionResult,
): Promise<ActionResult> {
  try {
    await apiForUser().occurrences.setPublicAccess(occurrenceId, enabled);
    revalidatePath(`/sessions/${occurrenceId}`);
    return {
      ok: true,
      message: enabled ? 'Public board and QR join are on.' : 'Public board and QR join are off.',
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}
