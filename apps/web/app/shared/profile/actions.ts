'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '../../../components/action-form';
import { apiForUser, describeError } from '../../../lib/api';

export async function updateProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().updateMe({ displayName: String(formData.get('displayName') ?? '') });
    revalidatePath('/profile');
    return { ok: true, message: 'Saved' };
  } catch (error) {
    return { error: describeError(error) };
  }
}
