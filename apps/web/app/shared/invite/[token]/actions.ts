'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';

/**
 * Joins the club. On the Rally host the new member lands on their Rally home, where the club's
 * sessions show up; on Buddy Club, on the club page.
 */
export async function redeemInvitation(token: string): Promise<ActionResult> {
  let organisationId: string;
  try {
    const result = await apiForUser().invitations.redeem(token);
    organisationId = result.organisationId;
  } catch (error) {
    return { error: describeError(error) };
  }
  const product = (await headers()).get('x-buddyclub-product');
  redirect(product === 'rally' ? '/dashboard?joined=1' : `/clubs/${organisationId}`);
}
