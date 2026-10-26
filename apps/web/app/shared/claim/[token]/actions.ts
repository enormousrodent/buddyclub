'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiForUser, describeError } from '../../../../lib/api';

/** Take over the player a guest link points at (ADR-008), then go home. */
export async function claimPlayer(token: string): Promise<void> {
  try {
    await apiForUser().guest.claim(token);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath('/dashboard');
  revalidatePath('/sessions');
  redirect('/dashboard?claimed=1');
}
