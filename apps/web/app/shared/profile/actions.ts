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

/** Stores the uploaded photo's public URL on the profile, or removes it. */
export async function updateAvatar(url: string | null): Promise<{ error?: string }> {
  try {
    await apiForUser().updateMe({ avatarUrl: url });
    revalidatePath('/profile');
    revalidatePath('/dashboard');
    return {};
  } catch (error) {
    return { error: describeError(error) };
  }
}
