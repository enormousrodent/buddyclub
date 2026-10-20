# ADR-018: General-purpose community model and the Rally link

**Status:** Accepted 2026-10-20 (Addendum 1.1, step 3)  
**Date:** 2026-10-20

## Context

Addendum 1.1 makes Buddy Club category-agnostic: book clubs, dog walks and parent-and-toddler
groups must exist without a sport, court, rating or match schema (criterion 4), be discoverable
publicly, be joinable, and offer RSVPs to gatherings. Racket-sport gatherings that Rally runs must
link to the Rally occurrence without a second attendance ledger. Today `community.groups` requires
a `sport_id` and is only visible inside its club.

## Decision

1. **Interests, not sports, classify communities.** `community.interests` is reference data
   (sports, running, swimming, walking, dog walking, cycling, books, board games, families,
   parent and toddler, wellbeing, arts and crafts, food and drink, music, volunteering, other).
   `community.group_interests` links a group to any number of them. `groups.sport_id` becomes
   nullable and is only set for racket-sport groups that Rally serves. Sports stay as Rally
   reference data.
2. **Groups become the public community unit.** `groups` gain `visibility` (`public` |
   `private`), `join_policy` (`open` | `invite`), `locality` and `location_name`. Organisations
   stay the permission container: joining a public open group makes the caller a `participant`
   member of its organisation and a member of the group. `POST /v1/groups` with no
   organisation creates a club named after the group so a person with no club can start one.
3. **Activities are the cross-category event.** `community.activities` (group, title, when,
   where, interest, capacity, visibility, state) with `community.activity_rsvps`
   (`going` | `maybe` | `not_going`). Recurrence is copy-forward for now.
4. **One attendance owner when Rally is involved.** `activities.rally_occurrence_id` (nullable,
   unique) links an activity to a Rally occurrence in the same organisation. Once linked, Rally's
   session entries are the attendance ledger: an RSVP of `going` registers the person on the
   occurrence (and `not_going` withdraws a registration), the going count reads from Rally, and
   the activity page shows "Powered by Rally" with a deep link to the join page or the player's
   court view. Organiser controls stay in Rally.
5. **Discovery is a public projection served by the API.** `GET /v1/public/discover` returns
   public groups and upcoming public activities filtered by text, interest and locality, with
   no member data. RLS is untouched: `anon` still reads nothing.

## Consequences

- Migration 10 is additive: a reference table, a link table, two tables, and nullable or
  defaulted columns on groups. Existing sport groups keep their sport and gain the `sports`
  interest by backfill.
- The existing group endpoints keep working; the create body now accepts interests and
  visibility and no longer requires a sport.
- Location is a free-text locality for now (no geolocation, spec section 2); "near you" is a
  locality filter until a geo decision is made.
- Safeguarding, moderation and group messaging remain out of scope and need their own spec.
