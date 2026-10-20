# ADR-006: Transactional outbox and realtime read projections

**Status:** Accepted (Phase 0)  
**Date:** 2026-10-19

## Decision

- Side effects (push, email, projection rebuilds) are never performed inside a request. The
  handler inserts a `platform.outbox_events` row in the same transaction as the state change.
  Workers (`workers/*`, scheduled through Trigger.dev or an equivalent runner) drain the outbox
  with idempotent handlers, exponential backoff and a dead-letter status. `dedupe_key` prevents
  duplicate notifications across retries.
- Realtime to clients uses Supabase Realtime on narrow, RLS-protected projection tables containing
  identifiers, revisions and safe display fields only. Clients treat a realtime message as a hint
  to refetch from the API, never as the authoritative payload.
- Timer authority stays on the server (`started_at`, `duration_seconds`, `paused_total_seconds`,
  `version`); clients compute remaining time from a time-sync offset.

## Consequences

- `platform.outbox_events` and `platform.audit_events` exist from migration 1 so every later
  module can use them.
- Worker packages are placeholders in Phase 0; the first real consumer is Phase 2 push for
  confirmed court assignments.
