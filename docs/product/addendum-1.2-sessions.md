# Addendum 1.2: Sessions, hosts, schedule and ratings

**Date:** 2026-10-21 · **Against:** the codebase after Addendum 1.1 steps 1 and 3, presets and regulars (migration 13)
**Status:** Product direction from the owner, recorded with the implementation plan. Open points answered 2026-10-21 (section 6). All four steps built 2026-10-21: [step 1](../implementation/addendum-1.2-step-1.md) and [steps 2 to 4](../implementation/addendum-1.2-steps-2-4.md).
**Data:** everything in the database is dev/test data; no backfills or redirects are needed. Migrations stay additive by the standing rule.
**Rule:** Additive only. No table renames, no dropped migrations, existing endpoints keep working (Addendum 1.1 section 5).

## 1. The problem

Running a night in Rally today means filling in the session builder each time. The owner tried it
and found it harder than it should be. The fix is to set a session up once and then only decide,
each time, who is here and how we play tonight.

## 2. Decisions (owner, 2026-10-21)

| Topic                | Decision                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naming               | "Preset" becomes **Session** everywhere a user can see it. "Monday Pickleball" is a session. Each run is shown as "Monday Pickleball · Mon 27 Oct". No second noun in the UI. Code keeps `session_series` and `session_occurrences`.                             |
| What a session holds | Sport, venue, usual courts, duration, round length, default rules, regulars, default keep-apart pairs, hosts, weekly schedule, check-in window.                                                                                                                  |
| Schedule             | Weekly, day and time (Monday 7:30pm, Saturday 12pm). Shown as "Next: Mon 27 Oct, 7:30pm".                                                                                                                                                                        |
| Creating a night     | **On demand.** Whichever host or owner taps "Set up" first creates it. No background jobs.                                                                                                                                                                       |
| Hosts                | A session lists people who can run it. The generic name is **Host**. A host can set up and run any night of that session. The owner can switch host functionality on or off per session.                                                                         |
| Setting up a night   | Defaults are copied in, regulars are registered, then the host chooses tonight's format and ticks who is coming. Walk-ins are added by name on the night.                                                                                                        |
| Check-in             | Hosts can check anyone in at any time. Attendees can self-check-in only from 10 minutes before the start (a per-session default).                                                                                                                                |
| Ratings              | Attendees rate **the night**, never the host. Score 0 to 5, no free text. A positive score offers a multi-select of positive tags, a negative score offers negative tags. Shown as stars. Hosts and owners only ever see aggregates, never an individual rating. |

## 3. What already exists

- `session_series` already carries venue, duration, round minutes, default rules and an unused `recurrence_rrule` column. `session_occurrences` already freeze a copy of the rules per night (ADR-004), so a different format each week is supported by the data model.
- Regulars (migration 13) and `POST /v1/sessions/:seriesId/start` already register everyone; the Players screen has "Check everyone in" and walk-ins by name.
- Keep-apart exists as pair locks of kind `avoid`, but only per night.
- Self check-in exists (`POST /v1/occurrences/:id/check-ins` with no body checks the caller in) and is not time-gated.
- Permission to run a night is `session.manage` on the organisation. There is no per-session host list. The `session_organiser` role exists in the role enum and is otherwise unused.
- The social rules schema has no notion of a playing format. `rotation.format` is singles or doubles; the engine always produces a fair mix (what the owner calls round robin). King of the court does not exist.
- No ratings of any kind.

## 4. Changes

### 4.1 Data (one additive migration)

- `session_series`: `schedule_timezone text` (IANA name, saved from the browser), `check_in_window_minutes integer not null default 10`, `hosts_enabled boolean not null default true` (owner switch; when off, hosts are kept but have no extra permission). `recurrence_rrule` starts being written (weekly, one `BYDAY`, time in `DTSTART`).
- `activities.session_hosts (series_id, profile_id, added_by_profile_id, created_at, primary key (series_id, profile_id))`.
- `activities.session_keep_apart (series_id, participant_a, participant_b, created_by_profile_id, created_at, check (participant_a < participant_b), primary key (series_id, participant_a, participant_b))`. Copied onto each night as `avoid` pair locks at set-up.
- `activities.session_ratings (id, occurrence_id, rater_profile_id, score smallint check 0..5, tags text[] not null default '{}', created_at, unique (occurrence_id, rater_profile_id))`. Service role only; no RLS read policy for anyone.
- Partial unique index `session_occurrences (series_id, starts_at) where cancelled_at is null`, so two hosts tapping "Set up" at once cannot create the same night twice. The second tap gets the existing night.

### 4.2 Rules schema

- `rotation.mode: 'mix' | 'king_of_the_court'`, default `mix`, which is today's behaviour. Bump `RULESET_SCHEMA_VERSION`; old rows stay valid because the field defaults.
- King of the court needs match results on social rounds (winners move up a court, losers move down). That is the B9 gap from the mobile UI pass and is its own step (section 5). The restructure does not wait for it.

### 4.3 API

