# Addendum 1.1, step 3: general-purpose community model and Buddy Club discovery

**Status:** Implemented 2026-10-20 (local development only)  
**Reference:** `docs/product/ADDENDUM-1.1-product-boundary.md` sections 3, 5, 6 and 8; impact plan
part D; ADR-018

## What changed

- **Interests replace mandatory sports.** `community.interests` reference data (17 categories,
  sports among them); `community.group_interests`; `groups.sport_id` is nullable and only set
  for racket-sport groups Rally runs. Existing groups were backfilled as `racket_sports`.
- **Groups are the public community unit.** `visibility` (public | private), `join_policy`
  (open | invite), `locality`, `location_name`. `POST /v1/community/groups` creates a group and,
  when no club is given, a club named after it with the caller as admin. Joining a public open
  group makes the caller a `participant` member of the club and a member of the group.
  Invitation-only groups refuse joins except by organisers; private groups refuse non-members.
- **Activities with RSVPs.** `community.activities` (title, when, where, interest, capacity,
  visibility, state) and `community.activity_rsvps` (going | maybe | not_going). Capacity is
  enforced on `going`. Organisers (`groups.manage`) create and cancel.
- **One attendance ledger with Rally.** `activities.rally_occurrence_id` links a gathering to a
  Rally occurrence of the same club (unique). When linked, RSVP `going` registers the person on
  the occurrence, `not_going` withdraws a registration, and the going count reads from Rally's
  entries. Linking and unlinking need `session.manage`.
- **Discovery.** `GET /v1/public/discover?q=&interest=&locality=` returns interests, public
  groups (with next gathering) and upcoming public gatherings, cached for 30 s, no member data.
  `GET /v1/community/groups/:id` and `/activities/:id` are public for public items and members
  only otherwise (optional actor). `GET /v1/me/community` lists my groups and what is coming up.
- **Web (Buddy Club).** Tabs: Home, Explore, Mine, Me. Home is discovery first with search,
  interest chips, "Happening soon" cards, groups, "You're going" when signed in, and a "Clubs you
  run" list for organisers. Explore adds a locality filter. New group form (interests, visibility,
  joining, place, optional club, optional racket sport). Group page: cover, join, upcoming, and
  for organisers an "Add a gathering" form with an optional Rally session to run it. Activity
  page: details, RSVP going / maybe / can't make it, "Powered by Rally" with a deep link to the
  join page or the player's court view, cancel for organisers. Mine: your groups and up next.

## Migration 10

`20261020001000_addendum_community_model.sql`: additive; see the migrations README for reverse
steps.

## Verification (2026-10-20)

- Postgres: `test/addendum3.pg.test.ts` (5 steps, about 10 s): interests listed publicly; a book
  club, a dog-walking group and a private toddler group created with no sport; discovery by text,
  interest and locality with private items hidden and anonymous reads of public pages; a
  stranger joins the open group (becomes a club participant), RSVPs, capacity enforced on the
  third account, private and invitation-only groups refuse; a Rally-run gathering registers on
  the session on `going`, withdraws on `not_going`, counts from Rally, refuses double linking and
  RSVPs after cancellation.
- Web: typecheck, lint, Prettier and `next build` green; new routes `/explore`, `/groups`,
  `/groups/new`, `/activities/[id]`.

## Criteria touched

Addendum criteria 4 (book club, dog walking, parent and toddler without sport schema), 8 (web
deep link from a Buddy Club gathering to the Rally occurrence; universal links are native work)
and 9.
