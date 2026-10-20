# ADR-007: Fastify over NestJS; Kysely as the typed query layer

**Status:** Accepted (Phase 0)  
**Date:** 2026-10-19

## Context

The spec allows Fastify or NestJS and asks for a typed SQL layer where transaction boundaries
matter, without mixing ORMs.

## Decision

**Fastify 5** with `fastify-type-provider-zod`, `@fastify/swagger` and a small set of plugins.

- Zod schemas in `@buddyclub/shared-types` validate requests, serialise responses and generate the
  OpenAPI 3.1 document, so one definition drives the API, the docs and the client.
- Fastify's plugin encapsulation maps cleanly onto the module layout (ADR-002) without the
  decorator/DI layer NestJS adds. Fewer moving parts matters for a small team and for Claude Code
  generated changes being reviewable.
- Request ids are correlation ids: a well-formed `X-Correlation-Id` from the client is honoured,
  anything else is replaced with a UUID, and the id is echoed on every response and log line.

**Kysely** on top of `pg` for all database access.

- Explicit SQL semantics (joins, `for update`, `on conflict`) with compile-time typed columns,
  which is what match start, court occupancy and result revision transactions need.
- No implicit lazy loading or identity map, so transaction boundaries are visible in code.
- Table types are maintained by hand in `apps/platform-api/src/db/schema.ts` and cross-checked
  against `pnpm db:types` output when migrations change. If drift becomes a problem, switch to
  `kysely-codegen` against the local database.

Raw SQL via Kysely's `sql` tag is allowed for DDL-adjacent operations in tests and migrations.
No other ORM or query builder is to be introduced.

## Consequences

- Workspace packages ship TypeScript source; `tsx` runs the API in development and `tsup` bundles
  workspace packages into `dist/server.js` for deployment.
- Repositories are interfaces with a Postgres and an in-memory implementation, so contract tests
  are hermetic and database tests are explicit (`pnpm test:db`).
