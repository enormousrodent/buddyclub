# ADR-003: Participants independent of account identities

**Status:** Accepted (required by spec)  
**Date:** 2026-10-19

## Decision

`identity.participants` is the entity that plays, is scheduled and appears in results. It is scoped
to an organisation and has an optional `user_profile_id`. Guests are participants with no profile.
Linking a participant to an account only ever sets `user_profile_id` after a verified claim
(ADR-008); it never rewrites historical references, and participants are never merged by display
name.

A registered account has at most one participant per organisation (partial unique index), but may
have participants in many organisations.

## Consequences

- Walk-ins can be added with a name only and immediately scheduled (acceptance criteria a, b).
- Match lineups, session entries and rosters reference participants, so account deletion or
  anonymisation leaves competition history intact.
- Read models that show a participant to other users must respect the organisation boundary (ADR-011).
