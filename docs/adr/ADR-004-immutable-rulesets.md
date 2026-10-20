# ADR-004: Versioned, immutable rulesets pinned per meet and session

**Status:** Accepted (required by spec)  
**Date:** 2026-10-19

## Decision

Rules (scoring, fixture outcome, standings criteria, progression, rotation weights) are stored as
JSONB validated by `@buddyclub/rules-schema`. Each stored ruleset carries a `schema_version` and a
row `version`; once referenced by a published meet or a started session occurrence it becomes
immutable (`immutable_after_use`). Editing a template produces a new version; existing meets keep
the version they were published with, and standings carry the ruleset version they were computed
under.

Schema defaults never encode an unconfirmed policy: a 21-point game defaults to `winBy: 1` and no
cap, a level fixture defaults to `needs_review`, and unresolved ties stay unresolved (ADR-009).

## Consequences

- Historical standings are reproducible from committed results plus the pinned ruleset.
- The `platform.rulesets` table lands in Phase 2 with its first consumer; the schema package is in
  place now so API contracts and seeds can use it.
