import { z } from 'zod';

/**
 * Role grants (spec §6). Roles are scoped to a resource (organisation in Phase 0/1;
 * competition, meet, session and team scopes arrive with their phases).
 */
export const RoleSchema = z.enum([
  'platform_admin',
  'org_admin',
  'competition_director',
  'session_organiser',
  'team_captain',
  'participant',
  'spectator',
]);
export type Role = z.infer<typeof RoleSchema>;

export const MembershipStatusSchema = z.enum(['invited', 'active', 'suspended', 'left']);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const ParticipantSourceSchema = z.enum(['registered', 'guest', 'imported']);
export type ParticipantSource = z.infer<typeof ParticipantSourceSchema>;

/** Products that share the single Buddy Club identity. */
export const AppIdSchema = z.enum(['buddyclub', 'rally']);
export type AppId = z.infer<typeof AppIdSchema>;
