# Addendum 1.3, step 1: buddy profile and Buddy Club onboarding (2026-10-22)

**Status:** Built and tested against the cloud dev database. Not committed or deployed.
**Plan:** [`../product/addendum-1.3-buddies.md`](../product/addendum-1.3-buddies.md), section 5 step 1.
Nothing in this step is visible to anyone but the person; step 2 adds people search.

## What a Buddy Club member gets

- **A first run that cannot be skipped.** A signed-in person who has not finished it is sent to
  `/welcome` from every Buddy Club page (the layout checks the profile's `onboarded.buddyclub`
  mark). Five screens: who you are (name, area, a line), what you're into (at least one), how
  good and when (level and a week grid per activity), your gear, who can find you. Finishing
  sets the mark. Rally's own first run is untouched and keeps its own mark, so neither skips the
  other.
- **Activities** picked from the interest list, with racket sports offered as the sports
  themselves (Tennis, Pickleball, ...), so a profile holds "Tennis" and "Books" side by side.
- **Level** per activity: Just starting, Getting going, Comfortable, Strong, Expert, each with a
  hint. Self-rated; "Not sure yet" is allowed.
- **Days free** per activity: a Monday-to-Sunday by morning, afternoon, evening grid. Tap a
  cell, a day, a time of day, or "All".
- **Gear** per activity: name and a one-line detail. No photos.
- **Visibility**: Find me and Show my gear, both off by default. Find me needs the 18 or over
  box; the API refuses it otherwise (409) and the database enforces the same with a check
  constraint.
- `/buddy` edits all of it later; `/profile` links to it on the Buddy Club host.

## Data (migration 15, `20261021001500_addendum_1_3_profiles.sql`)

`identity.user_profiles` gains `locality`, `bio`, `discoverable`, `show_gear`,
`adult_confirmed_at`, `buddyclub_onboarded_at`, `rally_onboarded_at`. New tables
`identity.profile_activities` (one row per interest or sport, with `level`, `days` jsonb and
`note`) and `identity.profile_gear`. RLS on, API-only. Applied to the cloud project directly, as
before.

## API

`GET/PATCH /v1/me/profile`, `PUT /v1/me/activities` (replaces the set; an entry sent with only
its ids keeps its level, days and note), `PUT /v1/me/gear` (replaces the list in order). New
`profiles` module registered beside `identity`; it uses the database directly rather than the
identity repository, so the hermetic memory repository is unchanged.

## Web

- `components/buddy-profile.tsx`: the five sections as forms, shared by `/welcome` and `/buddy`.
- `components/day-grid.tsx`: the week grid, a client component that posts one JSON field.
- `app/buddyclub/welcome/*`: the first run and all profile actions.
- `app/buddyclub/layout.tsx` gates every Buddy Club page; the proxy now passes the request
  path as `x-buddyclub-path` so the layout can let `/welcome` through.

## Tests

`test/profiles.pg.test.ts`: empty and private to start; activities with level and days,
sports as activities, re-sending keeps days, unknown interest, sport and day slot refused;
gear in order and unknown interest refused; place and bio; Find me refused before 18+, allowed
after; each app's onboarded mark independent; empty patch refused. The `me` suite still passes.

## Not in this step

People search, profile views, gatherings' people, buddy requests, block and report (step 2 and
3). Rally seeding a club rating from the self-rating (step 4).
