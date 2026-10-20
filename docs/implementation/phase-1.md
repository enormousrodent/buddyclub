# Phase 1: Shared identity, clubs and guest participants

**Status:** Approved 2026-10-19; backend and web app implemented the same day (see progress log); pilot deployment pending  
**Spec reference:** `RALLY_TECHNICAL_SPEC.md` section 14, Phase 1; ADR-003, ADR-008, ADR-011, ADR-013

## Goal

A real person can sign in on the web, create a club, invite members with roles, add walk-in guests
by name only, set up a venue with courts, and see only their own club's data. A guest can open a
personal link and see only what they were granted. All of it through the API, audited, with
cross-club isolation proven by tests.

## Scope

### Backend (API + migrations)

| Area              | Endpoints                                                                                                                                                        | Notes                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Organisations     | `POST /v1/organisations`, `GET /v1/organisations/:id`, `PATCH /v1/organisations/:id`                                                                             | Creator becomes `org_admin`; slug uniqueness; audit event                             |
| Members           | `GET /v1/organisations/:id/members`, `PATCH /v1/organisations/:id/members/:profileId` (role/status), `DELETE` (leave)                                            | Last `org_admin` cannot be removed                                                    |
| Invitations       | `POST /v1/organisations/:id/invitations` (role, expiry, max uses), `GET /v1/invitations/:token/preview`, `POST /v1/invitations/:token/redeem`, `DELETE` (revoke) | Hashed tokens (`platform.invitation_links`); redeem is idempotent per account         |
| Participants      | `POST /v1/organisations/:id/participants` (guest or linked), `GET` list with archived filter, `PATCH`, `POST .../archive`                                        | Guest = display name only (acceptance a, b)                                           |
| Groups            | `POST /v1/organisations/:id/groups`, `GET`, `PATCH`, members add/remove                                                                                          | Allows guests and registered                                                          |
| Venues and courts | `POST /v1/organisations/:id/venues`, `GET`, `PATCH`; `POST /v1/venues/:id/courts`, `PATCH`, deactivate                                                           | New `facilities` schema; IANA timezone validated                                      |
| Guest access      | `POST /v1/participants/:id/guest-grants` (organiser issues link), `POST /v1/guest-access/redeem`, `GET /v1/guest/me`                                             | Scoped guest credential issued by the API, not Supabase                               |
| Guest claim       | `POST /v1/participants/:id/claim-intents`, `POST /v1/participants/:id/confirm-claim`                                                                             | Blocked until ADR-008 is decided; endpoints return 501 with a problem code until then |
| Me                | `GET /v1/me` gains `participants` (one per org)                                                                                                                  |                                                                                       |

Cross-cutting: `Idempotency-Key` persistence (`platform.idempotency_keys`), `If-Match` on
organisation/venue updates (`version` column), audit events for every privileged change,
rate limits on invitation and guest redeem endpoints.

### Migrations

1. `facilities` schema: `venues` (organisation, name, timezone, address_json, version), `courts`
   (venue, code, sport_ids, zone, active; unique per venue). RLS: members of the org can read.
2. `platform.idempotency_keys` (key, actor, request hash, response status/body, expires_at).
3. `version integer not null default 1` on `community.organisations`.
4. `community.memberships` partial unique index guaranteeing at least one admin is enforced in the
   service layer (SQL cannot express "at least one"); test covers it.

### Web app (`apps/web`, ADR-013)

Mobile-first Next.js app with PWA manifest, Supabase auth via the publishable key, session cookie
on the parent domain, hostname-based route groups for Buddy Club and Rally.

Phase 1 screens (both hosts share the shell):

- Sign in / sign up / magic link; profile (display name, avatar).
- Clubs: list, create, settings; members with roles; invitation link generation and QR.
- Roster: participants with "add guest" (name only); archive; link guest (disabled until ADR-008).
- Groups: create, add members.
- Venues: create venue, add courts.
- Guest landing page: opens a guest link and shows the scoped view (`GET /v1/guest/me`).
- Rally host: placeholder home that reads memberships and shows "no competitions yet", so the
  hostname routing and shared session are proven before Phase 2 fills it.

### Deployment for testing

- Web app to Vercel with a preview URL now; custom domains when DNS is ready.
- API container to the provider chosen in ADR-010, with secrets injected there; CORS origins set
  to the web hosts; Supabase redirect allowlist updated for the web hosts.

## Acceptance tests

- Unit: slug normalisation, invitation token hashing, role transitions, last-admin rule, timezone
  validation, idempotency replay returns the stored response.
- Contract (hermetic): every endpoint's 401/403/404/409 envelopes; `If-Match` stale version 409.
- Postgres-backed: member of club A cannot read club B via API or via RLS (pgTAP); guest grant
  redeem returns only the granted participant; revoked and expired links fail; invitation replay
  is idempotent for the same account and rejected for a second account when `max_uses` is 1.
- End to end (Playwright, against preview deployment): sign up, create club, invite a second
  browser context, accept, add guest, open guest link in a third context and see only the guest view.

## Exit criteria (spec)

Same account authenticates in both hosts; guest added without login and can view only their
authorised assignment; cross-tenant negative tests pass.

## Rollout and rollback

Migrations pushed with `pnpm db:cloud:push` after review; each has reverse steps documented.
Feature flag `GUEST_CLAIM_ENABLED=false` keeps claim endpoints dark until ADR-008.

## Progress log

- 2026-10-19: migration 4 applied to the cloud project; organisations, members, invitations,
  participants, guest links, groups, venues and courts endpoints implemented with audit events,
  idempotency keys and If-Match; 17 Postgres-backed tests pass against the cloud project; Vercel
  function entry added (`api/index.js` -> `dist/vercel.js`). Claim endpoints return 501 (ADR-008).
- 2026-10-19 (later): `apps/web` Next.js 16 PWA built: hostname proxy (Buddy Club / Rally), Supabase
  auth (password, magic link, sign-up) with parent-domain cookie option, profile, clubs, members
  and invitation links, players and guest links, groups, venues and courts, invitation acceptance,
  guest view. `next build` succeeds; smoke-tested on both hostnames.

## UI status

The Phase 1 screens are a proof of concept to exercise the API; the owner has said they are not
the intended look. A design pass (brand, type, colour, component approach, mobile navigation) is
planned before the UI is built out properly. New screens until then stay minimal.

## Decisions needed before or during Phase 1

| Decision                      | Needed for                              | Proposal                                                                                             |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ADR-008 guest claim proof     | Linking a guest to an account           | Organiser-approved one-time link or 6-digit PIN shown to the organiser; both logged with consent     |
| ADR-010 API host              | Testers reaching the API                | Fly.io, region `lhr` or `ams`, near the `eu-west-1` database                                         |
| Domains                       | Cookie domain, CORS, Supabase redirects | `buddy-club.com` and `rally.buddy-club.com` as stated by the owner; confirm ownership and DNS access |
| Sign-in methods for the pilot | Auth config                             | Email + password and magic link now; Google/Apple when the apps go native                            |
