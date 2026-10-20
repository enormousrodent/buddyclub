# Addendum 1.1: change-impact plan (Step 1)

**Date:** 2026-10-20 · **Against:** the codebase after Phase 4 and the design pass (ADR-015)  
**Addendum:** [`ADDENDUM-1.1-product-boundary.md`](ADDENDUM-1.1-product-boundary.md)

## Where we already comply

| Addendum point                                       | Current state                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rally home is a utility dashboard, not discovery     | Done in the design pass: Start session hero, Resume, My schedule, Tonight / Upcoming / Recent, Leagues as a secondary tab. No feed, no nearby players, no messages anywhere. |
| Guests are not auth accounts                         | ADR-003 and ADR-008: participants are independent rows; guest links redeem to a scoped credential; claim stays closed until proof is decided.                                |
| Resource-scoped permissions                          | Memberships and roles per organisation; every command checks the resource's organisation.                                                                                    |
| One identity pool                                    | One Supabase Auth project; one `user_profiles` row per auth user; both hosts share the cookie (ADR-013). Criteria 2 and 3 hold by construction.                              |
| Player read-only views and QR access for any session | My game, My schedule, guest links, public board and QR join (ADR-016) all work on any occurrence.                                                                            |
| Competitions as a later, secondary Rally area        | Phases 3 and 4 delivered; reachable from a tab, not the home hero.                                                                                                           |
| Additive migrations only                             | Migrations 1 to 8 are additive; nothing renamed or dropped.                                                                                                                  |
| Visual guardrails                                    | Paper & Path matches the suggested style. Token values are a first pass and stay provisional until the brand is signed off.                                                  |

## Gaps, by addendum section

### A. Identity (section 4, criteria 1 to 3)

- **Apple and Google sign-in are not enabled.** The web sign-in offers password and magic link only. Work: enable the providers in the Supabase project (needs your Apple Services ID and Google OAuth client), add the two buttons to the sign-in page, keep email as the global fallback. No API change: the verifier already accepts any token from the project.
- **Account linking policy is undecided.** Supabase will refuse an Apple sign-in whose email already exists under Google unless automatic linking is on. The addendum forbids unsafe automatic merges, so we need ADR-017: manual linking from a signed-in session (Supabase `linkIdentity`) with an audit event, and a clear "this email is already used with Google" message. Tests: hermetic verifier tests for `provider` claims; a Postgres test that two providers for one auth user resolve to one profile.
- **"Continue with Buddy Club"** is the same hosted login in the web world; for native apps it becomes a documented OIDC flow to the same project. Nothing to build now beyond naming the button.

### B. Rally without a club (section 4 capabilities, section 5 owner_scope, criterion 1)

- **Every session today belongs to an organisation.** A Rally-only user must create a club before starting a session. Work: migration 9 adds `owner_scope` (`personal` | `organisation` | `buddy_group`) and nullable `buddy_group_id` to `session_series`; a personal workspace is an organisation created automatically on first use with `kind = personal`, so RLS, memberships and every existing endpoint keep working unchanged. Additive; no renames.
- **Start session** then works with no club: `/start` creates the personal workspace silently when the user has nothing else.

### C. Rally home and navigation (section 6, criterion 5)

- Tabs become **Home, Sessions, Competitions, Profile** (today: Sessions, Leagues, Me).
- **Saved presets**: session series already hold the defaults (sport, venue, round length, rules). Add a one-tap "Start tonight" per series on Home and a "Save as preset" when creating one.
- **Join by code**: the QR flow exists (`/join/:slug`); add a short-code entry field on Home that routes to it.
- **Resume hero** should show round, timer and courts in play (today it shows name and club only).
- Player view: **My Competitions** (my team's fixtures and standings) is missing; add a page under Competitions.

### D. Buddy Club general-purpose model (sections 3 and 5, criterion 4)

- **Groups require `sport_id`** (`community.groups.sport_id not null`). Work: migration 9 adds `community.interests` (categories: sports, outdoors, books, games, families, pets, wellbeing, ...), `community.group_interests`, makes `groups.sport_id` nullable with a compatibility rule (sport groups keep it), and adds `community.activities` and `activity_occurrences` with RSVPs as the cross-category event model. Rally sessions stay specialist.
- **Cross-app link**: `activity_occurrences.rally_occurrence_id` (nullable, unique) with one attendance owner: when linked, Rally's entries are the attendance ledger and the activity shows "Powered by Rally" with a deep link to `/join/:slug` or `/sessions/:id/me`. ADR-018 records the integration mode and the event sync.
- **Buddy Club home** becomes discovery-first (categories, near you, your groups, upcoming, create group/activity), the Phase 5 I proposed. Organisations stay as the container for memberships and permissions; groups become the public-facing community unit.
- Safeguards, moderation, group messaging: out of this plan; needs its own spec.

### E. Deep linking (section 8, criterion 8)

- Web routes already serve as the fallback targets. Universal links and store fallback are native-app work (Expo phase). Access tokens never appear in URLs today; the guest link token is the one exception and is single-use by design (ADR-008).

### F. Tests and migration report (step 6, criteria 7 and 9)

- Keep all 58 Postgres-backed steps and the hermetic suites green. Add: Rally-only user journey (sign up, start a session with no club, add walk-ins, publish round 1), two-provider identity resolution, deep-link route tests, and a migration report for migration 9 (added columns and tables, backfills, reverse steps).

## Proposed order

1. **B + C** (Rally without a club, Home and tabs, presets, join by code, resume hero, My Competitions). Smallest changes, biggest effect on criteria 1, 5 and 6.
2. **A** (Google and Apple sign-in, ADR-017 linking). Needs your provider credentials; code is small.
3. **D** (interests, general groups, activities with RSVP, Buddy Club discovery home, Rally deep link). This is Phase 5 and the largest piece.
4. **F** throughout, with the migration report at the end of D.

## Status of the order

1. **B + C: done 2026-10-20** (`docs/implementation/addendum-1.1-step-1.md`, ADR-017, migration 9).
2. A: waiting on provider credentials and the linking decision.
3. **D: done 2026-10-20** (`docs/implementation/addendum-1.1-step-3.md`, ADR-018, migration 10). Safeguarding, moderation and messaging remain unspecified.

## Decisions needed from you

- Apple Services ID and Google OAuth client details for the Supabase project (or confirm Google only to start).
- Account linking: manual, user-verified linking as proposed in A, or allow automatic linking for verified emails only.
- "Rally Concept 2" for the mark: please share the concept sheet; the current racket-and-ball mark was drawn without it.
- Whether personal workspaces should appear in Buddy Club at all (proposal: hidden, never listed as a club).
