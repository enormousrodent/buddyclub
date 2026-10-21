# Buddy Club platform

Monorepo for the Buddy Club baseline (shared identity, organisations, groups, participants) and the
Rally sub-product (social sessions, divisional leagues, tournaments). The build specification is
[RALLY_TECHNICAL_SPEC.md](RALLY_TECHNICAL_SPEC.md); implementation proceeds phase by phase under
[docs/implementation/](docs/implementation/). Phase 0 (foundations) is in place.

## Where things stand

| Phase                                                                                                                | Status               |
| -------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 0 Foundations                                                                                                        | done                 |
| 1 Clubs, members, guests, venues                                                                                     | done                 |
| 2 Social sessions and rotations (with realtime, ADR-014)                                                             | done                 |
| 3 Divisional league: fixtures, courts, results, standings, progression                                               | done (POC UI)        |
| 4 Tournaments, public boards, QR join, disputes, CSV, concurrency tests                                              | done (POC UI)        |
| Design pass: Paper & Path system, brand marks, restyled web screens (ADR-015)                                        | done (first version) |
| Addendum 1.1 step 1: Rally without a club (personal workspaces), Rally Home, presets, join by code (ADR-017)         | done                 |
| Addendum 1.1 step 3: interests, public groups, gatherings with RSVP, Buddy Club discovery home, Rally link (ADR-018) | done                 |

Details and verification records per phase live in `docs/implementation/`.

## Layout

```text
apps/platform-api          Fastify API: the only write surface (ADR-002)
packages/shared-types      Zod contracts shared by API, client and apps
packages/auth              Supabase JWT verification, role matrix, test token signer
packages/rules-schema      Versioned ruleset schemas (pure)
packages/api-client        Typed fetch client
packages/*-engine, court-scheduler   Pure rules engines (placeholders until their phase)
infra/supabase             Local Supabase config, migrations, seed, pgTAP tests, policy matrix
workers/*                  Outbox consumers (placeholders until Phase 2)
tests/                     Cross-package tests (architecture rules now; contract/e2e later)
docs/adr                   Architectural decision records
```

## Prerequisites

- Node 22 and pnpm 10 (`corepack enable`)
- Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/cli) for the local database
  (everything except `pnpm db:*` and `pnpm test:db` works without them)

## Quick start (cloud Supabase project)

Development currently targets the cloud project `xvkoukolmdpuvftvvcdd`
(`https://xvkoukolmdpuvftvvcdd.supabase.co`), which already has the three Phase 0 migrations
applied. It signs access tokens with ES256 and publishes its keys at
`/auth/v1/.well-known/jwks.json`, so the API verifies tokens without any shared secret.

```sh
pnpm install

# API config: apps/platform-api/.env is gitignored. Start from the example and set DATABASE_URL
# from the dashboard (Project Settings > Database > Connection string). Never commit it.
cp .env.example apps/platform-api/.env

pnpm --filter @buddyclub/platform-api dev  # http://127.0.0.1:4000, Swagger UI at /docs
```

Working with the cloud schema uses the bundled Supabase CLI (one-time `pnpm exec supabase login`
with a personal access token, then `pnpm db:link`):

