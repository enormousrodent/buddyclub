# Buddy Club & Rally — Product Boundary and UX Adjustment Addendum

Version: 1.1 · Date: 19 October 2026  
Purpose: Apply these changes ON TOP OF `RALLY_TECHNICAL_SPEC.md` and the already implemented codebase. Do not rebuild or discard existing work.  
Status: Product direction correction; explicitly overrides conflicting UX/product positioning in the original specification.

Received from the owner on 2026-10-20 and stored verbatim. The change-impact plan the addendum
asks for (Step 1) is in [`addendum-1.1-impact.md`](addendum-1.1-impact.md).

## 1. Critical clarification

Rally is a standalone racket-sport session runner first, independently downloadable and commercially viable on iOS/Android. It is NOT primarily a social/community discovery app. Its core jobs are creating and running social play sessions with timers, smart court/partner rotation, fair rest, guest attendance, player read-only views, and eventually leagues/tournaments.

Buddy Club is the activity-agnostic community/discovery layer: discover and join real-world groups, sports, book clubs, swimming, walking, dog-walking, parent/toddler communities, board-game nights, etc. It owns general-purpose group/community discovery and engagement. Buddy Club can launch an existing Rally session as an integrated specialist experience.

Both must work alone. Installing or registering for Buddy Club must never be a prerequisite for Rally. A Rally-only user can create or join a session with Apple, Google or permitted email credentials, or participate as a guest without registration when organiser rules permit.

## 2. Specific overrides to original technical specification

| Previous/possible assumption                                                   | Required change                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rally home is sport discovery/player marketplace                               | Replace with utility dashboard: resume active session, Start Session, saved presets, upcoming/previous sessions, leagues/tournaments, join by code/QR |
| Rally requires Buddy Club registration                                         | Incorrect. Rally independently supports Apple and Google sign-in using same platform Auth issuer; optional Buddy Club-branded sign-in                 |
| Buddy Club is sports-first                                                     | Incorrect. Buddy Club is category-agnostic community/events/discovery; sports are one of many interest types                                          |
| All activities require sport_id                                                | General group/event interest category is optional/flexible; Rally-specific session requires racket sport configuration                                |
| Rally offers social search, messages and recommended nearby players by default | Remove from Rally core navigation and MVP; cross-link to Buddy Club explicitly and sparingly                                                          |
| One global app role                                                            | Retain resource-scoped permissions; a person may be an organiser in Rally and an ordinary Buddy Club member                                           |
| Guest is a Supabase account by necessity                                       | Incorrect. An organiser-added participant exists without any auth account; guest view access uses a scoped credential                                 |

Retain previous platform API, Supabase, participant identity separation, scheduling engines, competitions, court allocations, RLS, outbox, realtime and phased testing. Do not rename tables, delete migrations or alter existing endpoints without a compatibility/deprecation plan.

## 3. Target product ownership

### Buddy Club (community-focused)

- Interests and activity categories (sports, hobbies, families, pets, wellbeing, etc).
- Discover people-friendly public groups and activities; join groups; RSVP to gatherings.
- Manage recurring community events, memberships, organisers, invitations, group communications and moderation.
- Accessible group privacy, age-appropriate safeguards, child privacy (no child profiles public by default), moderation and reporting.
- Deep-link to Rally for racket-sports events that use Rally session/competition infrastructure.

### Rally (specialist session-running tool)

- Primary MVP: create/start/resume session; configure sport, courts, format, round length, participants, guest walk-ins, pair locks, gender preferences, skill preference, fair sit-out, timer, rotations, departures/arrivals, read-only player court view.
- Session templates and recurring instances, plus join via QR/link/code.
- Later: leagues, tournaments, draws/fixtures, team captain check-in, dedicated court pools, game scores, standings, promotions and venue displays.
- Local contacts/favourite participants may be an organiser convenience but are NOT a public community discovery marketplace.
- App should remain usable when Buddy Club-specific community features are down or unavailable, provided shared identity/API is healthy.

## 4. Identity and standalone login architecture

All user sign-ins map to one Supabase Auth identity pool. Each app can manage its own securely stored session; never share mobile refresh tokens between app sandboxes.

Rally options:

1. Continue with Apple → Supabase Auth Apple/OIDC flow.
2. Continue with Google → Supabase Auth Google/OIDC flow.
3. Continue with Buddy Club → branded account access. If both apps use the same Supabase Auth project, implement this via shared hosted login/account selection or a documented OIDC provider/broker that resolves to the same Supabase identity. Do not implement ad hoc token exchange or assume access to the other app's secure storage.
4. Optional email magic link/password if enabled globally.
5. Guest session participation does not require authentication; organiser-created guest records remain separate from auth.users.

Account collision/linking: Same email across Apple/Google must NOT trigger unsafe automatic merges. Follow supported Supabase provider account-linking flows with user verification and audit; require verified claim before associating a Rally guest participant with account history. Both apps should resolve to the same platform profile ID after verified linking.

Capabilities: An account registered from Rally has access to Rally immediately and can later open Buddy Club with the same identity. The same is true in reverse. Never make Buddy Club group membership mandatory for Rally-owned sessions: organisers can create standalone Rally groups/collections/presets under their own organisation or personal workspace.

## 5. Data-model refinement

General platform abstractions:

- interests / categories and group_categories, supporting multi-category communities rather than mandatory sport_id.
- activities / event_occurrences as cross-category event model; only specialise when needed.
- organisations, groups, participants, user_profiles, venues, memberships remain shared.
- Define owner_scope for Rally events (personal, organisation, buddy_group) and optional buddy_group_id; no forced Buddy Club linkage.
- Rally domains (sessions, session_occurrences, rotations, competitions, fixtures, matches, court_allocations) remain specialist data.
- Cross-app linkage uses stable IDs and an explicit association, e.g. buddy_activity_id ↔ rally_occurrence_id; avoid duplicate independent attendance ledgers. Specify one attendance owner per integration mode and sync through domain events.

