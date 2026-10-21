# Addendum 1.3: buddy profiles, onboarding and finding people

**Date:** 2026-10-21 · **Against:** the codebase after Addendum 1.2
**Status:** Owner direction, recorded with a proposed plan. Open points in section 6. Not started.
**Rule:** Additive only, as before. Rally is untouched except where it reads a level.

## 1. The ask (owner, 2026-10-21)

Buddy Club is not only about finding communities. It is about finding people: someone to play
the sport or do the activity I like, or people going to a gathering I am interested in. The
first thing to sort out is onboarding, where a person says what they are into, which days they
are free for each activity, what level they think they are at for it, and what gear they own
for it. Gear is useful to other buddies and a bit of fun. That social space comes first.

## 2. What exists

- One profile per account (`identity.user_profiles`): display name, photo, locale. Nothing about
  interests, level, availability, place or visibility.
- A per-club player record (`identity.participants`) carries `skill_rating` and opt-in declared
  attributes for Rally's rotation. It is per club, not the person's own view of themselves, and
  it is never shown to other members.
- Interests are seeded (`community.interests`: sports, racket_sports, running, books, ...) and
  sports are seeded separately (`community.sports`: tennis, pickleball, badminton, padel, squash,
  table_tennis). The homepage and Explore already use them.
- Rally's onboarding asks for sports, but keeps the answer in a cookie because the API has no
  field for it. Buddy Club has no onboarding at all: sign in and you land on discovery.
- Discovery finds public groups and gatherings by interest, text and locality. It never returns
  people. A gathering's RSVPs are `going` only; there is no "interested".
- The product boundary (Addendum 1.1) requires age-appropriate safeguards and no child profiles
  public by default, and keeps Rally free of people search.

## 3. Decisions proposed

| Topic                 | Proposal                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activities            | A person picks interests from the seeded list. A racket sport is picked as the sport itself (Tennis, Pickleball, ...), so a profile can hold "Tennis" and "Books" side by side.                                                                                                                                                             |
| Level                 | Five words, the same for every activity, with an activity-specific hint under each: **Just starting**, **Getting going**, **Comfortable**, **Strong**, **Expert**. Self-rated, editable any time. Rally keeps its own numeric rating per club; a club organiser may copy the self-rating in as a starting point, never the other way round. |
| Availability          | Per activity: the days of the week, and for each a rough time (morning, afternoon, evening). Enough to answer "who is free on Thursday evenings", not a diary.                                                                                                                                                                              |
| Gear                  | Per activity, a short list: name, optional one-line note ("Babolat Pure Drive, 2023"), optional photo. Public to whoever can see the profile. Shown as a small shelf on the profile; the fun part.                                                                                                                                          |
| Place                 | A locality, the same free-text town or area groups use. Never a precise location.                                                                                                                                                                                                                                                           |
| Visibility            | Two settings, both off by default: **Find me** (discoverable to signed-in members by activity and locality) and **Show my gear**. A profile is always visible to people in the same group and to fellow attendees of a gathering, with level and days but without gear unless shown.                                                        |
| Age                   | Turning on Find me requires confirming you are 18 or over. The product boundary rules out public child profiles; this is the cheapest way to honour it until verification exists.                                                                                                                                                           |
| Finding people        | Signed-in only. **Buddies** page: filter by activity, level, day, locality. Results are cards: name, photo, locality, the matching activity with level and days, gear count. Anonymous visitors see groups and gatherings as today, never people.                                                                                           |
| People at a gathering | Members and attendees see who is going, with each person's level for that activity. A new **Interested** RSVP alongside Going, so "find people in an event I am interested in" works before committing.                                                                                                                                     |
| Contact               | A **Say hi** request with a one-line message. Accepting makes you buddies: you appear in each other's buddy list and can be invited to gatherings with one tap. No free-form messaging in this addendum; a request is the only text one person can send another, and the recipient must accept before anything else happens.                |
| Safety                | Block and report exist from day one of people discovery. A blocked person never sees you in results or at a gathering. Reports go to a table an admin reads; no automation yet.                                                                                                                                                             |
| Onboarding            | First sign-in on Buddy Club, four screens, each skippable: who you are (name, photo, locality), what you are into, level and days per activity, gear. Then the visibility choice as a single clear screen. Everything is editable from the profile afterwards.                                                                              |

