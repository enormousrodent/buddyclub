# ADR-002: Single modular-monolith API for privileged writes

**Status:** Accepted (Phase 0)  
**Date:** 2026-10-19

## Context

Match, score, rotation, progression and court allocation changes need transactional invariants
(spec sections 5.2, 12). Letting clients write to Supabase tables directly would scatter those
invariants across RLS policies and client code.

## Decision

- `apps/platform-api` is the only component allowed to mutate business tables. It connects with a
  server-side credential that bypasses RLS and enforces authorisation in code.
- The API is organised as modules under `src/modules/<context>` (identity now; community,
  activities, competition, matches, facilities later). Modules own their routes, services and
  repositories. Cross-module access goes through exported services, not shared SQL.
- Pure rules engines (`packages/*-engine`, `packages/rules-schema`) contain no HTTP or database
  code; the API orchestrates transactions around them (spec section 4). ESLint and
  `tests/unit/architecture.test.ts` enforce this.
- Every state-changing handler follows the fixed sequence: authenticate, authorise, parse, load
  aggregate version, lock rows, validate invariants, mutate, audit, outbox, commit, respond.

## Consequences

- One deployable for all write traffic; horizontal scaling is stateless because state is in
  Postgres.
- Clients may still read authorised projections directly from Supabase (ADR-011) for realtime.
- If a module later needs independent scaling, its boundary is already explicit.
