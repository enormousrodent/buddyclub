# ADR-011: Row level security and read-model strategy

**Status:** Accepted (Phase 0)  
**Date:** 2026-10-19

## Context

The spec requires RLS on accessible tables even though writes go through the API, separate
service privileges from end-user reads, and server-filtered projections for public and guest views
(spec sections 5.3, 11).

## Decision

**Three access tiers.**

| Tier                                       | Credential                                | Access                                                   |
| ------------------------------------------ | ----------------------------------------- | -------------------------------------------------------- |
| Service (API, workers)                     | Direct Postgres connection / service role | Bypasses RLS; all writes; authorisation enforced in code |
| Registered user (apps via Supabase client) | User JWT through PostgREST/Realtime       | SELECT only, filtered by RLS; no write policies exist    |
| Anonymous / guest                          | None at the database                      | No grants at all; served by API read models              |

**RLS rules.**

- Every table in `identity`, `community` and `platform` has RLS enabled in the migration that
  creates it or in that phase's RLS migration. Tables without policies are therefore denied.
- `anon` has no grants on platform schemas. `authenticated` gets SELECT only on the tables listed
  in `infra/supabase/policies/README.md`.
- Policies use SECURITY DEFINER helper predicates (`community.is_org_member`,
  `community.has_org_role`) so membership lookups do not recurse through RLS.
- Policies are tested with pgTAP (`infra/supabase/tests`), including cross-tenant denial and the
  absence of write privileges.

**Read models.**

- Personal and guest views (`my-schedule`, court boards, public event boards) are API endpoints that
  return redacted projections. They never expose broad tables to guests or the public.
- Realtime subscriptions are limited to small projection tables designed for it, carrying ids,
  revisions and safe display fields. Clients refetch from the API on any change.
- In production the API should connect with a dedicated role that has `BYPASSRLS` and only the
  privileges it needs, rather than the `postgres` superuser-like role used locally. This is part of
  the ADR-012 rollout checklist.

## Consequences

- Adding a table means adding an RLS decision and a pgTAP test in the same change.
- Guest access cannot be implemented by widening policies; it must be an API read model (ADR-008).
