import { roleAllows, type OrgAction } from '@buddyclub/auth';
import type { Role } from '@buddyclub/shared-types';
import { forbidden } from '../problems.js';
import type { Actor } from './actor.js';

/** Returns the actor's active role in the organisation or throws 403. */
export function assertOrgMember(actor: Actor, organisationId: string): Role {
  const membership = actor.memberships.get(organisationId);
  if (!membership || membership.status !== 'active') {
    throw forbidden('You are not an active member of this organisation');
  }
  return membership.role;
}

/** Returns the role when it allows the action in the organisation, otherwise throws 403. */
export function assertOrgAction(actor: Actor, organisationId: string, action: OrgAction): Role {
  const role = assertOrgMember(actor, organisationId);
  if (!roleAllows(role, action)) {
    throw forbidden(`Your role (${role}) does not allow ${action}`);
  }
  return role;
}

export function canOrgAction(actor: Actor, organisationId: string, action: OrgAction): boolean {
  const membership = actor.memberships.get(organisationId);
  return !!membership && membership.status === 'active' && roleAllows(membership.role, action);
}