- `PATCH /v1/sessions/:seriesId` accepts `schedule: { weekday, time } | null`, `timezone`, `checkInWindowMinutes`, `defaultRules`.
- Series read model gains `nextAt` (computed from the rrule at read time, never stored), `hosts`, `keepApart`, `checkInWindowMinutes`, `nextOccurrenceId` when the next date is already set up, and `ratingSummary` for the series.
- `GET/PUT /v1/sessions/:seriesId/hosts` and `GET/PUT /v1/sessions/:seriesId/keep-apart`, same shape as regulars. Only the owner (series creator) and organisation `session.manage` holders may change hosts, the `hostsEnabled` switch or the session itself. Hosts run nights; they do not edit the session. (Confirmed 2026-10-21.)
- `POST /v1/sessions/:seriesId/start` learns `startsAt` (defaults to now, as today) and copies keep-apart pairs as pair locks. "Set up" is this call with the next scheduled date; the created night is `open` straight away so regulars can see it as upcoming. Rules and round minutes can be overridden in the same call, as now.
- Permission check `session.manage` on an occurrence becomes: organisation `session.manage` **or** host of the occurrence's series while the series has `hostsEnabled`. One helper, used by every occurrence and round command.
- Self check-in rejects with 409 before `startsAt - checkInWindowMinutes`, with the time it opens in the error. Host check-ins are never gated.
- `POST /v1/occurrences/:id/ratings` body `{ score, tags }`; only for a completed night, only for a profile whose entry was `checked_in`, once per person, within 7 days of completion. Tags must match the sign of the score (section 4.5).
- `GET /v1/occurrences/:id/ratings/summary` and the series summary return `{ count, average, tags: { tag: count } }` and return `count` only (no average, no tags) until at least 3 people have rated, so a single rating cannot be read back. There is deliberately no list endpoint.
- `GET /v1/me/ratings/pending`: completed nights the caller attended and has not rated, for the dashboard prompt.

### 4.4 Web (Rally host)

- Rename: "Presets" becomes "Sessions" in the dashboard strip, `/start`, cards and onboarding step 3. Routes: the series page moves to `/sessions/:seriesId`. Nights keep `/sessions/:occurrenceId/*` (the shared night screens, QR, board and guest links all hang off it); the one segment serves either, since both are "sessions" to the person using the app. The date-based night URL from the first draft was dropped as a large move for no visible gain. Old `/presets/*` links are not preserved (dev data only, confirmed 2026-10-21).
- Session page, one scroll: header with "Next: Mon 27 Oct, 7:30pm" and the single action (**Set up** / **Open tonight's** / **Live now**); Schedule; Defaults (courts, duration, round minutes, format); Regulars; Keep apart; Hosts (add from club members); Past nights with the rating summary.
- Set-up screen (after "Set up", before players): tonight's format (Mix / King of the court once built), round minutes, courts in play, then the regulars list with everyone ticked and a "who's not coming" untick, then "Add walk-in". Ends on the existing Players screen.
- Players screen: a "Check-in opens at 7:20pm" line until the window opens; self check-in on `/join/:code` and `/sessions/.../me` shows the same.
- Dashboard: "Your sessions" cards show the next date, the action state and host avatars. A "How was Monday?" card appears for any unrated night the user attended.
- Rating sheet: five stars (tap none to all, giving 0 to 5), then the matching tag chips, then Done. No text field. Completed-night screen shows the aggregate to hosts only once 3 or more ratings exist.

### 4.5 Rating tags (first vocabulary, in `shared-types`)

Score 3 to 5 stars is positive, 0 to 2 negative. (Confirmed 2026-10-21.)

- Positive: Good mix of players · Right level for me · Fair rest · Well organised · Good courts · Right pace · Friendly crowd
- Negative: Too much sitting out · Levels too uneven · Started late · Too crowded · Courts not great · Rounds too short · Rounds too long · Felt disorganised

## 5. Order of work

1. **Sessions and hosts.** Migration, hosts table and permission helper, schedule and `nextAt`, "Set up" via `start` with a date, rename and the new session page and set-up screen. Tests: host can open and run a night in a club where they are a plain member; two concurrent set-ups yield one night; `nextAt` across a DST change in Europe/London.
2. **Night defaults.** Keep-apart defaults copied as pair locks; check-in window on self check-in with the UI line. Tests: avoid locks present on a fresh night; self check-in refused at T-11 min and accepted at T-10.
3. **Ratings.** Table, endpoints, dashboard prompt, rating sheet, summaries. Tests: one rating per person, attendee only, summary withheld under 3 ratings, tags validated against the score, no endpoint ever returns a row.
4. **Formats.** `rotation.mode`, match results on social rounds (B9), king of the court in the engine and the live screen. Largest and most separable; last.

Each step is additive and shippable alone. Buddy Club is unaffected: the "Powered by Rally" link (ADR-018) continues to point at the night.

## 6. Open points, answered by the owner (2026-10-21)

- Hosts run nights; the owner and club admins edit the session and the host list. **Yes**, plus a per-session switch so an owner can turn host functionality off.
- Night URLs as `/sessions/:seriesId/:date`. **Yes**; no redirects, all data is dev/test.
- 0 to 5 scale with 3 and above positive, shown as **stars**. Tag lists as drafted.
- Guests without an account do not rate. **Yes.**
