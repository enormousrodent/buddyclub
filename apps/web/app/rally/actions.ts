'use server';

import { redirect } from 'next/navigation';
import { apiForUser, describeError } from '../../lib/api';

/**
 * Start a session now, or set up its next night (Addendum 1.2). Starting now opens check-in and
 * goes straight to the board; setting up ahead lands on Players to tick who is coming. When
 * another host set the same night up first, theirs is returned and we go there.
 */
export async function startSession(seriesId: string, startsAt?: string): Promise<void> {
  let occurrenceId: string;
  try {
    occurrenceId = (
      await apiForUser().sessions.startPreset(seriesId, {
        open: true,
        ...(startsAt ? { startsAt } : {}),
      })
    ).id;
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  redirect(startsAt ? `/sessions/${occurrenceId}/players` : `/sessions/${occurrenceId}`);
}

/** Creates the caller's personal workspace if needed and continues to the start form (ADR-017). */
export async function startOnMyOwn(): Promise<void> {
  let organisationId: string;
  try {
    organisationId = (await apiForUser().organisations.workspace()).id;
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  redirect(`/start?club=${organisationId}`);
}
