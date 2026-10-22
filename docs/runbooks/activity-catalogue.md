# Runbook: the activity catalogue

The catalogue is `packages/shared-types/src/catalogue.json`. It is the only place a category,
an activity or a level ladder is defined. The database is seeded from it, the API validates
levels against it, and the web renders tiles, search and pickers from it. Design:
docs/product "Buddy Club activity catalogue" (2026-10-22).

## Add an activity

1. Add one object to `activities`: `id` (lowercase snake_case, 2 to 32 characters, never to
   change), `name`, `category` (an id from `categories`), `levels` (a named set such as
   `skill`, `fitness`, `pace`, `none`, or an inline `certification`, `grade` or `handicap`
   ladder). Optional: `aliases` (other words people type), `playersPerSide` (racket sports).
2. Run the shared-types tests: `pnpm --filter @buddyclub/shared-types test`. They fail if an id
   that shipped before is missing or the featured set is over 12.
3. Seed the database: from `apps/platform-api`,
   `node --env-file=.env --import tsx scripts/seed-catalogue.ts`. It upserts by id and never
   deletes. A newly inserted activity that people had asked for is promoted (below).
4. Deploy. Pictogram and swatch fall back to the category's, so nothing else is needed.

## Promote an activity to a tile

Set `featured: true` (and a `tier`, 1 first) and deploy. Demote by removing the flag; existing
profiles keep the activity. The web shows at most 12 tiles.

## Give an activity a proper ladder

Change `levels`. Stored values stay in the database as text; a value no longer on the ladder is
still shown, and the next save from the person replaces it. If you rename option ids, map the
old values with a one-line SQL update at the same time.

## Find what to promote next

Run against the database. Picked activity ids first, then open suggestions.

```sql
-- Non-featured activities people have added to their profiles, most first
select s.id, s.name, count(*) as people
from identity.profile_activities p
join community.sports s on s.id = p.sport_id
where p.sport_id <> 'other'
group by s.id, s.name
order by people desc, s.name
limit 30;

-- Open suggestions: what people typed that we do not have, most asked first
select key, min(name) as example, count(distinct profile_id) as people, min(created_at) as first_asked
from identity.activity_suggestions
where promoted_to is null
group by key
order by people desc, first_asked
limit 30;
```

Cross the first list with the catalogue's `featured` flags by hand; the shared-types test keeps
the featured set at 12 or fewer.

## Promotion of a suggestion

Add the activity to the catalogue with the suggested name (or the name as an alias) and run the
seed script. For every person who asked: their `other` profile entry becomes the real activity
with level, days and note kept, the suggestion is marked `promoted_to`, and an outbox event
`catalogue.activity_promoted` is written per person. There is no notification channel yet; the
event is where one will hang.

## Guard rails

- `catalogue.test.ts`: stable ids against `catalogue-ids.json`, featured cap, ladders resolve,
  racket sports keep their players per side.
- `profiles.pg.test.ts` first case: the table holds every catalogue activity and category, so
  the file and the database cannot drift once the seed has run.
- The API rejects a level that is not on the activity's ladder (400) and an unknown activity id.
- Suggestions never appear in search or on profiles other than the suggester's.
