'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiForUser, describeError } from '../../../../../lib/api';
import { INVITE_DAYS, INVITE_USES } from './config';

/**
 * A new player invite link for the session's club. The token is only ever returned once, so the
 * invite page shows it straight away (as a QR and a share button) from the query string.
 */
export async function createPlayerInvite(seriesId: string, orgId: string): Promise<void> {
  let token: string;
  try {
    const created = await apiForUser().invitations.create(orgId, {
      role: 'participant',
      maxUses: INVITE_USES,
      expiresInHours: 24 * INVITE_DAYS,
    });
    token = created.token;
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/sessions/${seriesId}/invite`);
  redirect(`/sessions/${seriesId}/invite?t=${encodeURIComponent(token)}`);
}

export async function revokePlayerInvite(
  seriesId: string,
  orgId: string,
  invitationId: string,
): Promise<void> {
  try {
    await apiForUser().invitations.revoke(orgId, invitationId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/sessions/${seriesId}/invite`);
  redirect(`/sessions/${seriesId}/invite`);
}
