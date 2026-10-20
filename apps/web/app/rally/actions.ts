'use server';

import { redirect } from 'next/navigation';
import { apiForUser, describeError } from '../../lib/api';

/** One-tap start from a preset: new occurrence now, opened for check-in, straight to the board. */
export async function startPreset(seriesId: string): Promise<void> {
  let occurrenceId: string;
  try {
    occurrenceId = (await apiForUser().sessions.startPreset(seriesId, { open: true })).id;
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  redirect(`/sessions/${occurrenceId}`);
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
