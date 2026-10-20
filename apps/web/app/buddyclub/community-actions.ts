'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../components/action-form';
import { apiForUser, describeError } from '../../lib/api';

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();
const optional = (fd: FormData, key: string) => {
  const v = text(fd, key);
  return v.length ? v : undefined;
};

export async function createCommunityGroup(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const organisationId = optional(fd, 'organisationId');
    const sportId = optional(fd, 'sportId');
    const group = await apiForUser().community.createGroup({
      name: text(fd, 'name'),
      ...(optional(fd, 'description') ? { description: text(fd, 'description') } : {}),
      interestIds: fd.getAll('interestIds').map(String),
      visibility: text(fd, 'visibility') === 'private' ? 'private' : 'public',
      joinPolicy: text(fd, 'joinPolicy') === 'invite' ? 'invite' : 'open',
      ...(optional(fd, 'locality') ? { locality: text(fd, 'locality') } : {}),
      ...(optional(fd, 'locationName') ? { locationName: text(fd, 'locationName') } : {}),
      ...(organisationId ? { organisationId } : {}),
      ...(sportId ? { sportId } : {}),
    });
    id = group.id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/groups/${id}`);
}

export async function joinGroup(groupId: string): Promise<void> {
  try {
    await apiForUser().community.joinGroup(groupId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
}

export async function rsvp(
  activityId: string,
  status: 'going' | 'maybe' | 'not_going',
): Promise<void> {
  try {
    await apiForUser().community.rsvp(activityId, status);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/activities/${activityId}`);
  revalidatePath('/groups');
}

export async function createActivity(
  groupId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  let id: string;
  try {
    const endsAt = optional(fd, 'endsAt');
    const capacity = Number(fd.get('capacity'));
    const rally = optional(fd, 'rallyOccurrenceId');
    const activity = await apiForUser().community.createActivity(groupId, {
      title: text(fd, 'title'),
      ...(optional(fd, 'description') ? { description: text(fd, 'description') } : {}),
      ...(optional(fd, 'interestId') ? { interestId: text(fd, 'interestId') } : {}),
      ...(optional(fd, 'locationName') ? { locationName: text(fd, 'locationName') } : {}),
      startsAt: new Date(text(fd, 'startsAt')).toISOString(),
      ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
      ...(Number.isInteger(capacity) && capacity > 0 ? { capacity } : {}),
      ...(rally ? { rallyOccurrenceId: rally } : {}),
    });
    id = activity.id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/activities/${id}`);
}

export async function cancelActivity(activityId: string): Promise<void> {
  try {
    await apiForUser().community.cancelActivity(activityId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/activities/${activityId}`);
}
