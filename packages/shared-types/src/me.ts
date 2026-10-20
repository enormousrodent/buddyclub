import { z } from 'zod';
import { DisplayNameSchema, UuidSchema } from './common';
import { AppIdSchema, MembershipStatusSchema, RoleSchema } from './roles';

export const UserProfileSchema = z.object({
  id: UuidSchema,
  authUserId: UuidSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().nullable().describe('Absolute URL when set'),
  locale: z.string().min(2).max(16),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const MembershipSchema = z.object({
  organisationId: UuidSchema,
  organisationName: z.string(),
  organisationSlug: z.string(),
  /** `personal` memberships are Rally workspaces; Buddy Club hides them (ADR-017). */
  organisationKind: z.enum(['club', 'personal']),
  role: RoleSchema,
  status: MembershipStatusSchema,
});
export type Membership = z.infer<typeof MembershipSchema>;

/** The caller's participant record in an organisation (one per org, created on first need). */
export const MyParticipantSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  displayName: DisplayNameSchema,
});

/** `GET /v1/me`: the signed-in account as both apps see it. */
export const MeResponseSchema = z.object({
  profile: UserProfileSchema,
  memberships: z.array(MembershipSchema),
  participants: z.array(MyParticipantSchema),
  apps: z.array(AppIdSchema).describe('Apps this account may sign in to (shared identity)'),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UpdateMeBodySchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    locale: z.string().min(2).max(16).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateMeBody = z.infer<typeof UpdateMeBodySchema>;
