import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common';
import { SportIdSchema } from './groups';

export const AddressSchema = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    town: z.string().trim().max(120).optional(),
    postcode: z.string().trim().max(20).optional(),
    country: z.string().trim().length(2).optional().describe('ISO 3166-1 alpha-2'),
    mapUrl: z.url().optional(),
  })
  .strict();
export type Address = z.infer<typeof AddressSchema>;

export const CourtSchema = z.object({
  id: UuidSchema,
  venueId: UuidSchema,
  code: z.string(),
  label: z.string().nullable(),
  sportIds: z.array(SportIdSchema),
  zone: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.int(),
});
export type Court = z.infer<typeof CourtSchema>;

export const VenueSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  name: z.string(),
  timezone: z.string().describe('IANA timezone, e.g. Europe/London'),
  address: AddressSchema,
  notes: z.string().nullable(),
  archivedAt: IsoDateTimeSchema.nullable(),
  version: z.int().min(1),
  createdAt: IsoDateTimeSchema,
});
export type Venue = z.infer<typeof VenueSchema>;

export const VenueDetailSchema = VenueSchema.extend({ courts: z.array(CourtSchema) });
export type VenueDetail = z.infer<typeof VenueDetailSchema>;

export const CreateVenueBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  timezone: z.string().min(1).max(64).default('Europe/London'),
  address: AddressSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateVenueBody = z.infer<typeof CreateVenueBodySchema>;

export const UpdateVenueBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    timezone: z.string().min(1).max(64).optional(),
    address: AddressSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateVenueBody = z.infer<typeof UpdateVenueBodySchema>;

export const CreateCourtBodySchema = z.object({
  code: z.string().trim().min(1).max(16),
  label: z.string().trim().max(80).optional(),
  sportIds: z.array(SportIdSchema).default([]),
  zone: z.string().trim().max(40).optional(),
  sortOrder: z.int().optional(),
});
export type CreateCourtBody = z.infer<typeof CreateCourtBodySchema>;

export const UpdateCourtBodySchema = z
  .object({
    label: z.string().trim().max(80).nullable().optional(),
    sportIds: z.array(SportIdSchema).optional(),
    zone: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.int().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateCourtBody = z.infer<typeof UpdateCourtBodySchema>;

export const VenueIdParamsSchema = z.object({ venueId: UuidSchema });
export const CourtIdParamsSchema = z.object({ courtId: UuidSchema });
