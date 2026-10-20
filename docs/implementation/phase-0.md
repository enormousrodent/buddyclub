# Phase 0: Foundations

**Status:** Implemented 2026-10-19 (see "Verified" and "Not verified here" below)  
**Spec reference:** `RALLY_TECHNICAL_SPEC.md` section 14, Phase 0

## Scope

Monorepo, CI, lint/typecheck/test standards, Supabase local setup, platform API skeleton, OpenAPI
generation, migrations pipeline, seed data, permission middleware, correlation ids and baseline
observability. Exit: CI green, migrated DB locally, protected `/v1/me`, generated client.

## Delivered

| Area      | Where                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, Prettier                                                                                |
| ADRs      | `docs/adr/` (001 to 012; 008, 009, 010 remain open by design)                                                                                                                          |
| Contracts | `packages/shared-types` (Zod: `/v1/me`, problem details, roles, health)                                                                                                                |
| Auth      | `packages/auth` (Supabase JWT verification HS256/JWKS, role matrix, test token signer)                                                                                                 |
| Rules     | `packages/rules-schema` (versioned ruleset schemas with safe defaults)                                                                                                                 |
| Engines   | `packages/{rotation-engine,competition-engine,scoring-engine,court-scheduler}` placeholders with purity enforced                                                                       |
| Client    | `packages/api-client` (typed fetch client, problem-aware errors)                                                                                                                       |
| API       | `apps/platform-api`: Fastify 5, Zod, OpenAPI 3.1, correlation ids, RFC 7807 errors, auth plugin, `GET /healthz`, `GET /readyz`, `GET /v1/me`, Swagger UI at `/docs` outside production |
| Database  | `infra/supabase/migrations` (3 migrations), seed, pgTAP RLS test, policy matrix                                                                                                        |
| CI        | `.github/workflows/ci.yml` (lint, format, typecheck, unit/contract tests, OpenAPI drift check, database job with pgTAP and Postgres-backed API tests)                                  |
| Docs      | `README.md`, `docs/api/README.md`, `docs/implementation/phase-0.md`                                                                                                                    |

## Migrations

1. `20261019000100_platform_foundation.sql`: schemas `identity`, `community`, `platform`; helper
   functions; enums; `platform.audit_events` (append-only trigger); `platform.outbox_events`.
2. `20261019000200_identity_and_community.sql`: `identity.user_profiles` (+ `auth.users` trigger),
   `community.organisations`, `community.memberships`, `community.sports`, `identity.participants`,
   `identity.guest_grants`, `community.groups`, `community.group_members`,
   `platform.invitation_links`.
3. `20261019000300_rls_and_grants.sql`: helper predicates, grants, RLS enabled everywhere, SELECT
   policies for authenticated users, no write policies.

## API routes

| Route                         | Auth   | Notes                                                                          |
| ----------------------------- | ------ | ------------------------------------------------------------------------------ |
| `GET /healthz`                | none   | liveness                                                                       |
| `GET /readyz`                 | none   | database ping when configured; 503 when it fails                               |
| `GET /v1/me`                  | bearer | profile (JIT-created if missing), memberships, apps; `Cache-Control: no-store` |
| `GET /docs`, `GET /docs/json` | none   | non-production only                                                            |

## Acceptance tests

- `packages/auth`: signature, issuer, audience, expiry and missing-token rejection; role matrix.
- `apps/platform-api/test`: 401 envelopes with `WWW-Authenticate`; 200 `/v1/me` shape; JIT
  provisioning idempotency; correlation id echo/replace; health/readiness; 404 envelope; OpenAPI
  security declaration; config validation.
- `apps/platform-api/test/me.pg.test.ts` (needs `TEST_DATABASE_URL`): trigger-created profile,
  membership join, idempotent `ensureProfile`, readiness against Postgres.
- `infra/supabase/tests/0001_rls_cross_tenant.sql` (pgTAP): cross-tenant denial, own-profile
  visibility, no write privilege, audit log hidden.
- `tests/unit/architecture.test.ts`: engine packages declare no HTTP/database dependencies.

## Verified in the authoring environment

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (hermetic suites) and
  `pnpm openapi:emit`. Output is recorded in the README.

## Not verified here

- The Supabase CLI and Docker were not available on the authoring machine, so the migrations,
  seed, pgTAP test and Postgres-backed API test have not been executed locally. They run in the CI
  `database` job. Treat the first green run of that job as the real Phase 0 exit.
- The Dockerfile has not been built.

## Rollout and rollback

- Local: `pnpm db:start` applies migrations and seed; `pnpm db:reset` rebuilds from scratch.
- Shared environments: migrations only through the CI pipeline (ADR-012). Reverse steps are
  documented per migration; Phase 0 migrations can be reverted by dropping the three schemas,
  which is acceptable because no production data exists yet.

## Unresolved decisions carried forward

- ADR-008 guest redemption proof (blocks guest view access in Phase 1).
- ADR-009 fixture tie, win-by-two and cap (blocks trusting Phase 3 standings).
- ADR-010 hosting, retention and backups (blocks production).
- ~~JWT signing mode of the real Supabase project~~ Resolved 2026-10-19: project
  `xvkoukolmdpuvftvvcdd` uses ES256 signing keys; the API is configured with `SUPABASE_JWKS_URL`.

## Deferred to Phase 1

- Mobile shells (`apps/buddyclub-mobile`, `apps/rally-mobile`), admin web, live web, UI packages,
  worker implementations, `facilities` schema, finer-grained role grant tables, `Idempotency-Key`
  persistence (no write endpoints exist yet).
