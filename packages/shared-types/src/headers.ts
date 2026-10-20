/** Request/response header names used across the platform API (lower-case, as Node exposes them). */
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IF_MATCH_HEADER = 'if-match';

/** Accepted shape for a client-supplied correlation id. Anything else is replaced server-side. */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
