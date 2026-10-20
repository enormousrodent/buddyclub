export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

export interface PgErrorLike {
  code?: string;
  constraint?: string;
  message?: string;
}

export function pgError(error: unknown): PgErrorLike | null {
  if (error && typeof error === 'object' && 'code' in error) return error as PgErrorLike;
  return null;
}

export function isPgCode(error: unknown, code: string, constraint?: string): boolean {
  const e = pgError(error);
  if (!e || e.code !== code) return false;
  return constraint === undefined || e.constraint === constraint;
}
