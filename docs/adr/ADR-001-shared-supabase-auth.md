# ADR-001: Shared Supabase Auth project and per-app sessions

**Status:** Accepted (Phase 0)  
**Date:** 2026-10-19

## Context

Spec section 1 requires one account to work in both Buddy Club and Rally. Spec section 3 says apps may
keep separate local sessions but must not share refresh-token storage. Supabase Auth supports email,
Apple and Google sign-in and issues JWTs the API can verify offline.

## Decision

1. **One Supabase project, one Auth issuer** for every product. Both mobile apps and the admin web
   app are configured with the same project URL and **publishable key** (`sb_publishable_...`). Legacy `anon` and
   `service_role` JWT keys are not used anywhere; the publishable/secret key flow is the baseline. There is no second identity store.
2. **The API verifies every access token itself** (`packages/auth`): signature, `iss`
   (`${SUPABASE_URL}/auth/v1`), `aud` (`authenticated`) and expiry. HS256 with the project JWT
   secret is supported for local development and legacy projects; a JWKS URL is supported for
   asymmetric signing keys and is the preferred production mode. The API never trusts a user id
   sent in a request body or inferred from which app is calling.
3. **Business roles live in the database**, not in the token. `community.memberships` (and later
   finer-grained grant tables) are the source of truth; `app_metadata` claims are never used for
   authorisation decisions.
4. **Profiles are created just-in-time** by a trigger on `auth.users` insert, with a race-safe
   fallback in the API's `GET /v1/me`, so a user who signs up in Buddy Club has a profile the
   moment they open Rally.
5. **Sessions are per app.** Each app stores its own refresh token in the platform's secure storage
   (Keychain / Keystore / httpOnly cookie for web). Signing out of one app does not sign out the
   other. Deep links use PKCE and an allowlist (`infra/supabase/config.toml`,
   `additional_redirect_urls`).
6. **Service credentials stay server-side.** The secret key (`sb_secret_...`, only needed for Auth
   admin calls) and the direct Postgres URL are
   only ever present in the API and workers.

## Consequences

- A single `auth.users` row is the join point for everything; account deletion sets
  `user_profiles.auth_user_id` to null rather than deleting history (spec section 11).
- Token verification is a pure function of configuration, so contract tests run with a locally
  minted HS256 token and no network.
- JWKS rotation requires the API to cache keys; `jose`'s remote JWKS handles this. A production
  rollout must confirm which signing mode the project uses and set either `SUPABASE_JWT_SECRET`
  or `SUPABASE_JWKS_URL` accordingly.
- Guests (ADR-003, ADR-008) are not Supabase users. Their scoped credentials are issued and
  verified by the platform API, never by Supabase Auth.
