# ADR-012: API deployment shape and migration pipeline

**Status:** Accepted 2026-10-19 (Vercel); container image kept as a portable fallback  
**Date:** 2026-10-19

## Decision

- **Runtime:** the Fastify API runs as a Vercel Function (Node 22, Fluid Compute) from
  `apps/platform-api`. The Fastify instance is built once per function instance and reused across
  invocations; `api/index.ts` adapts Vercel's request/response to Fastify. Region `dub1`.
- **Database connections:** serverless instances must not hold many connections, so the API uses
  the Supavisor transaction pooler (port 6543) with a small `pg` pool per instance. Kysely does not
  use named prepared statements, which the transaction pooler cannot support. Statement timeouts
  stay on.
- **Configuration:** all settings come from environment variables validated by `src/config.ts`.
  Production refuses to start without `DATABASE_URL`. `trustProxy` is on so client IPs for rate
  limiting come from Vercel's forwarded headers.
- **Health:** `GET /healthz` (liveness) and `GET /readyz` (database ping) remain for monitoring and
  for the container fallback.
- **Container fallback:** `apps/platform-api/Dockerfile` is kept so the same code can run on any
  OCI host if Vercel limits (execution time, connection behaviour) become a problem for long
  operations such as large fixture generation.
- **Environments:** Vercel preview deployments per pull request (pointing at the same Supabase
  project for now; a separate staging project is recommended before real league data),
  production on `main`.
- **Migrations:** applied by GitHub Actions with `supabase db push --linked` on merge to `main`,
  using a CI-scoped Supabase access token. Developers do not push to shared projects from their
  machines once CI owns it. Every migration is reviewed with its reverse steps documented in
  `infra/supabase/migrations/README.md`.
- **Observability baseline:** structured pino logs with `correlationId`, authorization and cookie
  headers redacted; Vercel log drains or a provider chosen later.

## Status update (2026-10-20)

First test deployment is live (`docs/implementation/vercel-test-deploy.md`). Two amendments:

- **Self-contained function bundle.** Vercel's file tracer could not package pnpm's symlinked
  `node_modules` from a Windows `vercel build`, so `tsup` now inlines every dependency into
  `dist/vercel.cjs` (CommonJS, `pg-native` and `@fastify/swagger-ui` external; swagger-ui is
  imported lazily and only outside production). `api/index.js` re-exports it. This also makes the
  function independent of how the repository is installed.
- **Project runtime is Node 24** (Vercel's default for new projects); the bundle targets Node 22
  syntax and runs on both. Migrations are still applied by hand to the development project; the CI
  pipeline described below is not wired yet.

## Consequences

- Long-running or scheduled work (outbox drain, recurring session generation) does not belong in
  request functions; it runs as Vercel Cron-triggered functions or an external worker (ADR-006).
- Realtime push stays with Supabase Realtime; the API never holds websocket connections.
