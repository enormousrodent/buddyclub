# ADR-017: Rally personal workspaces and session owner scope

**Status:** Accepted 2026-10-20 (Addendum 1.1, step 1)  
**Date:** 2026-10-20

## Context

Addendum 1.1 requires Rally to work with no Buddy Club club, group or membership: a new user
signs in and starts a session straight away. Today every session series and occurrence belongs
to an organisation (`activities.session_series.organisation_id not null`), and every permission,
RLS policy and read model is keyed by that organisation. The addendum also asks for an explicit
`owner_scope` on Rally events and an optional link to a Buddy Club group, and forbids renames or
destructive migrations.

## Decision

1. **A personal workspace is an organisation of kind `personal`.** `community.organisations`
   gains `kind` (`club` | `personal`, default `club`). `POST /v1/me/workspace` returns the
   caller's personal workspace, creating it on first use (slug `me-<id prefix>`, the caller as
   `org_admin`, a participant record as usual). Every existing endpoint, policy, read model and
   test keeps working because a workspace _is_ an organisation.
2. **Hidden from Buddy Club.** Personal workspaces never appear as clubs: `/v1/me` marks the
   membership with `organisationKind`, the Buddy Club home filters them out, and nobody can be
   invited into one (`members.invite` is refused for kind `personal`).
3. **Owner scope on series.** `activities.session_series` gains `owner_scope`
   (`personal` | `organisation` | `buddy_group`, default `organisation`) and nullable
   `buddy_group_id` referencing `community.groups`. Creating a series in a personal workspace sets
   `personal`; passing `groupId` sets `buddy_group`. Both columns are additive and backfilled by
   their defaults.
4. **Presets are series.** A session series already carries sport, venue, round length and rules;
   `GET /v1/me/presets` lists the series the caller can run across every organisation and
   workspace, and the Rally home starts one with a single tap (new occurrence now, opened for
   check-in).

## Consequences

- Migration 9 is additive: two columns on organisations and series, one enum each. Reverse: drop
  the columns and types.
- A Rally-only user's data lives in their own organisation row. If they later join or create a
  Buddy Club club, nothing moves; the workspace stays as their private place to run sessions.
- The addendum's cross-app linkage (`buddy_activity_id` ↔ `rally_occurrence_id`) is not part of
  this ADR; it arrives with the general activity model (step 3 of the impact plan).
