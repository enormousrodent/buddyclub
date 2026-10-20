'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '../../../../../components/action-form';
import { apiForUser, describeError } from '../../../../../lib/api';

/** Name, round length and session length of a preset. */
export async function updatePreset(
  seriesId: string,
  version: number,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().sessions.update(
      seriesId,
      {
        name: String(formData.get('name') ?? '').trim(),
        defaultRoundMinutes: Number(formData.get('roundMinutes') || 12),
        defaultDurationMinutes: Number(formData.get('durationMinutes') || 120),
      },
      { ifMatch: version },
    );
    revalidatePath(`/presets/${seriesId}`);
    revalidatePath('/dashboard');
    revalidatePath('/start');
    return { ok: true, message: 'Saved' };
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
    revalidatePath(`/presets/${seriesId}`);
    revalidatePath('/dashboard');
    revalidatePath('/start');
    return {
      ok: true,
      message: `${participantIds.length} regular${participantIds.length === 1 ? '' : 's'} saved`,
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}
