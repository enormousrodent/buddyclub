'use server';

import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../../components/action-form';
import { apiForUser, describeError } from '../../../../../lib/api';

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim();

/**
 * A club in one form: name, optionally where you play and how many courts. Players join it with
 * an invite link; sessions and regulars live inside it. Continues to the session builder.
 */
export async function createRallyClub(
  fromWelcome: boolean,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let organisationId: string;
  try {
    const api = apiForUser();
    const org = await api.organisations.create({ name: text(formData, 'name') });
    organisationId = org.id;
    const venueName = text(formData, 'venueName');
    const courts = Math.min(20, Math.max(0, Number(formData.get('courts') || 0)));
    if (venueName) {
      const venue = await api.venues.create(org.id, { name: venueName, timezone: 'Europe/London' });
      for (let i = 1; i <= courts; i += 1)
        await api.venues.createCourt(venue.id, {
          code: String(i),
          label: `Court ${i}`,
          sportIds: [],
        });
    }
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/start?club=${organisationId}&new=1${fromWelcome ? '&from=welcome' : ''}`);
}
