'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';

/** Buddies (Addendum 1.4 step 3): Say hi, block, unblock, report. */

function refresh(profileId: string) {
  revalidatePath(`/buddies/${profileId}`);
  revalidatePath('/buddies');
  revalidatePath('/buddies/find');
  revalidatePath('/dashboard');
}

export async function sayHi(profileId: string): Promise<void> {
  try {
    await apiForUser().buddies.hello(profileId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  refresh(profileId);
}

export async function blockPerson(profileId: string): Promise<void> {
  try {
    await apiForUser().buddies.block(profileId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  refresh(profileId);
  redirect('/buddies');
}

export async function unblockPerson(profileId: string): Promise<void> {
  try {
    await apiForUser().buddies.unblock(profileId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  refresh(profileId);
}

export async function reportPerson(
  profileId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) return { error: 'Say what happened' };
  try {
    await apiForUser().buddies.report(profileId, { reason });
  } catch (error) {
    return { error: describeError(error) };
  }
  return { ok: true, message: 'Reported. Thank you; someone will look.' };
}
