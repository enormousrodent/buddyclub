'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';

export async function joinFromCode(slug: string): Promise<ActionResult> {
  try {
    const result = await apiForUser().public.join(slug);
    revalidatePath(`/join/${slug}`);
    return {
      ok: true,
      message:
        result.attendanceStatus === 'checked_in'
          ? "You're checked in. Your court shows on your phone once a round is published."
          : "You're registered. Check in when the session opens.",
      link: `/sessions/${result.occurrenceId}/me`,
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}
