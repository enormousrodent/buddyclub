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

function pairKind(value: string): 'hard' | 'soft' | 'avoid' {
  return value === 'soft' || value === 'avoid' ? value : 'hard';
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
      kind: pairKind(text(formData, 'kind')),
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

/**
 * Rally's session builder (designs B3 and A6). Creates the series (a preset) and, when "start it
 * now" is ticked, tonight's occurrence opened for check-in. From onboarding it also marks the
 * person as onboarded so the dashboard stops redirecting them.
 */
export async function setUpSession(
  orgId: string,
  fromWelcome: boolean,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let to: string;
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
    if (formData.get('startNow') === 'on') {
      const occurrence = await api.sessions.createOccurrence(series.id, {
        startsAt: new Date().toISOString(),
      });
      await api.occurrences.transition(occurrence.id, 'open');
      to = `/sessions/${occurrence.id}/players`;
    } else {
      to = `/sessions/${series.id}`;
    }
  } catch (error) {
    return { error: describeError(error) };
  }
  if (fromWelcome) {
    const { cookies } = await import('next/headers');
    (await cookies()).set('rally-onboarded', '1', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
  redirect(to);
}

/** Checks in everyone who is registered but not here yet (design B4, "Check everyone in"). */
export async function checkInEveryone(occurrenceId: string): Promise<void> {
  await run(async () => {
    const api = apiForUser();
    const board = await api.occurrences.board(occurrenceId);
    for (const e of board.entries)
      if (e.attendanceStatus === 'registered')
        await api.occurrences.checkIn(occurrenceId, e.participantId);
  }, `/sessions/${occurrenceId}`);
}

/** Rate a night (Addendum 1.2 step 3): stars and tags from the rating form. */
export async function rateNight(
  occurrenceId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const score = Number(formData.get('score'));
  if (!Number.isInteger(score) || formData.get('score') === '') return { error: 'Pick your stars' };
  const tags = formData.getAll('tag').map(String).filter(Boolean);
  try {
    await apiForUser().occurrences.rate(occurrenceId, { score, tags });
  } catch (error) {
    return { error: describeError(error) };
  }
  revalidatePath(`/sessions/${occurrenceId}`);
  revalidatePath('/dashboard');
  redirect(`/sessions/${occurrenceId}/rate`);
}

/** Who won on a court (king of the court moves teams by it). null clears a mistake. */
export async function recordResult(
  occurrenceId: string,
  matchId: string,
  winnerSide: 1 | 2 | null,
): Promise<void> {
  await run(
    () => apiForUser().occurrences.recordResult(occurrenceId, matchId, { winnerSide }),
    `/sessions/${occurrenceId}`,
  );
}

/** Tonight's format, before the first round is called. */
export async function setNightMode(
  occurrenceId: string,
  mode: 'mix' | 'king_of_the_court',
): Promise<void> {
  await run(
    () => apiForUser().occurrences.update(occurrenceId, { mode }),
    `/sessions/${occurrenceId}/players`,
  );
}

/** "Set up" on a planned night: opens check-in and goes to Players to tick who is coming. */
export async function openNight(occurrenceId: string): Promise<void> {
  try {
    await apiForUser().occurrences.transition(occurrenceId, 'open');
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/sessions/${occurrenceId}`);
  revalidatePath('/dashboard');
  revalidatePath('/sessions');
  redirect(`/sessions/${occurrenceId}/players`);
}
