import { z } from 'zod';

export const UuidSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const OrgIdParamsSchema = z.object({ orgId: UuidSchema });
export const IdParamsSchema = z.object({ id: UuidSchema });

/** Slug rules shared by organisations (and later competitions): lower-case, 3 to 63 chars. */
export const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/,
    'lower-case letters, digits and hyphens, 3 to 63 characters',
  );

export const DisplayNameSchema = z.string().trim().min(1).max(120);

/** Standard list wrapper so paging can be added without breaking clients. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}
