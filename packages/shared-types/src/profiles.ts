import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';

/**
 * Buddy profiles (Addendum 1.3): what a person is into, how good they think they are, when they
 * are free, and what gear they own. Step 1 keeps all of it private to the person; step 2 adds
 * who may see it.
 */

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const WeekdayKeySchema = z.enum(WEEKDAY_KEYS);
export type WeekdayKey = z.infer<typeof WeekdayKeySchema>;
export const DAY_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export const DaySlotSchema = z.enum(DAY_SLOTS);
export type DaySlot = z.infer<typeof DaySlotSchema>;

/** `{ mon: ['evening'], sat: ['morning', 'afternoon'] }`; a day missing or empty means not free. */
export const AvailabilitySchema = z.partialRecord(WeekdayKeySchema, z.array(DaySlotSchema).max(3));
export type Availability = z.infer<typeof AvailabilitySchema>;

/** One activity on a profile. `activityId` is a catalogue id; `interestId` is its category. */
export const ProfileActivitySchema = z.object({
  id: UuidSchema,
  activityId: z.string(),
  activityName: z.string(),
  interestId: z.string(),
  interestName: z.string(),
  /** Kept for callers that still read the old shape; equals `activityId`. */
  sportId: z.string(),
  sportName: z.string(),
  /** A value from the activity's ladder: an option id, a grade or certification name, or a number. */
  level: z.string().nullable(),
  days: AvailabilitySchema,
  note: z.string().nullable(),
  /** For the `other` activity: what the person typed, pending a catalogue entry. */
  customName: z.string().nullable(),
});
export type ProfileActivity = z.infer<typeof ProfileActivitySchema>;

/** Stable key for an activity on a profile: the catalogue id. */
export function activityKey(a: { activityId: string }): string {
  return a.activityId;
}

const ActivityIdSchema = z.string().regex(/^[a-z_]{2,32}$/);

export const SetActivitiesBodySchema = z.object({
  activities: z
    .array(
      z.object({
        activityId: ActivityIdSchema,
        /** Validated against the activity's ladder in the catalogue. */
        level: z.string().trim().max(40).nullable().optional(),
        days: AvailabilitySchema.optional(),
        note: z.string().trim().max(160).nullable().optional(),
        /** Required when `activityId` is `other`. */
        customName: z.string().trim().min(1).max(60).nullable().optional(),
      }),
    )
    .max(30),
});
export type SetActivitiesBody = z.infer<typeof SetActivitiesBodySchema>;

export const GearItemSchema = z.object({
  id: UuidSchema,
  activityId: z.string(),
  interestId: z.string(),
  name: z.string(),
  detail: z.string().nullable(),
  sortOrder: z.int(),
});
export type GearItem = z.infer<typeof GearItemSchema>;

export const SetGearBodySchema = z.object({
  items: z
    .array(
      z.object({
        activityId: ActivityIdSchema,
        name: z.string().trim().min(1).max(80),
        detail: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .max(50),
});
export type SetGearBody = z.infer<typeof SetGearBodySchema>;

/** "Not got your activity?": a typed name, matched to the catalogue or kept as a suggestion. */
export const SuggestActivityBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type SuggestActivityBody = z.infer<typeof SuggestActivityBodySchema>;

export const SuggestionResultSchema = z.object({
  /** The catalogue activity when the name is one we already have. */
  matched: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** How many people have asked for this name so far (the caller included once stored). */
  count: z.int(),
  /** The suggestion as stored, when it was not a match. */
  suggested: z.string().nullable(),
});
export type SuggestionResult = z.infer<typeof SuggestionResultSchema>;

/** `GET /v1/me/profile`: the person's own buddy profile in full. */
export const MyProfileSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  locality: z.string().nullable(),
  bio: z.string().nullable(),
  /** Find me: shown in buddy search (step 2). Off by default; needs 18+ confirmation. */
  discoverable: z.boolean(),
  showGear: z.boolean(),
  adultConfirmed: z.boolean(),
  /** Each app's first run is its own; finishing one never skips the other. */
  onboarded: z.object({ buddyclub: z.boolean(), rally: z.boolean() }),
  activities: z.array(ProfileActivitySchema),
  gear: z.array(GearItemSchema),
  updatedAt: IsoDateTimeSchema,
});
export type MyProfile = z.infer<typeof MyProfileSchema>;

export const UpdateProfileBodySchema = z
  .object({
    locality: z.string().trim().max(80).nullable().optional(),
    bio: z.string().trim().max(160).nullable().optional(),
    discoverable: z.boolean().optional(),
    showGear: z.boolean().optional(),
    /** Only ever set to true; the moment is recorded server-side. */
    adultConfirmed: z.literal(true).optional(),
    /** Marks that app's first run as finished. */
    onboarded: z.enum(['buddyclub', 'rally']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
