'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiForUser, describeError } from '../../../../lib/api';

/** Ask to join the club behind an invitation-only public session; an organiser decides. */
export async function askToJoin(seriesId: string): Promise<void> {
  try {
    await apiForUser().joinRequests.create(seriesId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath('/explore');
  redirect('/explore?asked=1');
}

/** Join an open public session (Addendum 1.5): club membership, a player record, a regular. */
export async function joinSession(seriesId: string): Promise<void> {
  try {
    await apiForUser().sessions.join(seriesId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath('/explore');
  revalidatePath('/dashboard');
  revalidatePath('/sessions');
  redirect(`/sessions/${seriesId}?joined=1`);
}
