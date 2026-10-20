import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';
import { SportIdSchema } from './groups';

/** Category-agnostic community model (Addendum 1.1 section 5, ADR-018). */

export const InterestIdSchema = z.string().regex(/^[a-z_]{2,32}$/);
export const InterestSchema = z.object({
  id: InterestIdSchema,
  name: z.string(),
  sortOrder: z.int(),
});
export type Interest = z.infer<typeof InterestSchema>;

export const GroupVisibilitySchema = z.enum(['public', 'private']);
export const GroupJoinPolicySchema = z.enum(['open', 'invite']);

/** Public-facing group card, safe to show to anyone. */
export const GroupCardSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  interests: z.array(InterestSchema),
  sportId: SportIdSchema.nullable(),
  visibility: GroupVisibilitySchema,
  joinPolicy: GroupJoinPolicySchema,
  locality: z.string().nullable(),
  locationName: z.string().nullable(),
  organisationId: UuidSchema,
  organisationName: z.string(),
  memberCount: z.int(),
  nextActivity: z
    .object({ id: UuidSchema, title: z.string(), startsAt: IsoDateTimeSchema })
    .nullable(),
});
export type GroupCard = z.infer<typeof GroupCardSchema>;

export const CreateCommunityGroupBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  interestIds: z.array(InterestIdSchema).min(1).max(6),
  /** Only for racket-sport groups that Rally runs. */
  sportId: SportIdSchema.optional(),
  visibility: GroupVisibilitySchema.default('public'),
  joinPolicy: GroupJoinPolicySchema.default('open'),
  locality: z.string().trim().max(120).optional(),
  locationName: z.string().trim().max(200).optional(),
  /** Existing club to create the group in; omitted = a new club named after the group. */
  organisationId: UuidSchema.optional(),
});
export type CreateCommunityGroupBody = z.infer<typeof CreateCommunityGroupBodySchema>;

export const UpdateCommunityGroupBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    interestIds: z.array(InterestIdSchema).min(1).max(6).optional(),
    visibility: GroupVisibilitySchema.optional(),
    joinPolicy: GroupJoinPolicySchema.optional(),
    locality: z.string().trim().max(120).nullable().optional(),
    locationName: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateCommunityGroupBody = z.infer<typeof UpdateCommunityGroupBodySchema>;

export const ActivityStateSchema = z.enum(['scheduled', 'cancelled', 'completed']);
export const RsvpStatusSchema = z.enum(['going', 'maybe', 'not_going']);

export const ActivitySchema = z.object({
  id: UuidSchema,
  groupId: UuidSchema,
  groupName: z.string(),
  organisationId: UuidSchema,
  organisationName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  interest: InterestSchema.nullable(),
  venueId: UuidSchema.nullable(),
  venueName: z.string().nullable(),
  locationName: z.string().nullable(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  capacity: z.int().nullable(),
  visibility: GroupVisibilitySchema,
  state: ActivityStateSchema,
  goingCount: z.int(),
  maybeCount: z.int(),
  /** Caller's RSVP (null when signed out or none). */
  myRsvp: RsvpStatusSchema.nullable(),
  /** Set when Rally runs this gathering: Rally owns attendance (ADR-018). */
  rally: z
    .object({
      occurrenceId: UuidSchema,
      state: z.string(),
      publicSlug: z.string().nullable(),
      myAttendance: z.string().nullable(),
    })
    .nullable(),
  version: z.int(),
  createdAt: IsoDateTimeSchema,
});
export type Activity = z.infer<typeof ActivitySchema>;

export const CreateActivityBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).optional(),
    interestId: InterestIdSchema.optional(),
    venueId: UuidSchema.optional(),
    locationName: z.string().trim().max(200).optional(),
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema.optional(),
    capacity: z.int().min(1).max(10000).optional(),
    visibility: GroupVisibilitySchema.optional(),
    /** Link an existing Rally occurrence of the same club. */
    rallyOccurrenceId: UuidSchema.optional(),
  })
  .refine((b) => !b.endsAt || Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type CreateActivityBody = z.infer<typeof CreateActivityBodySchema>;

export const RsvpBodySchema = z.object({ status: RsvpStatusSchema });
export const LinkRallyBodySchema = z.object({ occurrenceId: UuidSchema.nullable() });

export const DiscoverQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  interest: InterestIdSchema.optional(),
  locality: z.string().trim().max(120).optional(),
});
export type DiscoverQuery = z.infer<typeof DiscoverQuerySchema>;

export const PublicActivityCardSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  groupId: UuidSchema,
  groupName: z.string(),
  interest: InterestSchema.nullable(),
  locality: z.string().nullable(),
  locationName: z.string().nullable(),
  venueName: z.string().nullable(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  goingCount: z.int(),
  capacity: z.int().nullable(),
  poweredByRally: z.boolean(),
});
export type PublicActivityCard = z.infer<typeof PublicActivityCardSchema>;

export const DiscoverResultSchema = z.object({
  interests: z.array(InterestSchema),
  groups: z.array(GroupCardSchema),
  activities: z.array(PublicActivityCardSchema),
});
export type DiscoverResult = z.infer<typeof DiscoverResultSchema>;

export const MyGroupSchema = GroupCardSchema.extend({
  role: z.enum(['organiser', 'member']),
});
export type MyGroup = z.infer<typeof MyGroupSchema>;

export const MyCommunitySchema = z.object({
  groups: z.array(MyGroupSchema),
  upcoming: z.array(ActivitySchema),
});
export type MyCommunity = z.infer<typeof MyCommunitySchema>;

export const ActivityIdParamsSchema = z.object({ activityId: UuidSchema });
