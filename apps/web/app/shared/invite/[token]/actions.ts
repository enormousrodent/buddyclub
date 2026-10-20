'use server';

import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';

export async function redeemInvitation(token: string): Promise<ActionResult> {
  let organisationId: string;
  try {
    const result = await apiForUser().invitations.redeem(token);
    organisationId = result.organisationId;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/clubs/${organisationId}`);
}
