import { z } from 'zod';

/** Stable machine-readable error codes (see spec §7). Extend here, never ad hoc in handlers. */
export const ErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RULE_UNSATISFIABLE',
  'COURT_CONFLICT',
  'PLAYER_CONFLICT',
  'INVALID_SCORE',
  'UNRESOLVED_TIE',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const FieldErrorSchema = z.object({
  path: z.string().describe('JSON pointer-ish path to the offending field, e.g. body/displayName'),
  message: z.string(),
  code: z.string().optional(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** RFC 7807-style problem document returned for every error response. */
export const ProblemDetailsSchema = z.object({
  type: z
    .string()
    .describe('URN identifying the problem class, e.g. urn:buddyclub:problem:not-found'),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  code: ErrorCodeSchema,
  correlationId: z.string(),
  fieldErrors: z.array(FieldErrorSchema).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function problemTypeFor(code: ErrorCode): string {
  return `urn:buddyclub:problem:${code.toLowerCase().replace(/_/g, '-')}`;
}
