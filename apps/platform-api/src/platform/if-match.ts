import type { FastifyRequest } from 'fastify';
import { AppError } from '../problems.js';

/**
 * Parses `If-Match: <version>` (optionally quoted). Absent means "no precondition", which the spec
 * allows; a stale value yields 409 VERSION_CONFLICT when the update finds no row at that version.
 */
export function expectedVersion(request: FastifyRequest): number | null {
  const raw = request.headers['if-match'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === '' || value === '*') return null;
  const n = Number(value.replace(/^W\//, '').replace(/^"|"$/g, ''));
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Invalid If-Match header',
      'Expected a positive integer version',
    );
  }
  return n;
}

export function versionConflict(entity: string): AppError {
  return new AppError(
    409,
    'VERSION_CONFLICT',
    `${entity} was modified by someone else`,
    'Reload and retry with the current version in If-Match',
  );
}
