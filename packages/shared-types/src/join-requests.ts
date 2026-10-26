import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';

/**
 * Ask to join (2026-10-26). A public, invitation-only session in Near you carries "Ask to join":
 * the request goes to the club's organisers, who approve or decline from the Members tab.
 * Approval makes the person a club member and a regular of that session.
 */

export const JoinRequestStatusSchema = z.enum(['pending', 'approved', 'declined']);
export type JoinRequestStatus = z.infer<typeof JoinRequestStatusSchema>;

export const JoinRequestSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  organisationName: z.string(),
  /** The session the person asked about; null if it was archived since. */
  seriesId: UuidSchema.nullable(),
  seriesName: z.string().nullable(),
  profileId: UuidSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  /** What the person plays, with their self-rated level, so an organiser can place them. */
  sports: z.array(z.object({ activityName: z.string(), level: z.string().nullable() })),
  note: z.string().nullable(),
  status: JoinRequestStatusSchema,
  createdAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.nullable(),
});
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

export const CreateJoinRequestBodySchema = z.object({
  note: z.string().trim().max(280).optional(),
});
export type CreateJoinRequestBody = z.infer<typeof CreateJoinRequestBodySchema>;