## 4. Changes

### 4.1 Data (one additive migration)

- `identity.user_profiles`: `locality text`, `bio text (160)`, `discoverable boolean default false`,
  `show_gear boolean default false`, `adult_confirmed_at timestamptz`, `onboarded_at timestamptz`.
- `identity.profile_activities (profile_id, interest_id, sport_id null, level text, days jsonb,
note text, created_at, updated_at, primary key (profile_id, interest_id, coalesce(sport_id,'')))`.
  `days` is `{ "mon": ["evening"], "thu": ["morning","evening"] }`.
- `identity.profile_gear (id, profile_id, interest_id, sport_id null, name, detail, photo_url,
sort_order, created_at)`.
- `identity.buddy_requests (id, from_profile_id, to_profile_id, message, state: pending |
accepted | declined, created_at, decided_at)` and `identity.buddies (profile_a, profile_b,
created_at, check (a < b))`.
- `identity.blocks (blocker_profile_id, blocked_profile_id, created_at)` and
  `platform.reports (id, reporter_profile_id, subject_profile_id, reason, detail, created_at,
resolved_at)`.
- `community.activity_rsvps.status` gains `interested`.
- RLS stays deny-by-default; the API is the only reader. Discovery queries filter by
  `discoverable`, `adult_confirmed_at is not null` and the blocks table in both directions.

### 4.2 API

- `GET/PATCH /v1/me/profile` (the new fields), `PUT /v1/me/activities`, `PUT /v1/me/gear`,
  `POST /v1/me/onboarded`.
- `GET /v1/profiles/:id` with the visibility rules applied server-side.
- `GET /v1/buddies/search?interest=&sport=&level=&day=&locality=`, signed-in only.
- `POST /v1/buddies/requests`, `POST /v1/buddies/requests/:id/accept|decline`, `GET /v1/me/buddies`.
- `POST /v1/profiles/:id/block`, `DELETE ...`, `POST /v1/profiles/:id/report`.
- `GET /v1/community/activities/:id/people` for members and attendees.
- Rally: `PATCH /v1/organisations/:orgId/participants/:id` may take `skillFromProfile: true` for
  an organiser to seed the club rating from the person's self-rating.

### 4.3 Web (Buddy Club host)

- `/welcome` on first sign-in, five screens, each with Skip. Sets `onboarded_at` at the end.
- `/profile` grows tabs: About, Activities, Gear, Visibility.
- `/buddies` (search and results) and `/buddies/:id` (a profile as others see it, with Say hi,
  block, report). `/me/buddies` for requests and the list.
- Gathering page: Going and Interested lists with levels, and the Interested button.
- Home gets a "Buddies free this week" strip once the person has activities with days set.

## 5. Order of work

1. **Profile and onboarding.** Migration, profile fields, activities with level and days, gear,
   the welcome flow, the profile tabs. Nothing is visible to anyone else yet.
2. **People.** Visibility settings with the age confirmation, buddy search, profile view, people
   at a gathering with Interested, block and report.
3. **Buddies.** Say hi, accept or decline, buddy list, invite a buddy to a gathering.
4. **Rally link.** Organiser seeds a club rating from the self-rating.

Each step ships alone. Step 2 is the one with rules in it; nothing in step 1 exposes anything.

## 6. Open points for the owner

- The five level words, and whether tennis should instead use a familiar scale (NTRP-style
  numbers) with the words elsewhere.
- Availability as days with morning, afternoon, evening. Enough, or do you want hours?
- Find me off by default and 18+ to switch it on. Agreed?
- Say hi as the only text between strangers, with acceptance before anything else. Agreed, or
  do you want messaging in this addendum?
- Gear photos now, or names and notes first with photos later?
