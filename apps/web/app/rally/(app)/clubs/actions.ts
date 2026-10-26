'use server';

import type { Role } from '@buddyclub/shared-types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../../components/action-form';
import { apiForUser, describeError } from '../../../../lib/api';
import { absoluteUrl } from '../../../../lib/links';

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim();
const optional = (formData: FormData, key: string) => {
  const v = text(formData, key);
  return v.length ? v : undefined;
};

/** Wraps a plain `<form action>` mutation: failures surface through the nearest error boundary. */
async function run(work: () => Promise<void>, revalidate: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(revalidate);
}

export async function createClub(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const slug = optional(formData, 'slug');
    const org = await apiForUser().organisations.create({
      name: text(formData, 'name'),
      ...(slug ? { slug } : {}),
    });
    id = org.id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/clubs/${id}`);
}

export async function renameClub(
  orgId: string,
  version: number,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().organisations.update(
      orgId,
      { name: text(formData, 'name') },
      { ifMatch: version },
    );
    revalidatePath(`/clubs/${orgId}`);
    return { ok: true, message: 'Saved' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function createInvitation(
  orgId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const role = text(formData, 'role') as Exclude<Role, 'platform_admin'>;
    const maxUses = Number(formData.get('maxUses') ?? 1);
    const created = await apiForUser().invitations.create(orgId, {
      role,
      maxUses,
      expiresInHours: 24 * 7,
    });
    revalidatePath(`/clubs/${orgId}/members`);
    return {
      ok: true,
      message: 'Invitation created. This link is shown once; copy it now.',
      link: await absoluteUrl(`/invite/${created.token}`),
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function decideJoinRequest(
  orgId: string,
  requestId: string,
  approve: boolean,
): Promise<void> {
  try {
    if (approve) await apiForUser().joinRequests.approve(orgId, requestId);
    else await apiForUser().joinRequests.decline(orgId, requestId);
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(`/clubs/${orgId}/members`);
  revalidatePath(`/clubs/${orgId}`);
  revalidatePath('/dashboard');
}

export async function revokeInvitation(orgId: string, invitationId: string): Promise<void> {
  await run(
    () =>
      apiForUser()
        .invitations.revoke(orgId, invitationId)
        .then(() => undefined),
    `/clubs/${orgId}/members`,
  );
}

export async function changeMemberRole(
  orgId: string,
  profileId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().organisations.updateMember(orgId, profileId, {
      role: text(formData, 'role') as Role,
    });
    revalidatePath(`/clubs/${orgId}/members`);
    return { ok: true, message: 'Role updated' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function removeMember(orgId: string, profileId: string): Promise<void> {
  await run(
    () =>
      apiForUser()
        .organisations.removeMember(orgId, profileId)
        .then(() => undefined),
    `/clubs/${orgId}/members`,
  );
}

export async function addGuest(
  orgId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const skill = optional(formData, 'skillRating');
    await apiForUser().participants.create(orgId, {
      displayName: text(formData, 'displayName'),
      ...(skill ? { skillRating: Number(skill) } : {}),
    });
    revalidatePath(`/clubs/${orgId}/players`);
    return { ok: true, message: 'Player added' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function archiveParticipant(orgId: string, participantId: string): Promise<void> {
  await run(
    () =>
      apiForUser()
        .participants.archive(orgId, participantId)
        .then(() => undefined),
    `/clubs/${orgId}/players`,
  );
  redirect(`/clubs/${orgId}/players`);
}

export async function issueGuestLink(orgId: string, participantId: string): Promise<ActionResult> {
  try {
    const grant = await apiForUser().guestGrants.create(orgId, participantId, {
      scopes: ['schedule.view'],
      expiresInHours: 24,
      maxRedeems: 3,
    });
    revalidatePath(`/clubs/${orgId}/players/${participantId}`);
    return {
      ok: true,
      message: 'Guest link issued. It is shown once; send it to the player now.',
      link: await absoluteUrl(`/guest/${grant.token}`),
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function revokeGuestLink(
  orgId: string,
  participantId: string,
  grantId: string,
): Promise<void> {
  await run(
    () =>
      apiForUser()
        .guestGrants.revoke(orgId, participantId, grantId)
        .then(() => undefined),
    `/clubs/${orgId}/players/${participantId}`,
  );
}

export async function createGroup(
  orgId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const description = optional(formData, 'description');
    await apiForUser().groups.create(orgId, {
      name: text(formData, 'name'),
      sportId: text(formData, 'sportId'),
      ...(description ? { description } : {}),
    });
    revalidatePath(`/clubs/${orgId}/groups`);
    return { ok: true, message: 'Group created' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function addGroupMember(
  groupId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().groups.addMember(groupId, {
      participantId: text(formData, 'participantId'),
    });
    revalidatePath(`/groups/${groupId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function removeGroupMember(groupId: string, participantId: string): Promise<void> {
  await run(
    () =>
      apiForUser()
        .groups.removeMember(groupId, participantId)
        .then(() => undefined),
    `/groups/${groupId}`,
  );
}

export async function createVenue(
  orgId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const town = optional(formData, 'town');
    const postcode = optional(formData, 'postcode');
    await apiForUser().venues.create(orgId, {
      name: text(formData, 'name'),
      timezone: text(formData, 'timezone') || 'Europe/London',
      address: { ...(town ? { town } : {}), ...(postcode ? { postcode } : {}) },
    });
    revalidatePath(`/clubs/${orgId}/venues`);
    return { ok: true, message: 'Venue created' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function createCourt(
  venueId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const label = optional(formData, 'label');
    await apiForUser().venues.createCourt(venueId, {
      code: text(formData, 'code'),
      ...(label ? { label } : {}),
      sportIds: [],
    });
    revalidatePath(`/venues/${venueId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function toggleCourt(
  venueId: string,
  courtId: string,
  active: boolean,
): Promise<void> {
  await run(
    () =>
      apiForUser()
        .venues.updateCourt(courtId, { active })
        .then(() => undefined),
    `/venues/${venueId}`,
  );
}