Migration safety: Before adding columns/tables inspect existing migrations. Prefer additive nullable fields and backfills, schema versioning, and compatibility views rather than destructive table renames. Generate ADR with migration impact before edits.

## 6. Rally mobile navigation and screens

Bottom tabs proposed: Home, Sessions, Competitions, Profile (plus central Start CTA if it fits usability tests). Do not include Explore People, social feeds or generic Messages tab in Rally MVP.

### Rally Home (organiser-first)

- Header: Rally brand + avatar/account.
- Hero: Resume live session (if active): session name, current round, running timer, courts in play, prominent Resume.
- Primary action: Start a Session: one-tap from preset or enter quick setup.
- Saved presets: e.g. Tuesday Pickleball — 4 courts / 12-min social doubles / gender and fairness rules. One tap to start occurrence.
- Upcoming sessions: confirmed sessions and invited events, with check-in/join controls.
- Join a session: QR scanner and short code for participants without discovery feed.
- Leagues & tournaments: entry point into organiser-managed competitions and existing participant fixtures, secondary to core session running.
- Recent sessions: repeat or view statistics.

### Rally Player View

- My Game: current court (large), partner/opponents, round countdown, next call.
- My Schedule: confirmed and provisional assignments distinguished clearly.
- All Courts: read-only, optional court map; show only permitted data.
- My Competitions: fixtures, scores/standings, QR check-in.

### Buddy Club Home (discovery-first)

- Header, location/interest filters, search activities/groups/venues.
- Category selector covering sports, books, board games, dog walking, parent/toddler, swimming and more.
- Near You: event/group cards with dates, venue, attendance, suitability.
- Your Groups and Upcoming.
- Create Group / Create Activity.
- Rally-managed events have unobtrusive Powered by Rally and deep-link to session/check-in; no duplication of Rally's organiser control UI.

## 7. Visual system and logo guardrails

Buddy Club is broad community and human connection; visual brand should not be sport-specific and should not resemble Microsoft Teams / enterprise collaboration tools. Refine a distinctive minimal B mark with subtle meeting/route/connection motion, no clusters of generic people or suggestive shapes, few flat solid colours, high contrast, legible at 32px and app icon sizes. Rally is a separately recognisable racket/ball mark (previous Rally Concept 2 was favoured): clear racket/paddle + ball, simpler, scalable, with visual family resemblance via typography, corner radius and palette. Avoid gradients as a required asset dependency; prepare true vector originals and flat-colour app-icon master artwork. The existing concept sheets are creative reference, not automatically production-ready SVGs.

Suggested style: warm off-white backgrounds, deep forest/navy text, restrained teal/green accents, optional coral highlights for Buddy Club categories, lime ball accent for Rally. Do not impose precise token values before brand decision. Support accessible contrast, dark mode, reduced motion and 24/32/48px icon tests.

## 8. Deep linking and cross-app integration

- From Buddy Club group event: Open in Rally, resolving to a specific session/occurrence and current authenticated user, with registration/guest assignment validated server-side.
- If Rally is not installed, use verified HTTPS universal/app links with web fallback / store path.
- From Rally Profile: Explore communities on Buddy Club as a secondary optional CTA; do not make this the default home experience.
- Return routing should preserve event context without exposing session access tokens in analytics/referrer URLs.
- Identity must be shared but access permissions must still be separately checked for each resource.

## 9. Engineering work order for the existing Claude Code repository

Step 1 — Inspect existing state first. Read original specification, current migrations, apps, auth flow, navigation, API contracts and tests. Produce a short change impact plan. Do not regenerate project scaffolding or rewrite stable features.

Step 2 — Correct product boundaries. Remove any Rally discovery-first flows introduced by previous specs; preserve session-running functionality. Ensure Buddy Club categories and events are general-purpose.

Step 3 — Identity convergence. Confirm Rally standalone Apple/Google works without Buddy Club installation; add optional Continue with Buddy Club flow only with a secure, supported same-identity implementation; write tests for claims and verified account linking.

Step 4 — Rally Home. Build functional home with Resume Session, Start Session, saved templates, upcoming sessions, join via QR/code and secondary competitions entry. Support empty and offline states.

Step 5 — Buddy Club Home. Build universal community discovery across multiple categories, personal groups and events; Rally event deep-link where relevant.

Step 6 — Tests and release safety. Preserve prior scheduling/league tests; add cross-app auth tests, guest access regression tests, route/deep-link tests, and absence of Buddy Club dependency for Rally-only users. Produce a migration report.

## 10. Acceptance criteria (non-negotiable)

1. A new user can install only Rally, sign in with Apple/Google, create a pickleball session, add unauthenticated guests and run round 1 with no Buddy Club install, group or membership.
2. An existing Buddy Club user signs into Rally and resolves to their same verified platform account without duplicate user profile.
3. A Rally-only user opens Buddy Club subsequently and retains their identity, with Buddy Club-specific onboarding preferences collected separately.
4. A Buddy Club book club, dog-walking group and parent/toddler group can be created without sport_id, court, player rating or match schema.
5. Rally Home prioritises the next action to run a session; no public discovery feed, nearby player carousel or chat-first navigation.
6. Rally read-only participant views and guest QR access work for independently created sessions.
7. Existing social rotation, courts, competition fixtures, standings and division promotion/relegation tests still pass.
8. An event linked from Buddy Club to Rally opens the correct occurrence securely; uninstalling either app does not affect the other's underlying identity/account data.
9. API changes and migrations are additive, documented and backward compatible unless explicitly approved.
