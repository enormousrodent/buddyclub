# Addendum 1.5: the session is the group

**Date:** 2026-10-22 · **Against:** the codebase after Addendum 1.4
**Status:** Accepted by the owner 2026-10-22 and built the same day; see
[`../implementation/addendum-1.5.md`](../implementation/addendum-1.5.md).
**Rule:** Additive. The community tables and endpoints stay for the parked wider product; only
the app stops showing them.

## 1. The confusion (owner, 2026-10-22)

"I have two sessions and a Basingstoke Bandits club, but no groups, so I'm confused about the
overlap." Groups were built for the category-agnostic Buddy Club, where a book club needs a
crowd and a calendar but no courts. In a racket-only product with a session runner, a group and
a session are the same thing wearing two hats: members and regulars, gatherings and nights, a
sport and a place on both.

## 2. The model

Three nouns, each with one job.

- **Club** is where you play: the people, the venues, the admins and the permissions. A club
  page shows its sessions, with Configure for organisers, what is coming up and what has been
  played. Members, players and venues have their own tabs.
- **Session** is a regular crowd and its night. It is the thing people find and join, which is
  what groups did. It has a description, a visibility (public or private) and a join policy
  (anyone or by invitation), plus a town or area for discovery when there is no venue. Joining
  a public open session makes you a regular and a plain member of its club.
- **Night** is one date of a session. A one-off hit is a session without a weekly schedule, set
  up for one date; "I'm coming" is the RSVP. Unchanged.

Buddies stay as the people layer. Tabs: Home, Sessions, Buddies, Profile. Clubs and competitions
are reached from Home.

## 3. What goes

The Groups tab, the group and gathering pages, the club's Groups tab, and discovery of groups.
"Near you" now lists public sessions by name, place and sport, with Join on open ones. The
"maybe" RSVP goes with gatherings. Dev groups were deleted, not migrated.

## 4. What stays

Join by link or code, public discovery, descriptions, hosts, regulars, rotation, ratings,
leagues, the venue board. Sessions default to private and by invitation, so nothing already set
up becomes public by itself.
