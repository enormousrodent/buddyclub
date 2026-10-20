import { z } from 'zod';
import { DisplayNameSchema, IsoDateTimeSchema, SlugSchema, UuidSchema } from './common';
import { MembershipStatusSchema, RoleSchema } from './roles';

export const OrganisationSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  /** A `personal` organisation is a Rally workspace, hidden from Buddy Club (ADR-017). */
  kind: z.enum(['club', 'personal']),
  version: z.int().min(1),
  createdAt: IsoDateTimeSchema,
  /** The caller's role in this organisation, when they are a member. */
  myRole: RoleSchema.nullable(),
});
export type Organisation = z.infer<typeof OrganisationSchema>;

export const CreateOrganisationBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  /** Optional; derived from the name when omitted. */
  slug: SlugSchema.optional(),
});
export type CreateOrganisationBody = z.infer<typeof CreateOrganisationBodySchema>;

export const UpdateOrganisationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateOrganisationBody = z.infer<typeof UpdateOrganisationBodySchema>;

export const MemberSchema = z.object({
  profileId: UuidSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().nullable(),
  role: RoleSchema,
  status: MembershipStatusSchema,
  joinedAt: IsoDateTimeSchema,
});
export type Member = z.infer<typeof MemberSchema>;

export const UpdateMemberBodySchema = z
  .object({
    role: RoleSchema.optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((b) => b.role !== undefined || b.status !== undefined, { message: 'nothing to update' });
export type UpdateMemberBody = z.infer<typeof UpdateMemberBodySchema>;

export const InvitationSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  role: RoleSchema,
  expiresAt: IsoDateTimeSchema,
  maxUses: z.int().min(1),
  useCount: z.int().min(0),
  revokedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const CreateInvitationBodySchema = z.object({
  role: RoleSchema.exclude(['platform_admin']).default('participant'),
  expiresInHours: z
    .int()
    .min(1)
    .max(24 * 30)
    .default(24 * 7),
  maxUses: z.int().min(1).max(500).default(1),
});
export type CreateInvitationBody = z.infer<typeof CreateInvitationBodySchema>;

/** Returned once, at creation: the plaintext token is never stored or shown again. */
export const InvitationCreatedSchema = InvitationSchema.extend({
  token: z.string(),
});
export type InvitationCreated = z.infer<typeof InvitationCreatedSchema>;

export const InvitationPreviewSchema = z.object({
  organisationName: z.string(),
  role: RoleSchema,
  expiresAt: IsoDateTimeSchema,
  /** False when expired, revoked or fully used. */
  redeemable: z.boolean(),
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const RedeemInvitationResponseSchema = z.object({
  organisationId: UuidSchema,
  organisationName: z.string(),
  role: RoleSchema,
  /** True when this account had already redeemed the invitation (or was already a member). */
  alreadyMember: z.boolean(),
});
export type RedeemInvitationResponse = z.infer<typeof RedeemInvitationResponseSchema>;

export const InvitationTokenParamsSchema = z.object({
  token: z.string().min(16).max(128),
});
