# Phase 3: Reference divisional league

**Status:** Implemented 2026-10-19 (local development only; UI is proof of concept)  
**Spec reference:** `RALLY_TECHNICAL_SPEC.md` sections 1, 9, 14 (Phase 3); ADR-004, ADR-005, ADR-009

## Goal

A competition director runs a season of regional meets: divisions of (usually) four teams, every
team plays the other three, each fixture is four named rubbers scored under configurable rules,
each division has dedicated courts for the meet, standings rank by fixture wins then points
difference (configurable), and after a meet the top team of each division moves up and the bottom
moves down after the director previews and approves. Scores, standings and court allocations are
kept as immutable history.

Exit (spec): seed three divisions and 12 teams, 72 rubbers total, fixed-court behaviour correct,
standings accurate, promotion/relegation approved with audit history, and the worked example
(New Forest +71 above NTA Basingstoke +15 on equal fixture wins) ranks correctly.

## Engines (pure)

- `competition-engine`: `buildRoundRobin(teamIds, seed)` (circle method; n(n-1)/2 unique
  fixtures, 3 rounds for 4 teams), `expandFixture(fixture, rubberTemplate)`,
  `computeStandings(input, rules)` applying ordered criteria lexicographically with head-to-head
  mini-tables and an explicit `unresolvedTies` output, `computeProgression(standings, divisions,
rules)` producing a from/to matrix with boundary handling.
- `scoring-engine`: `evaluateGame(points, scoring)` (target, win-by, cap), `evaluateRubber(games,
scoring)` (sets per rubber, draws), `evaluateFixture(rubbers, outcomePolicy)` returning winner,
  draw or `needs_review`, plus aggregate points for and against.

## Migration 7 (`competition` schema, `facilities.court_pools`, `matches.result_revisions`)

| Table                                          | Purpose                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `competition.competitions`                     | League or tournament owned by an organisation                                  |
| `competition.seasons`                          | Rules snapshot (league ruleset), state, version                                |
| `competition.divisions`                        | Ordinal 1 = highest (configurable via rules)                                   |
| `competition.teams`, `team_roster`             | Persistent teams, dated roster with eligibility metadata                       |
| `competition.meets`                            | A regional meet: venue, time, state, ruleset snapshot, version                 |
| `competition.division_assignments`             | Team in division for a meet (unique per meet)                                  |
| `facilities.court_pools`, `court_pool_members` | Dedicated courts per division per meet, exclusive                              |
| `competition.fixtures`                         | Team vs team, round number, status, outcome JSON, version                      |
| `matches.matches` (+FK)                        | Rubbers reference fixtures with `rubber_key`                                   |
| `matches.result_revisions`                     | Append-only score ledger: submitted / confirmed / disputed / void              |
| `competition.standings_snapshots`              | Immutable standings per meet and division with inputs hash and ruleset version |
| `competition.progressions`                     | Preview and committed movement between meets, with before/after snapshots      |

## API

| Area                      | Endpoints                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Competitions              | `POST/GET /v1/organisations/:orgId/competitions`, `GET /v1/competitions/:id`, `POST /v1/competitions/:id/seasons`, `GET /v1/seasons/:id`, `POST /v1/seasons/:id/divisions`                                                        |
| Teams                     | `POST/GET /v1/organisations/:orgId/teams`, `PATCH /v1/teams/:id`, `POST/DELETE /v1/teams/:id/roster`                                                                                                                              |
| Meets                     | `POST /v1/seasons/:id/meets`, `GET /v1/meets/:id`, `PUT /v1/meets/:id/divisions/:divisionId/teams`, `PUT /v1/meets/:id/divisions/:divisionId/courts`, `POST /v1/meets/:id/fixtures/preview`, `POST /v1/meets/:id/fixtures/commit` |
| Fixtures and rubbers      | `GET /v1/meets/:id/fixtures`, `PUT /v1/fixtures/:id/lineups/:teamId`, `POST /v1/matches/:id/call`, `/start`, `/complete`, `POST /v1/matches/:id/results`, `POST /v1/matches/:id/results/:revision/confirm`, `.../dispute`         |
| Standings and progression | `GET /v1/meets/:id/standings`, `POST /v1/meets/:id/progression/preview`, `POST /v1/meets/:id/progression/commit`                                                                                                                  |

Rules: court call only from the division's pool; a court with no eligible rubber stays idle; a
participant cannot be in two in-progress matches; manual court override needs a reason and is
audited; results default to `needs_review` when the policy cannot decide; standings are computed
from confirmed results only and snapshotted with the ruleset version.

## Web (POC)

Rally host, director screens: competition and season setup with the rules form, teams and rosters,
meet builder (teams into divisions, courts per division), fixture grid, lineup entry, result entry
and confirmation, standings table, progression preview and approve. Player/captain: fixtures for
my team, my rubbers.

## Acceptance tests

- Engine: round robin n(n-1)/2 for n in 2..12; four teams give 6 fixtures in 3 rounds; rubber
  expansion; 21-point variants (straight, win-by-two, cap 30); 2-2 branch for each tie policy;
  lexicographic ranking with the New Forest / NTA example; head-to-head mini-table; unresolved tie
  reported; progression mapping with boundary divisions.
- Postgres: seed 3 divisions x 4 teams, publish a meet (72 rubbers), fixed-court call denied
  outside the pool, concurrent court claim conflict, result submission and confirmation reprojects
  standings, stale progression commit rejected, audit trail present.

## Open decisions (ADR-009)

Defaults stay safe: `winBy 1`, no cap, 2-2 -> `needs_review`, unresolved ties surfaced. The league
confirms its policy as ruleset values; no code changes required.
