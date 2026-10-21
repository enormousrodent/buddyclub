import type { SessionSeries } from '@buddyclub/shared-types';
import { redirect } from 'next/navigation';
import { ApiError, apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';

/**
 * `/sessions/:id` serves both a session (series) and a night (occurrence); both are "sessions"
 * to the person using the app (Addendum 1.2). Returns the series when the id is one, null when
 * it is a night.
 */
export async function resolveSeries(id: string): Promise<SessionSeries | null> {
  if (!(await getSessionUser())) redirect(`/sign-in?next=${encodeURIComponent(`/sessions/${id}`)}`);
  try {
    return await apiForUser().sessions.get(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
