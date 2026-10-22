import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';
import { AvailabilitySchema, DaySlotSchema, WeekdayKeySchema } from './profiles';

/**
 * Buddies (Addendum 1.4, steps 3 and 5). Every account is a Buddy Club member. A buddy is
 * someone you have shared a night with: both checked in on the same occurrence. Find me adds
 * people you have not played with, for adults who switched it on. Blocks hide in both
 * directions; reports go to the audit trail.
 */

const PersonSchema = z.object({
  profileId: UuidSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});

export const BuddySportSchema = z.object({
  activityId: z.string(),
  activityName: z.string(),
  level: z.string().nullable(),
});

/** A row in the buddies list or in search results. */
export const BuddySummarySchema = PersonSchema.extend({
  locality: z.string().nullable(),
  /** Their activities, with the level they gave themselves. */
  sports: z.array(BuddySportSchema),
  /** Nights you have both checked in to. Zero for someone found by search. */
  sharedNights: z.int(),
  lastPlayedAt: IsoDateTimeSchema.nullable(),
  hello: z.object({ sent: z.boolean(), received: z.boolean() }),
});
export type BuddySummary = z.infer<typeof BuddySummarySchema>;

/** `GET /v1/buddies/:profileId`: what a member may see of another member. */
export const BuddyCardSchema = BuddySummarySchema.extend({
  bio: z.string().nullable(),
  activities: z.array(
    z.object({
      activityId: z.string(),
      activityName: z.string(),
      interestId: z.string(),
      level: z.string().nullable(),
      days: AvailabilitySchema,
      note: z.string().nullable(),
    }),
  ),
  /** Null when they keep their gear to themselves. */
  gear: z
    .array(z.object({ activityId: z.string(), name: z.string(), detail: z.string().nullable() }))
    .nullable(),
  /** Why you can see them: a shared night, or Find me. */
  relationship: z.enum(['buddy', 'found']),
  /** You have blocked them. They never learn that. */
  blocked: z.boolean(),
});
export type BuddyCard = z.infer<typeof BuddyCardSchema>;

/** `GET /v1/me/hellos`: people who said hi to you, newest first. */
export const HelloSchema = z.object({
  id: UuidSchema,
  from: PersonSchema,
  sharedNights: z.int(),
  createdAt: IsoDateTimeSchema,
  seenAt: IsoDateTimeSchema.nullable(),
});
export type Hello = z.infer<typeof HelloSchema>;

/** Find me: who is findable, narrowed by sport, level, place and when they are free. */
export const BuddySearchQuerySchema = z.object({
  sport: z
    .string()
    .regex(/^[a-z_]{2,32}$/)
    .optional(),
  level: z.string().trim().max(40).optional(),
  locality: z.string().trim().max(80).optional(),
  day: WeekdayKeySchema.optional(),
  slot: DaySlotSchema.optional(),
});
export type BuddySearchQuery = z.infer<typeof BuddySearchQuerySchema>;

export const ReportBuddyBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type ReportBuddyBody = z.infer<typeof ReportBuddyBodySchema>;