| Command                    | What it does                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm db:link`             | Links this checkout to the cloud project                                                 |
| `pnpm db:cloud:migrations` | Shows which migrations are applied remotely vs present locally                           |
| `pnpm db:cloud:push`       | Pushes pending migrations to the cloud project (`pnpm db:cloud:push:dry` previews first) |
| `pnpm db:cloud:types`      | Generates TypeScript types from the remote schema                                        |

The Phase 0 migrations were applied to the cloud project through the SQL editor, so the CLI's
`supabase_migrations.schema_migrations` history is empty there. Before the first
`supabase db push`, mark them as applied once so they are not re-run:

```sh
pnpm exec supabase --workdir infra migration repair --linked --status applied 20261019000100 20261019000200 20261019000300
```

The demo seed (`infra/supabase/seed`) is for the local stack only. On the cloud project, create
users through Supabase Auth (dashboard or an app sign-up); the `auth.users` trigger creates their
profile, and organisations/memberships are added through the API from Phase 1.

## Web app (apps/web)

One Next.js codebase serves both products by hostname (ADR-013): Buddy Club on the main host,
Rally on the `rally.` subdomain. Mobile-first and installable as a PWA. Look and feel follow the
design system in `docs/design/README.md` (tokens in `docs/design/tokens.json`, ADR-015): shared
components live in `apps/web/components`; the accent, icons and manifest are chosen per product by
hostname.

```sh
cp apps/web/.env.example apps/web/.env.local   # set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)
pnpm --filter @buddyclub/platform-api dev      # API on http://127.0.0.1:4000 (set CORS_ORIGINS=http://localhost:3000 for guest pages)
pnpm --filter @buddyclub/web dev               # http://localhost:3000 (Buddy Club), http://rally.localhost:3000 (Rally)
```

Phase 1 screens: sign in / magic link / create account, profile, clubs (create, rename), members
(roles, invitation links), players (walk-in guests, guest links, archive), groups, venues and
courts, invitation acceptance, guest view. Supabase Auth needs the web origin(s) in its redirect
allowlist (`/auth/callback`).

## Quick start (local Supabase, optional)

```sh
pnpm db:start             # applies infra/supabase/migrations and seed (needs Docker)
pnpm db:status            # prints local URLs, API keys and JWT secret
# then use Option B values from .env.example in apps/platform-api/.env
```

Without a database the API still starts and serves `/v1/me` from an in-memory repository
(profiles reset on restart). It refuses to start that way in production.

### Calling `/v1/me` locally

Sign in through Supabase Auth to get an access token (seeded local accounts:
`organiser@example.com`, `player@example.com`, `other-admin@example.com`, password `password123`):

```sh
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: <publishable key from pnpm db:status>" -H "content-type: application/json" \
  -d '{"email":"organiser@example.com","password":"password123"}' | jq -r .access_token
```

```sh
curl -s http://127.0.0.1:4000/v1/me -H "authorization: Bearer <access_token>" | jq
```

## Deploying to Vercel (ADR-010, ADR-012, ADR-013)

A test deployment has been live since 2026-10-20 on `.vercel.app` domains
(`docs/implementation/vercel-test-deploy.md` has the measurements and lessons):

| Project         | URLs                                                                                          | Deploy from         | Command                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddyclub-api` | https://buddyclub-api.vercel.app                                                              | `apps/platform-api` | `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod`                                      |
| `buddyclub-web` | https://buddyclub-web.vercel.app (Buddy Club), https://rally-buddyclub-web.vercel.app (Rally) | repository root     | `vercel deploy --prod --local-config vercel-web.json` where the file is `{"builds":[{"src":"apps/web/package.json","use":"@vercel/next"}]}` |

The API ships as one self-contained bundle (`dist/vercel.cjs`, built by tsup) because Vercel's
tracer cannot follow pnpm's symlinked `node_modules` from a Windows machine. The web app is built
on Vercel for the same reason; once the project's Root Directory is `apps/web` the `builds`
config and `--local-config` go away. Run one `vercel` command at a time: the CLI picks the linked
project from the working directory. `.vercelignore` keeps `.env` files out of uploads.

Environment variables per project (Vercel dashboard or `vercel env add`):

| Project         | Env vars                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddyclub-api` | `NODE_ENV=production`, `LOG_LEVEL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE`, `DATABASE_URL` (transaction pooler, port 6543), `GUEST_TOKEN_SECRET` (32+ random chars), `CORS_ORIGINS` (the web origins), `PUBLIC_WEB_URL`                                                                                                                               |
| `buddyclub-web` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `API_URL` and `NEXT_PUBLIC_API_URL` (the API URL), `RALLY_HOST_PREFIX` (`rally-` on vercel.app, `rally.` with real domains), `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Google sign-in button; unset hides it), and with real domains `COOKIE_DOMAIN=.buddy-club.com`, `NEXT_PUBLIC_COOKIE_DOMAIN=.buddy-club.com` |

