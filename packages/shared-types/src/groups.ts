import { z } from 'zod';
import { DisplayNameSchema, IsoDateTimeSchema, UuidSchema } from './common';
import { ParticipantSourceSchema } from './roles';

export const SportIdSchema = z.string().regex(/^[a-z_]{2,32}$/);

export const SportSchema = z.object({
  id: SportIdSchema,
  name: z.string(),
  defaultPlayersPerSide: z.int().min(1),
  /** The catalogue category (a `community.interests` id). */
  categoryId: z.string(),
});
export type Sport = z.infer<typeof SportSchema>;

export const GroupSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  /** Only racket-sport groups that Rally runs carry a sport (ADR-018). */
  sportId: SportIdSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  archivedAt: IsoDateTimeSchema.nullable(),
  memberCount: z.int().min(0),
  version: z.int().min(1),
  createdAt: IsoDateTimeSchema,
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupMemberSchema = z.object({
  participantId: UuidSchema,
  displayName: DisplayNameSchema,
  source: ParticipantSourceSchema,
  status: z.enum(['active', 'left', 'removed']),
  joinedAt: IsoDateTimeSchema,
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GroupDetailSchema = GroupSchema.extend({
  members: z.array(GroupMemberSchema),
});
export type GroupDetail = z.infer<typeof GroupDetailSchema>;

export const CreateGroupBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  sportId: SportIdSchema.optional(),
  description: z.string().trim().max(2000).optional(),
});
export type CreateGroupBody = z.infer<typeof CreateGroupBodySchema>;

export const UpdateGroupBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateGroupBody = z.infer<typeof UpdateGroupBodySchema>;

export const AddGroupMemberBodySchema = z.object({ participantId: UuidSchema });
export type AddGroupMemberBody = z.infer<typeof AddGroupMemberBodySchema>;

export const GroupIdParamsSchema = z.object({ groupId: UuidSchema });
export const GroupMemberParamsSchema = z.object({ groupId: UuidSchema, participantId: UuidSchema });
