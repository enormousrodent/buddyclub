# @buddyclub/rotation-engine

Deterministic social rotation engine (spec section 8), algorithm `social_doubles_v1`.
Pure TypeScript: no HTTP, database or framework imports (enforced by ESLint and
`tests/unit/architecture.test.ts`).

- `generateRotation(input)` returns assignments, rests, warnings and metrics; same seed, input
  and algorithm version always replay identically.
- `participantsFromHistory(roster, rounds)` folds committed rounds into the per-participant
  history the next call needs.

Hard rules that cannot be met are reported (`UNSATISFIABLE`, `LOCK_PARTNER_UNAVAILABLE`, ...),
never silently relaxed.
