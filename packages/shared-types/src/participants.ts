import { z } from 'zod';
import { DisplayNameSchema, IsoDateTimeSchema, UuidSchema } from './common';
import { ParticipantSourceSchema } from './roles';

/**
 * Self-declared, consent-gated attributes used only by opt-in matching (spec section 8).
 * Everything is optional; absence must never be treated as a value.
 */
export const DeclaredAttributesSchema = z
  .object({
    /** Free text chosen by the participant; used only when a ruleset's genderMode is not `off`. */
    gender: z.string().trim().min(1).max(32).optional(),
    /** Preferred partner/opponent gender matching, if the participant wants one. */
    matchingPreference: z.enum(['any', 'same', 'mixed']).optional(),
    consentRecordedAt: IsoDateTimeSchema.optional(),
  })
  .strict();
export type DeclaredAttributes = z.infer<typeof DeclaredAttributesSchema>;

export const ParticipantSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  displayName: DisplayNameSchema,
  source: ParticipantSourceSchema,
  /** Set only through a verified claim (ADR-008). */
  userProfileId: UuidSchema.nullable(),
  skillRating: z.number().min(0).max(100).nullable(),
  declaredAttributes: DeclaredAttributesSchema,
  archivedAt: IsoDateTimeSchema.nullable(),
  version: z.int().min(1),
  createdAt: IsoDateTimeSchema,
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const CreateParticipantBodySchema = z.object({
  displayName: DisplayNameSchema,
  skillRating: z.number().min(0).max(100).optional(),
  declaredAttributes: DeclaredAttributesSchema.optional(),
});
export type CreateParticipantBody = z.infer<typeof CreateParticipantBodySchema>;

export const UpdateParticipantBodySchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    skillRating: z.number().min(0).max(100).nullable().optional(),
    declaredAttributes: DeclaredAttributesSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateParticipantBody = z.infer<typeof UpdateParticipantBodySchema>;

export const ListParticipantsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(false),
});

export const GuestScopeSchema = z.enum(['schedule.view']);
export type GuestScope = z.infer<typeof GuestScopeSchema>;

export const GuestGrantSchema = z.object({
  id: UuidSchema,
  participantId: UuidSchema,
  scopes: z.array(GuestScopeSchema),
  expiresAt: IsoDateTimeSchema,
  revokedAt: IsoDateTimeSchema.nullable(),
  redeemCount: z.int().min(0),
  maxRedeems: z.int().min(1),
  createdAt: IsoDateTimeSchema,
});
export type GuestGrant = z.infer<typeof GuestGrantSchema>;

export const CreateGuestGrantBodySchema = z.object({
  scopes: z.array(GuestScopeSchema).min(1).default(['schedule.view']),
  expiresInHours: z
    .int()
    .min(1)
    .max(24 * 14)
    .default(24),
  /** How many devices may redeem the same link (a player and a parent, for example). */
  maxRedeems: z.int().min(1).max(10).default(3),
});
export type CreateGuestGrantBody = z.infer<typeof CreateGuestGrantBodySchema>;

/** Returned once: the plaintext redemption token is never stored. */
export const GuestGrantCreatedSchema = GuestGrantSchema.extend({ token: z.string() });
export type GuestGrantCreated = z.infer<typeof GuestGrantCreatedSchema>;

export const GuestRedeemBodySchema = z.object({ token: z.string().min(16).max(128) });

export const GuestSessionSchema = z.object({
  /** Bearer credential for guest-scoped endpoints. Short-lived; re-redeem the link to renew. */
  accessToken: z.string(),
  expiresAt: IsoDateTimeSchema,
  participant: z.object({ id: UuidSchema, displayName: DisplayNameSchema }),
  organisation: z.object({ id: UuidSchema, name: z.string() }),
  scopes: z.array(GuestScopeSchema),
});
export type GuestSession = z.infer<typeof GuestSessionSchema>;

export const GuestMeSchema = z.object({
  participant: z.object({ id: UuidSchema, displayName: DisplayNameSchema }),
  organisation: z.object({ id: UuidSchema, name: z.string() }),
  scopes: z.array(GuestScopeSchema),
  grantExpiresAt: IsoDateTimeSchema,
});
export type GuestMe = z.infer<typeof GuestMeSchema>;
