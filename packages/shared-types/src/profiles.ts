import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';

/**
 * Buddy profiles (Addendum 1.3): what a person is into, how good they think they are, when they
 * are free, and what gear they own. Step 1 keeps all of it private to the person; step 2 adds
 * who may see it.
 */

export const ACTIVITY_LEVELS = [
  { id: 'just_starting', label: 'Just starting', hint: 'New to it, or back after a long break' },
  { id: 'getting_going', label: 'Getting going', hint: 'Know the basics, out now and then' },
  { id: 'comfortable', label: 'Comfortable', hint: 'Regular, happy alongside most people' },
  { id: 'strong', label: 'Strong', hint: 'Club standard, likes a proper go' },
  { id: 'expert', label: 'Expert', hint: 'Coach, county, or close to it' },
] as const;
export const ActivityLevelSchema = z.enum([
  'just_starting',
  'getting_going',
  'comfortable',
  'strong',
  'expert',
]);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const WeekdayKeySchema = z.enum(WEEKDAY_KEYS);
export type WeekdayKey = z.infer<typeof WeekdayKeySchema>;
export const DAY_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export const DaySlotSchema = z.enum(DAY_SLOTS);
export type DaySlot = z.infer<typeof DaySlotSchema>;

/** `{ mon: ['evening'], sat: ['morning', 'afternoon'] }`; a day missing or empty means not free. */
export const AvailabilitySchema = z.partialRecord(WeekdayKeySchema, z.array(DaySlotSchema).max(3));
export type Availability = z.infer<typeof AvailabilitySchema>;

export const ProfileActivitySchema = z.object({
  id: UuidSchema,
  interestId: z.string(),
  interestName: z.string(),
  /** Set for racket sports: the sport is the activity. */
  sportId: z.string().nullable(),
  sportName: z.string().nullable(),
  level: ActivityLevelSchema.nullable(),
  days: AvailabilitySchema,
  note: z.string().nullable(),
});
export type ProfileActivity = z.infer<typeof ProfileActivitySchema>;

/** Stable key for an activity on a profile: `racket_sports:tennis` or `books`. */
export function activityKey(a: { interestId: string; sportId: string | null }): string {
  return a.sportId ? `${a.interestId}:${a.sportId}` : a.interestId;
}

export const SetActivitiesBodySchema = z.object({
  activities: z
    .array(
      z.object({
        interestId: z.string().regex(/^[a-z_]{1,40}$/),
        sportId: z
          .string()
          .regex(/^[a-z_]{1,40}$/)
          .nullable()
          .optional(),
        level: ActivityLevelSchema.nullable().optional(),
        days: AvailabilitySchema.optional(),
        note: z.string().trim().max(160).nullable().optional(),
      }),
    )
    .max(30),
});
export type SetActivitiesBody = z.infer<typeof SetActivitiesBodySchema>;

export const GearItemSchema = z.object({
  id: UuidSchema,
  interestId: z.string(),
  sportId: z.string().nullable(),
  name: z.string(),
  detail: z.string().nullable(),
  sortOrder: z.int(),
});
export type GearItem = z.infer<typeof GearItemSchema>;

export const SetGearBodySchema = z.object({
  items: z
    .array(
      z.object({
        interestId: z.string().regex(/^[a-z_]{1,40}$/),
        sportId: z
          .string()
          .regex(/^[a-z_]{1,40}$/)
          .nullable()
          .optional(),
        name: z.string().trim().min(1).max(80),
        detail: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .max(50),
});
export type SetGearBody = z.infer<typeof SetGearBodySchema>;

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
