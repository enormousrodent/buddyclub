import type { Role } from '@buddyclub/shared-types';

/**
 * Organisation-scoped actions (spec section 6 permission table plus the Phase 1 club admin
 * operations). Resource-level refinements ("if assigned", "own team", "configurable") are enforced
 * by the owning module when those resources exist; this matrix is the coarse first gate.
 */
export const ORG_ACTIONS = [
  'organisation.view',
  'organisation.manage',
  'members.invite',
  'members.manage',
  'participants.manage',
  'groups.manage',
  'facilities.manage',
  'session.manage',
  'session.view',
  'competition.manage',
  'competition.view',
  'match.operate',
  'result.submit',
  'result.confirm',
  'rules.configure',
  'fixtures.publish',
  'session.guest.add',
  'session.rotation.generate',
  'team.lineup.submit',
  'progression.approve',
  'schedule.view',
] as const;
export type OrgAction = (typeof ORG_ACTIONS)[number];

const ADMINS: readonly Role[] = ['platform_admin', 'org_admin', 'competition_director'];
const ORGANISERS: readonly Role[] = [...ADMINS, 'session_organiser'];
const EVERYONE: readonly Role[] = [...ORGANISERS, 'team_captain', 'participant', 'spectator'];

const MATRIX: Record<OrgAction, readonly Role[]> = {
  'organisation.view': EVERYONE,
  'organisation.manage': ['platform_admin', 'org_admin'],
  'members.invite': ADMINS,
  'members.manage': ['platform_admin', 'org_admin'],
  'participants.manage': ORGANISERS,
  'groups.manage': ORGANISERS,
  'facilities.manage': ORGANISERS,
  'session.manage': ORGANISERS,
  'session.view': EVERYONE,
  'competition.manage': ADMINS,
  'competition.view': EVERYONE,
  'match.operate': ORGANISERS,
  'result.submit': [...ORGANISERS, 'team_captain'],
  'result.confirm': [...ADMINS, 'team_captain'],
  'rules.configure': ADMINS,
  'fixtures.publish': ADMINS,
  'session.guest.add': ORGANISERS,
  'session.rotation.generate': ORGANISERS,
  'team.lineup.submit': [...ADMINS, 'team_captain'],
  'progression.approve': ADMINS,
  'schedule.view': EVERYONE,
};

export function roleAllows(role: Role, action: OrgAction): boolean {
  return MATRIX[action].includes(role);
}

/** True when any of the roles a user holds in an organisation allows the action. */
export function anyRoleAllows(roles: readonly Role[], action: OrgAction): boolean {
  return roles.some((role) => roleAllows(role, action));
}

/** Roles an org admin may grant through invitations or member edits. */
export const GRANTABLE_ROLES: readonly Role[] = [
  'org_admin',
  'competition_director',
  'session_organiser',
  'team_captain',
  'participant',
  'spectator',
];
