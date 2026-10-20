import { createHash, randomBytes } from 'node:crypto';

/** 192 bits of entropy, URL-safe, 32 characters. Shown once, never stored. */
export function generateOpaqueToken(): string {
  return randomBytes(24).toString('base64url');
}

/** SHA-256 hex (64 chars) of a token: what the database stores and looks up. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Normalises a slug from free text; the caller still validates length and uniqueness. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  return value == null ? null : toIso(value);
}
