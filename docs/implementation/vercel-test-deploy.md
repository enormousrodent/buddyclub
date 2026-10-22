# Vercel test deployment (2026-10-20)

**Status:** live on the owner's personal Vercel scope with `.vercel.app` domains; custom domains,
git integration and CI-driven deploys are not set up yet.  
**Reference:** ADR-010, ADR-012, ADR-013; README "Deploying to Vercel"

## What is deployed

| Project         | URLs                                                                                          | Built how                                                                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddyclub-api` | https://buddyclub-api.vercel.app                                                              | Locally: `vercel build --prod` then `vercel deploy --prebuilt --prod` from `apps/platform-api`. One Node function in `dub1` from a self-contained CommonJS bundle (`dist/vercel.cjs`, 4 MB, no `node_modules`).                                      |
| `buddyclub-web` | https://buddyclub-web.vercel.app (Buddy Club), https://rally-buddyclub-web.vercel.app (Rally) | On Vercel: `vercel deploy --prod --local-config <file>` from the repo root, where the file holds `{"builds":[{"src":"apps/web/package.json","use":"@vercel/next"}]}`. Vercel installs the pnpm workspace and runs `next build` in `apps/web` (54 s). |

Both projects point at the same Supabase development project as local development. The API uses
the transaction pooler (port 6543). Since Addendum 1.4 the web app serves Rally on
every host (`WEB_PRODUCT=rally`, the default); the earlier two-host split needs `WEB_PRODUCT=host`
with `RALLY_HOST_PREFIX=rally-`. Cookies are per host (no `COOKIE_DOMAIN`) until real domains exist.

## First measurements (curl from the UK, 2026-10-20)

| Request                                             | Cold   | Warm        |
| --------------------------------------------------- | ------ | ----------- |
| API `GET /healthz`                                  | 1.07 s | 0.24–0.29 s |
| API `GET /v1/public/discover` (Postgres via pooler) | 0.49 s | 0.11 s      |
| Web `/` Buddy Club home (server-renders, calls API) | 0.99 s | 0.37 s      |
| Web `/` Rally home                                  | 0.44 s | 0.36 s      |
| Web `/sign-in`                                      |        | 0.27 s      |

Nothing is cached at the CDN yet (`X-Vercel-Cache: MISS`); every page is server-rendered on
demand. The API function's first request includes building the Fastify instance; later requests
reuse it (Fluid Compute).

## What we learned (and changed)

1. **The API function must be self-contained.** Vercel's file tracer could not package pnpm's
   symlinked `node_modules` from a Windows `vercel build`; the first deploy failed with
   `FUNCTION_INVOCATION_FAILED` because no dependency was uploaded. `tsup` now emits
   `dist/vercel.cjs` with every dependency inlined (`pg-native` and `@fastify/swagger-ui` stay
   external; swagger-ui is loaded lazily and only outside production). `api/index.js` re-exports
   the bundle. The long-running `dist/server.js` is unchanged.
2. **Prebuilt web output from Windows cannot be deployed.** Next's Build Output uses symlinks
   between function folders and relies on the tracer for `node_modules`; both broke from Windows.
   The web app is built on Vercel instead. Once the project's Root Directory is set to `apps/web`
   in the dashboard, the `builds` local config is unnecessary and `vercel deploy --prod` from the
   root (or the git integration) works as documented in ADR-012.
3. **`turbopack.root` is the monorepo root** (`apps/web/next.config.ts`), otherwise Next cannot
   resolve its own package through pnpm's layout when a builder runs it from `apps/web`.
4. **The manifest route is outside the proxy matcher**, so it now reads the product from the
   request host; before this the Rally host served Buddy Club's manifest.
5. **Never run two `vercel` commands in parallel** from one shell: the CLI resolves the linked
   project from the working directory and a race deployed the API bundle twice.
6. **`.vercelignore`** keeps `.env` files, build output and `node_modules` out of source uploads.

## Still to do before anyone else uses it

- Supabase Authentication > URL configuration: add `https://buddyclub-web.vercel.app/auth/callback`
  to the redirect allowlist (owner's dashboard; magic links otherwise return to the site URL).
  The `rally-buddyclub-web` host is no longer needed (one product since Addendum 1.4): remove
  that domain from the project, or leave it, since it now serves the same app.
- Set Root Directory `apps/web` on the `buddyclub-web` project and connect the GitHub repository
  so pushes deploy; move migrations to CI (ADR-012).
- The custom domain (the owner's Buddy Club domain) on `buddyclub-web`; `COOKIE_DOMAIN` stays
  empty with one host. `RALLY_HOST_PREFIX` and `WEB_PRODUCT` need no setting.
- A separate Supabase project for the deployed environment before real data.
