# Activity catalogue: built (2026-10-22)

**Design:** the owner's "Buddy Club activity catalogue" document (2026-10-22), implemented in
full. **Runbook:** [`../runbooks/activity-catalogue.md`](../runbooks/activity-catalogue.md).
**Status:** built and tested against the cloud dev database; migration 16 applied there. Not
committed.

## What changed

- **One catalogue file.** `packages/shared-types/src/catalogue.json` holds 28 categories, 178
  activities and the named level sets (`skill`, `fitness`, `pace`, `none`). `catalogue.ts`
  parses it with zod and exposes `CATALOGUE`, `featured()`, `levelsFor()`, `isValidLevel()`,
  `levelLabel()`, `matchActivity()`, `searchActivities()` and `normaliseName()`. The old
  five-step `ACTIVITY_LEVELS` is gone; the same five ids are the `skill` set.
- **The activity is the unit.** `community.sports` is now the activity table: every row has a
  `category_id` into `community.interests`, which keeps the categories. Profile activities and
  gear always name an activity; the few interest-only rows moved to the same-named activity.
  Level is validated by the API against the activity's ladder, not by a database list, so a new
  ladder ships without a migration.
- **Ladders per activity.** Tennis and padel use `skill`; gym, running, swimming and cycling
  use `fitness`; walking uses `pace`; scuba, sailing, kayaking, paragliding and skydiving carry
  certification lists; climbing, skiing, snowboarding and the belt arts carry grades; golf is a
  handicap from 0 to 54; books and the like have no picker.
- **Twelve featured tiles** (walking, running, gym, cycling, swimming, football, golf, tennis,
  badminton, padel, pickleball, yoga), capped by test. Everything else is behind a type-ahead
  over names, ids and aliases ("ping pong", "D&D", "parkrun").
- **Not got your activity?** A typed name is matched first; a hit is simply added. A miss is
  stored in `identity.activity_suggestions` and put on the profile as `other` under that name,
  so nobody is blocked. The count of people asking is shown. Suggestions stay out of search and
  off anyone else's profile.
- **Promotion** is a catalogue edit plus the seed script. `scripts/seed-catalogue.ts` upserts
  categories and activities by id, never deletes, and for a newly inserted activity that people
  had asked for: moves their `other` entries to the real activity (level, days and note kept),
  marks the suggestions promoted, and writes one `catalogue.activity_promoted` outbox event per
  person. There is no notification channel yet; that event is where one will hang.
- **Rally, groups and leagues** list only racket sports: `/v1/sports?category=racket_sports`,
  and the client's `sports('racket_sports')`. The six original racket sports keep their ids and
  players per side.

## Decisions taken on the document's open questions

- "Trackable" means pick it, rate it, say when you are free. Logging sessions or results is
  separate work.
- A sport may carry its own ladder from day one (the catalogue allows an inline `levels` on any
  activity).
- Promotion is a person's decision: edit the flag, run the seed. No automatic threshold. The
  runbook query lists candidates by profile count and suggestion count.

## Guard rails

- `catalogue.test.ts` (10 tests): stable ids against `catalogue-ids.json`, unique ids, known
  categories, ladders resolve, featured cap, the six racket sports, level validation across
  every ladder kind, name matching, search order.
- `profiles.pg.test.ts` first case: the table holds every catalogue activity and category with
  the same name and category, so the file and the database cannot drift once seeded.
- CI already runs lint, typecheck and the hermetic suites; the database suites run with
  `TEST_DATABASE_URL`.

## Tests run

All hermetic suites (133 tests) and, against the cloud project, the profile, me, hosts,
Addendum 1.2 and Addendum 1.1 step 3 suites (22 tests).
