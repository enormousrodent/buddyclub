# Phase 4: General tournaments and operations

**Status:** Implemented 2026-10-20 (local development only; UI follows the Paper & Path system)  
**Spec reference:** `RALLY_TECHNICAL_SPEC.md` sections 9, 10, 11, 13, 14 (Phase 4); ADR-005, ADR-008, ADR-011, ADR-016

## Goal

Pools into knockout with seeding, event QR registration, result disputes, public venue screens,
multi-organiser safety, reports and CSV, and resilience tests.

Exit (spec): a 32-team group-to-knockout tournament runs with no duplicate court or player
allocations and a safe read-only public view.

## Design

- **A tournament is a competition of type `tournament` with one season and one meet (the event).**
  Pools reuse divisions; the season rules gain `tournament.format` (`round_robin` or
  `pools_knockout`), `advancePerPool`, `seeding` and `thirdPlacePlayoff`. Rubber templates work
  as in leagues, so a tournament can be one doubles rubber per tie or the full four.
- **Entries and the draw.** `PUT /v1/meets/:id/entries` takes teams with optional seeds and
  distributes them across the pools by snake seeding (engine `seedPools`), writing
  `division_assignments` with the seed. The existing per-division endpoint still works.
- **Publishing** creates the pool round robins (`stage = pool`) and, for `pools_knockout`, the
  knockout skeleton (`stage = knockout`): fixtures with `bracket_round`, `bracket_slot`, a label
  and `sources_json` describing where each side comes from (pool position or winner of a slot).
  Team columns are nullable until the source resolves. Byes are pruned at build time.
- **Seeding into the bracket.** Pool winners take seeds 1..P in pool order; runners-up are seeded
  so that each meets the winner of the next pool, never their own (engine
  `qualifierSeeds`); standard bracket placement (1 v N, 2 v N-1, ...).
- **Advancing.** `POST /v1/meets/:id/knockout/advance` resolves every source whose input is final
  (pool complete with no unresolved tie; feeder fixture completed with a winner) and fills the
  teams and match sides. It also runs automatically after every confirmed result, so the bracket
  fills itself as pools finish. Idempotent.
- **Courts.** Knockout fixtures have no division, so any court dedicated to the meet is eligible;
  the player and court conflict checks from Phase 3 apply unchanged.
- **Disputes.** A captain disputes a submitted revision (Phase 3). New: directors list open
  disputes per meet and resolve them: `uphold` confirms the revision; `void` voids it and reopens
  the rubber so a new score can be entered. Every step is audited.
- **Public screens.** An organiser enables public access on a meet or a session occurrence, which
  gives it a random slug. `GET /v1/public/events/:slug/board` returns a redacted projection
  served by the API (no RLS exposure): team names, courts, scores, standings, round and timer; no
  participant data beyond display names for social session court boards, no guest links, no
  internal ids. Disabling public access rotates the slug away.
- **Event QR registration.** The same slug backs `/join/:slug`: a signed-in club member can
  register and check in to a session; anyone else is told to ask the organiser (ADR-008 keeps
  guest claim behind organiser proof).
- **Multi-organiser.** No new mechanism: every command locks the aggregate row, checks the
  version and re-validates court and player occupancy inside the transaction. Phase 4 adds the
  concurrency test that proves it (parallel court calls, one winner).
- **Reports and CSV.** Teams and rosters import from CSV (`team,player[,captain]`); meets export
  fixtures with rubbers and results, and standings; occurrences export rounds and courts.

## Migration 8

| Change                                                                                                      | Purpose                               |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `competition.meets.format`, `public_slug`                                                                   | Event format, public board            |
| `activities.session_occurrences.public_slug`                                                                | Public board and QR join for sessions |
| `competition.fixtures`: nullable teams and division, `stage`, `bracket_*`, `sources_json`, `winner_team_id` | Knockout skeleton                     |
| Pool pair uniqueness becomes partial (`stage = pool`); bracket slot uniqueness added                        | Teams may meet again in the knockout  |
| `matches.result_revisions.resolved_*`, `resolution`                                                         | Dispute resolution                    |

## API

| Area        | Endpoints                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournaments | `PUT /v1/meets/:id/entries`, `POST /v1/meets/:id/knockout/advance`, `GET /v1/meets/:id/fixtures` (bracket fields)                                                                     |
| Disputes    | `GET /v1/meets/:id/disputes`, `POST /v1/matches/:id/results/:rev/resolve`                                                                                                             |
| Public      | `POST /v1/meets/:id/public-access`, `POST /v1/occurrences/:id/public-access`, `GET /v1/public/events/:slug`, `GET /v1/public/events/:slug/board`, `POST /v1/public/events/:slug/join` |
| Reports     | `POST /v1/organisations/:id/teams/import`, `GET /v1/meets/:id/export.csv`, `GET /v1/meets/:id/standings.csv`, `GET /v1/occurrences/:id/export.csv`                                    |

## Web

Meet page: entries and draw, pools, bracket, advance, disputes, public board link with QR. Session
page: public board and QR join. New public pages `/board/:slug` (venue screen, auto-refresh) and
`/join/:slug` (QR landing).

## Tests

- Engine: snake seeding fills pools within capacity; bracket size 2^k-1 fixtures, byes pruned,
  no same-pool rematch in round 1, deterministic; qualifier seeding.
- Postgres: 32 teams into 8 pools, 48 pool fixtures and 15 knockout fixtures, pools played with
  parallel court calls (no court or player double-booked), bracket fills, final decided; dispute
  raised and resolved; public board redacted and 404 when disabled; CSV import and export round
  trip.

## Verification (2026-10-20)

- Engine: 19 tests (seeding, bracket construction with pruned byes, qualifier seeding without
  same-pool rematches, determinism for 2..40 entrants, source resolution).
- Postgres (cloud development project): 11 steps in `test/phase4.pg.test.ts`, about five
  minutes: CSV import of 32 teams and 64 players (idempotent re-import), 8 pools by snake seeding,
  48 pool fixtures plus 15 knockout ties published, two simultaneous calls to one court give
  exactly one 200 and one COURT_CONFLICT, override to another pool's court audited, all pools
  played, bracket fills itself with cross-pool round-one ties, knockout played to a final won by
  seed 1, SQL checks find no overlapping court or player bookings, captain disputes with director
  uphold and void paths, redacted public board with cache header and 404 after disabling, CSV
  exports, member QR join (registered, then checked in once open) and non-member refusal.
- Web: typecheck, lint, Prettier and `next build` green; new routes `/board/[slug]` and
  `/join/[slug]`. OpenAPI: 93 paths.
- Demo content: `pnpm --filter @buddyclub/platform-api demo -- --email you@example.com` seeds a
  club with sessions in every state, a live league meet and a tournament for your own account
  (set `DEMO_ALLOW_CLOUD=1` for the cloud development project).

## Open decisions

ADR-008 (guest claim proof) still gates guest self-registration from the QR page.
