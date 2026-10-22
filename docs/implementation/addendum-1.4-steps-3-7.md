# Addendum 1.4, steps 3 to 7: buddies, profile completion, Find me, groups in the app, the name (2026-10-22)

**Direction:** [`../product/addendum-1.4-rally-first.md`](../product/addendum-1.4-rally-first.md).
**Status:** built, typechecked, linted, hermetic and database suites green, web build green. Not
opened in a browser. Not committed. Migration 17 applied to the cloud dev database.

## The name (owner, later on 2026-10-22)

The product is **Buddy Club**. The session runner is its key feature, not a second product.
Nothing structural changed: the `rally` route group, theme, host mode and internal names stay,
because they are not user-facing. What a person sees now says Buddy Club: the brand table,
lockup and icon title, the front page, metadata, sign-in, the welcome, invites, legal pages, and
"Powered by Rally" became "Session night". The logo file is still the R tile; the owner will
replace it. The free tier is "an account"; the paid tier's name (section 9 of the addendum) is
open.

## Step 3: buddies

- **Migration 17** (`20261022001700_addendum_1_4_buddies.sql`): `identity.buddy_blocks`,
  `identity.buddy_reports`, `identity.buddy_hellos`, plus two partial indexes for the
  shared-nights query. The buddies list is derived, not stored.
- **API** (`modules/buddies`): `GET /v1/me/buddies` (people you have both checked in with,
  newest night first, with shared count, last played, their sports and levels, hello state),
  `GET /v1/me/hellos` (reading marks them seen), `GET /v1/buddies/:id` (the card),
  `POST .../hello` (once per direction; writes a `buddies.hello` outbox event for a future
  notification), `POST`/`DELETE .../block`, `POST .../report` (204; stored and audited).
- **Visibility:** a card is visible to a buddy or, for someone with Find me on, to any member.
  Level, days, bio and place are member-to-member; gear only when they show it. A block in
  either direction reads as 404 everywhere, hides both lists both ways, and is never disclosed.
- **Web:** a Buddies tab (Rally tabs are now Home, Sessions, Buddies, Groups, Profile;
  competitions from Home), `/buddies` with hellos and the list, `/buddies/:id` with Say hi,
  block, unblock and a report form.
- **Rating seed (Addendum 1.3 step 4):** the first participant record in a club starts from the
  person's strongest racket-sport level, mapped onto the organiser's 0 to 100 scale (20, 35, 50,
  65, 80). Never overwritten afterwards.

## Step 4: complete your profile

- `/profile/complete`: two screens, level and days then the visibility switches, reusing the
  Addendum 1.3 components. The second screen sets `buddyclub_onboarded_at`, which now means
  "profile completed".
- Offered after rating a night (card on the thanks screen, with "See who was there") and on
  the dashboard once two completed nights have been attended. Never on first run. A thank-you
  card shows once on the dashboard after completion.
- Not built: a host nudging regulars. There is no notification channel yet.

## Step 5: Find me

- `GET /v1/buddies/search?sport&level&locality&day&slot`: adults with Find me on, never the
  caller, never across a block, at most 50, by display name. The caller must be findable
  themselves (409 otherwise), so looking and being looked at go together.
- `/buddies/find`: sport, level, day, time of day and area; a card explaining the switch when
  the person is not yet findable.

## Step 6: groups, gatherings and clubs in the app

Moved from the parked Buddy Club group into `app/rally/(app)`: `groups`, `activities`
(gatherings), `explore`, `clubs/[orgId]` (overview, sessions, members, players, groups,
venues), `venues/[venueId]`, and their actions. Imports gained one level. Explore is now "Near
you" with the category fixed to racket sports and no chips; a new group is always a racket-sport
group; the dashboard lists the person's clubs. The Buddy Club group now holds only its marketing
page, its welcome, the Rally redirect and the layout, all unreachable.

## Step 7: domain

Nothing to build until the name is chosen: one `WEB_PRODUCT`-independent env change and a Vercel
domain. The owner has the Buddy Club domain.

## Also fixed

- "activities/level: must be on the activity's ladder" on the Rally welcome: the owner's walking
  level was saved as a skill word before walking moved to the pace ladder, and re-sending it
  failed. The API now accepts a level that is unchanged from what is stored, whatever the ladder
  says, so a catalogue edit never locks a person out of saving (covered in `profiles.pg.test.ts`).

## Tests

- `buddies.pg.test.ts` (5): rating seed; buddies from check-ins; hello once and seen; block
  both ways, undisclosed, unblock, report; Find me gating, filters by sport, level, day, slot
  and area, and blocks. Search assertions are scoped to the run's accounts because the dev
  database has other findable people.
- `profiles.pg.test.ts` gains the unchanged-level case. `apps/web/lib/env.test.ts` covers the
  product switch.

## Racket sports only on the profile (owner, 2026-10-22)

The profile picker at `/profile/buddy` is the same six chips as the first run (`lib/sports.ts`),
with no type-ahead and no "suggest an activity"; `components/activity-search.tsx` is gone and
`saveActivities` drops anything that is not one of the six. The API still accepts the whole
catalogue so the parked product keeps working. Dev data was cleaned directly: every profile
activity, gear item and suggestion outside the six removed (one row: the owner's walking).
