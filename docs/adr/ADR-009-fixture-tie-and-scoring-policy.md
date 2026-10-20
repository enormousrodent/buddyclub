# ADR-009: 2-2 fixture outcome, win-by-two and point cap

**Status:** Open (product confirmation required before Phase 3 standings are trusted)  
**Date:** 2026-10-19

## Safe defaults in place now (`@buddyclub/rules-schema`)

| Setting                        | Default        | Reason                                                                    |
| ------------------------------ | -------------- | ------------------------------------------------------------------------- |
| `scoring.winBy`                | `1`            | Win-by-two must be configured explicitly; the spec says it is not assumed |
| `scoring.cap`                  | `null`         | No cap unless the league sets one                                         |
| `fixtureOutcome.tieBreak`      | `needs_review` | A 2-2 fixture is never silently decided                                   |
| `standings.finalTieResolution` | `unresolved`   | Surfaces UNRESOLVED_TIE instead of inventing an order                     |

## Decisions needed from the league

1. 2-2 fixtures: aggregate points, a draw, or a decider rubber.
2. Whether games are 21 straight, 21 win-by-two, and whether a cap (for example 30) applies.
3. The ordered standings criteria beyond fixture wins and points difference, and the final
   deterministic fallback, if any, that the league is willing to approve.
4. Whether a disputed rubber blocks the fixture result or only the affected rubber.

Each answer becomes a ruleset version (ADR-004); nothing in code changes.
