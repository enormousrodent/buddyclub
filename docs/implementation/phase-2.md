# Phase 2: Social rotation MVP

**Status:** Implemented 2026-10-19 (local development only; Vercel deployment deferred)  
**Spec reference:** `RALLY_TECHNICAL_SPEC.md` sections 8, 10, 14 (Phase 2); ADR-004, ADR-005, ADR-006

## Goal

An organiser runs a social night from a phone: opens a session, checks players in (including
walk-ins added by name), sets partner locks, previews a fair rotation, commits it, starts the round
timer, and repeats. Players and guests see their court, partner and opponents for the current and
next round. Changes mid-session affect future rounds only. Two organisers cannot commit divergent
rounds.

Exit (spec): 11 players on 2 courts get fair rests across 4+ rounds; a withdrawal preserves prior
rounds; concurrent commits conflict safely.

## Scope

### Rotation engine (`packages/rotation-engine`, pure)

Interface from spec section 8. Algorithm `social_doubles_v1`:

1. Eligible = available participants; hard-locked pairs become units (a lock whose partner is
   unavailable is reported, not silently dropped).
2. Slots = courts x players-per-court, capped to a multiple of the format size; the rest sit out.
   Rest selection ranks by fewest rests, then most minutes played, then seeded order; players at
   `maxConsecutiveRests` are protected. Pre-arrival rounds never count against anyone because
   history only accumulates from rounds a player was present for.
3. Bounded deterministic candidate search (seeded PRNG) over pairings and court groupings;
   candidates are scored on repeat partners, repeat opponents, skill imbalance and gender pairing
   preference (opt-in, missing data never penalised); strict gender modes reject violating
   candidates and report `UNSATISFIABLE` when none remain.
4. Returns assignments (court, two sides), rests, warnings, metrics and `algorithmVersion`.
   Same input + seed + version always yields the same output.

### Migration 5 (`activities`, `matches`, `platform.rulesets`)

| Table                                                  | Purpose                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `platform.rulesets`                                    | Named, versioned rule presets per organisation (kind `social_session` now)                                               |
| `activities.session_series`                            | A recurring or one-off session definition (name, sport, venue, defaults)                                                 |
| `activities.session_occurrences`                       | One actual session: state machine draft > open > live > completed/cancelled, ruleset snapshot, round duration, `version` |
| `activities.session_courts`                            | Courts available for an occurrence (subset of the venue's courts)                                                        |
| `activities.session_entries`                           | Who is in: registered / checked_in / left / no_show, timestamps                                                          |
| `activities.pair_locks`                                | Hard or soft partner locks, optionally until a round                                                                     |
| `activities.rotation_previews`                         | Persisted previews; commit accepts only a preview id bound to an occurrence version                                      |
| `activities.social_rounds`                             | Published rounds with the authoritative timer fields and a revision                                                      |
| `activities.round_assignments`                         | One row per participant per round: playing on a match or resting (unique per round)                                      |
| `matches.matches`, `match_sides`, `match_side_players` | The spec's match model; social matches reference a round, league rubbers (Phase 3) a fixture                             |

Court pools (`facilities.court_pools`) are deferred to Phase 3 where policies matter; social
sessions use a plain court list.

### API

| Area        | Endpoints                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rulesets    | `POST/GET /v1/organisations/:orgId/rulesets`                                                                                                                                                                         |
| Sessions    | `POST/GET /v1/organisations/:orgId/sessions`, `GET/PATCH /v1/sessions/:id`                                                                                                                                           |
| Occurrences | `POST /v1/sessions/:id/occurrences`, `GET /v1/organisations/:orgId/occurrences`, `GET/PATCH /v1/occurrences/:id`, `POST .../open`, `.../complete`, `.../cancel`                                                      |
| Roster      | `POST /v1/occurrences/:id/participants` (existing participant or new walk-in by name), `POST .../check-ins`, `POST .../participants/:pid/withdraw`, `POST .../participants/:pid/no-show`                             |
| Pair locks  | `POST /v1/occurrences/:id/pair-locks`, `DELETE .../pair-locks/:lockId`                                                                                                                                               |
| Rotation    | `POST /v1/occurrences/:id/rotations/preview`, `POST .../rotations/commit` (preview id + occurrence version)                                                                                                          |
| Rounds      | `POST /v1/rounds/:id/start`, `.../pause`, `.../resume`, `.../complete`, `.../cancel`                                                                                                                                 |
| Read models | `GET /v1/occurrences/:id/board` (members), `GET /v1/occurrences/:id/my-schedule` (own participant), `GET /v1/guest/board` (guest credential scoped to the occurrence), `GET /v1/me/sessions` (upcoming across clubs) |

Every mutating endpoint: actor + role check (`session.manage` for organisers, self for check-in),
`Idempotency-Key`, audit event, occurrence `version` bump, outbox event where the spec lists one
(`session.round_published`, `session.round_started`, `session.round_completed`,
`participant.withdrawn`). No worker drains the outbox yet; push is out of scope for the web pilot.

### Web (POC screens, see UI status in phase-1.md)

Organiser: sessions per club, new session (series + first occurrence), occurrence console
(roster, check-in, add walk-in, locks, preview, commit, round timer, court board). Player: Rally
home lists upcoming sessions; "my game" with countdown. Guest: the guest page shows the board for
the occurrence the link was issued for. Live pages poll every 10 seconds.

## Acceptance tests

- Engine unit: determinism; no duplicate player or court per round; locked pair never split;
  partner-unavailable lock reported; strict gender unsatisfiable reported; 11 players / 2 courts
  over 6 rounds yields rest counts differing by at most 1; late arrival not penalised.
- Engine property-based: random pools 4 to 40 players, 1 to 10 courts: all assigned players
  eligible, no duplicates, rest count = eligible minus slots.
- API (Postgres): open session, add walk-in by name, check in, preview, commit, start, complete,
  next preview reflects history; withdraw during a live round keeps the published round intact;
  stale preview (occurrence version moved) is rejected with 409; guest board shows only the
  linked occurrence; non-member denied.

## Progress log

- 2026-10-19: migration 5 applied to the cloud project; rotation engine `social_doubles_v1` with 14
  unit/property tests (fair rests for 11 players on 2 courts over 6 rounds, locks never split,
  strict gender unsatisfiable reported, late arrival not penalised); API for rulesets, sessions,
  occurrences, roster, pair locks, preview/commit, round timer and read models; 8 Postgres-backed
  tests pass against the cloud project (stale preview rejected with 409, withdrawal keeps round 1
  intact and cancels the pending round, session-scoped guest schedule). Web: club Sessions tab,
  session console (roster, locks, preview/publish, timer controls, court board), My game page,
  Rally home listing sessions, guest page showing court and timer; live pages poll.

## Rollout

Migration 5 applied to the cloud project after review (as with migration 4). Reverse steps in
`infra/supabase/migrations/README.md`.

## Open decisions

- Gender matching semantics: implemented as opt-in modes (`off`, `prefer_same`, `prefer_mixed`,
  `strict_same`, `strict_mixed`) over self-declared labels; confirm wording and consent copy.
- Whether players may check themselves in from their phone (implemented: yes, for their own
  participant record; organisers can disable per session later).
