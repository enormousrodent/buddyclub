# Addendum 1.1, step 1: Rally without a club, Rally Home

**Status:** Implemented 2026-10-20 (local development only)  
**Reference:** `docs/product/ADDENDUM-1.1-product-boundary.md` sections 4 to 6; impact plan parts B
and C; ADR-017

## What changed

- **Personal workspaces (ADR-017).** `community.organisations.kind` (`club` | `personal`).
  `POST /v1/me/workspace` returns the caller's personal workspace, creating it on first use with
  the caller as org admin and a participant record. Invitations into a personal workspace are
  refused. `/v1/me` memberships carry `organisationKind`; Buddy Club's home and the competitions
  page ignore personal workspaces.
- **Owner scope on series.** `activities.session_series.owner_scope`
  (`personal` | `organisation` | `buddy_group`) and nullable `buddy_group_id`, set on creation
  from the workspace kind or the group, backfilled for existing rows.
- **Presets.** `GET /v1/me/presets` lists the series the caller can run across clubs and
  workspace with venue, courts, round length, last start and any occurrence already open.
  `POST /v1/sessions/:seriesId/start` creates an occurrence now and opens check-in in one call.
- **Live summary.** `GET /v1/me/sessions` items gain `live` (round, status, server timer, courts
  in play, players here) for open and live sessions, feeding the resume hero.
- **Player competitions.** `GET /v1/me/competitions`: the caller's teams, upcoming and live meets
  across clubs, and their own fixtures and rubbers.
- **Web.** Rally tabs are now Home, Sessions, Competitions, Profile. Rally Home: resume hero with
  round, countdown and courts in play; Start a session; presets strip with one-tap start; join by
  code (routes to the QR landing page); upcoming; competitions entry; recent; empty states.
  `/start` offers "Just me" which creates the personal workspace, alongside any clubs. The
  competitions page opens with the player's own fixtures. Buddy Club home lists clubs only.

## Migration 9

`20261020000900_addendum_personal_workspaces.sql`: additive columns and enums with backfill; see
`infra/supabase/migrations/README.md` for the reverse steps.

## Verification (2026-10-20)

- Postgres: `test/addendum1.pg.test.ts` (3 steps, 16 s): a brand-new account has nothing; the
  workspace is created once and hidden as `personal`, invitations refused; a pickleball preset is
  created with a venue, started with one tap (occurrence open), eight walk-ins checked in, round
  1 committed with two courts and started; `me/sessions` reports the live round; `me/competitions`
  is empty. Earlier suites unchanged.
- Hermetic: 28 API tests pass (contract test updated for `organisationKind`).
- Web: typecheck, lint, Prettier and `next build` green.

## Criteria touched

Addendum criteria 1 (except Apple/Google sign-in, step 2), 5, 6 and 9.