Domains (later): `buddy-club.com` and `rally.buddy-club.com` both point at the web project;
`api.buddy-club.com` at the API project. In Supabase (Authentication > URL configuration) set the
site URL to the web origin and add each web origin's `/auth/callback` (today
`https://buddyclub-web.vercel.app/auth/callback` and
`https://rally-buddyclub-web.vercel.app/auth/callback`) to the redirect allowlist, plus the Vercel
preview pattern `https://*.vercel.app/auth/callback` if previews should sign in.

## Demo content (try every screen with realistic data)

```sh
# Seeds a club for YOUR account: 20 players, sessions in every state (upcoming, open with
# walk-ins, live with a round in progress, completed, cancelled), a league meet mid-way and a
# pools-into-knockout tournament, plus Buddy Club content: a badminton group whose club nights are
# run by Rally and five groups with no sport (book club, dog walkers, toddler mornings, board
# games, running) with gatherings and people going. Public boards and QR join codes are on.
DEMO_ALLOW_CLOUD=1 pnpm --filter @buddyclub/platform-api demo -- --email you@example.com --reset
```

The script prints the links to open. `--reset` rebuilds the demo club from scratch; the
`DEMO_ALLOW_CLOUD` guard exists because it writes to whatever `DATABASE_URL` points at.
Never run it against a shared or production project.

## Checks

| Command                                       | What it does                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm lint`                                   | ESLint (includes the engine-purity import rules)                        |
| `pnpm format:check`                           | Prettier                                                                |
| `pnpm typecheck`                              | `tsc --noEmit` in every package                                         |
| `pnpm test`                                   | Hermetic unit and contract tests (no database needed)                   |
| `pnpm test:db`                                | Postgres-backed API tests; needs `TEST_DATABASE_URL`                    |
| `pnpm db:test`                                | pgTAP policy tests against the running local database                   |
| `pnpm openapi:emit`                           | Regenerates `docs/api/openapi.json` (CI fails on drift)                 |
| `pnpm build`                                  | Bundles the API to `apps/platform-api/dist`                             |
| `pnpm --filter @buddyclub/platform-api smoke` | Starts the bundle and checks `/healthz`, 401 and authenticated `/v1/me` |

CI runs all of the above (`.github/workflows/ci.yml`); the `database` job boots Supabase in GitHub
Actions, runs migrations, seed, pgTAP and the Postgres-backed tests.

## Phase 0 verification record (2026-10-19, Windows, Node 22.22, pnpm 10.33)

```text
pnpm typecheck   10/10 tasks successful
pnpm lint        exit 0
pnpm test        51 tests passed across 7 packages
                 auth 14, platform-api 20, rules-schema 6, api-client 3, shared-types 3, tests 5
pnpm build       dist/server.js bundled; smoke run: /healthz 200, /v1/me 401 then 200, /v1/nope 404
```

The Supabase CLI and Docker were not installed on the authoring machine, so migrations, seed,
pgTAP and `pnpm test:db` have not been executed locally yet; they run in the CI `database` job.

## Conventions

- UTC timestamps, UUID ids, Zod at the API boundary, integer/decimal scores.
- Every error is an `application/problem+json` document with a stable `code` and `correlationId`.
- Mutating endpoints accept `Idempotency-Key` and `If-Match` (from Phase 1).
- Engines are pure. Migrations are append-only. Secrets are never committed; `.env.example` holds
  local defaults only.
- Open product decisions are tracked as ADRs (008, 009, 010) and surfaced as `needs_review` /
  `UNRESOLVED_TIE` behaviour rather than guessed.

## Next

Phase 1 (shared identity and guest participants) per `RALLY_TECHNICAL_SPEC.md` section 14, starting
with `docs/implementation/phase-1.md` and a decision on ADR-008 before guest view access ships.
