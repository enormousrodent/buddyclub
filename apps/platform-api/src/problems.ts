import {
  PROBLEM_CONTENT_TYPE,
  problemTypeFor,
  type ErrorCode,
  type FieldError,
  type ProblemDetails,
} from '@buddyclub/shared-types';
import type { FastifyReply } from 'fastify';

/** Domain/application error carrying an HTTP status and a stable error code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly title: string,
    public readonly detail?: string,
    public readonly fieldErrors?: FieldError[],
  ) {
    super(detail ?? title);
    this.name = 'AppError';
  }
}

export const unauthenticated = (detail?: string) =>
  new AppError(401, 'UNAUTHENTICATED', 'Authentication required', detail);
export const forbidden = (detail?: string) => new AppError(403, 'FORBIDDEN', 'Forbidden', detail);
export const notFound = (detail?: string) => new AppError(404, 'NOT_FOUND', 'Not found', detail);

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

export function codeForStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? 'INTERNAL';
}

export interface ProblemInput {
  status: number;
  code: ErrorCode;
  title: string;
  detail?: string;
  fieldErrors?: FieldError[];
}

export function buildProblem(input: ProblemInput, correlationId: string): ProblemDetails {
  const problem: ProblemDetails = {
    type: problemTypeFor(input.code),
    title: input.title,
    status: input.status,
    code: input.code,
    correlationId,
  };
  if (input.detail) problem.detail = input.detail;
  if (input.fieldErrors && input.fieldErrors.length > 0) problem.fieldErrors = input.fieldErrors;
  return problem;
}

export function sendProblem(reply: FastifyReply, input: ProblemInput, correlationId: string) {
  return reply
    .status(input.status)
    .header('content-type', PROBLEM_CONTENT_TYPE)
    .send(buildProblem(input, correlationId));
}
