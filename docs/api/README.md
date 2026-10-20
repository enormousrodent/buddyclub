# API documentation

`openapi.json` is generated from the live Fastify route schemas (which are Zod schemas from
`@buddyclub/shared-types`) by:

```sh
pnpm openapi:emit
```

CI fails if the committed file differs from a fresh emit, so regenerate it whenever a route or
schema changes. Swagger UI is available at `http://127.0.0.1:4000/docs` when the API runs outside
production.

Conventions (spec section 7):

- Base path `/v1`; health endpoints at `/healthz` and `/readyz`.
- Errors are `application/problem+json` documents with a stable `code` and the request's
  `correlationId`.
- Every response carries `X-Correlation-Id`; clients may send one (8 to 128 chars of
  `[A-Za-z0-9._:-]`).
- Mutating endpoints (from Phase 1) accept `Idempotency-Key` and, for versioned aggregates,
  `If-Match: <version>`.
