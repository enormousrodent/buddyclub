# ADR-005: Fixture/match model separated from court scheduling

**Status:** Accepted (required by spec)  
**Date:** 2026-10-19

## Decision

What is played (fixtures, rubbers, matches, lineups, results) is modelled independently of where
and when it is played (court pools, court bookings). A match may exist unscheduled; a court
booking references a match and owns physical occupancy. Court pools are attached to a meet or
session occurrence, so "division 3 uses courts 5 and 6" is a per-meet fact (spec section 9.4).

Concurrency invariants (one active match per court, one active match per participant) are enforced
in the database with partial unique indexes and row locks, not only in the scheduler.

## Consequences

- Fixture generation can run per division in parallel; court allocation runs venue-wide.
- Manual court overrides are explicit, audited commands rather than edits to the match.
- Tables arrive in Phase 2 (occurrence courts) and Phase 3 (meet court pools).
