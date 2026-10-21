# Addendum 1.2, step 1: sessions, hosts and the weekly schedule (2026-10-21)

**Status:** Built and tested against the cloud dev database. Not yet committed or deployed.
**Plan:** [`../product/addendum-1.2-sessions.md`](../product/addendum-1.2-sessions.md), section 5 step 1.

## What changed for the person using Rally

- "Presets" are now **Sessions**. A session is the thing you set up once ("Monday Pickleball");
  each run is shown as the session name plus a date. Same card on the dashboard strip and the
  Start page, now with the next date instead of the last run.
- A session has a **weekly schedule** (day, time, the browser's time zone), a **check-in
  window** (default 10 minutes; enforced in step 2) and, in a club, **hosts** with an owner
  switch to turn hosting off.
- The one action on a session is always the next thing to do: "Open tonight's" when a night is
  on, "Open Mon 27 Oct" when the next night is already set up, "Set up Mon 27 Oct" when the
  schedule says so, "Start now" otherwise. Setting up lands on Players, with the regulars
  registered, to tick who is coming and add walk-ins.
- Hosts see the session (schedule, hosts, regulars, nights) read-only and run its nights with
  the same screens as an organiser. They cannot edit the session or the host list.
- Two hosts tapping "Set up" for the same night get the same night.

## Data (migration 14, `20261021001400_addendum_1_2_sessions.sql`)

Additive. `session_series` gains `schedule_weekday`, `schedule_time`, `schedule_timezone`
(all three or none), `check_in_window_minutes` and `hosts_enabled`. New tables
`activities.session_hosts`, `activities.session_keep_apart` (step 2) and
`activities.session_ratings` (step 3). Partial unique index on
`session_occurrences (series_id, starts_at) where cancelled_at is null`.

Applied to the cloud dev project directly (same way as migrations 4 to 13). The CLI migration
history there still lists only the first three, so `db push` must not be used until the history
is repaired.

## API

- `SessionSeries` gains `schedule`, `nextAt` (computed on every read from the schedule, never
  stored; a night under way still counts as "next" until it ends), `checkInWindowMinutes`,
  `hostsEnabled`, `canRun`, `canEdit`. Create and PATCH accept `schedule` (PATCH takes `null`
  to clear), `checkInWindowMinutes` and `hostsEnabled`. Unknown zones are a 400.
- `GET/PUT /v1/sessions/:seriesId/hosts`. Hosts must be active members; only organisation
  `session.manage` holders change the list.
- `POST /v1/sessions/:seriesId/start` is "Set up" when given `startsAt`. It copies the defaults,
  registers the regulars and opens the night. A duplicate start for the same series and time
  returns the existing night with 200 instead of 201.
- Permission: the actor now carries `hostedSeries` (series the person hosts whose switch is
  on). `assertManageSeries` replaces `assertOrgAction(..., 'session.manage')` for everything
  done to a night: create, update, open, complete, cancel, roster, pair locks, rotation,
  rounds, public access. Series edits, regulars and hosts stay organiser-only.
- `Board.canManage` tells the web what the viewer may do; `MySession.canManage` and
  `/v1/me/presets` include hosted sessions (`asHost`, `hosts`, `nextAt`, `schedule`,
  `upcomingOccurrenceId`). "Live now" on a card means live, or open and within three hours of
  the start, so a night set up days ahead shows as upcoming.
- Schedule maths in `modules/sessions/schedule.ts`, with hermetic tests for both London clock
  changes and a zone east of UTC.

## Web

- `/sessions/:id` serves a session when the id is a series and a night when it is an
  occurrence (`resolve-series.ts`); night screens, QR, board and guest links are unchanged.
  `/presets/*` is gone. The invite page moved to `/sessions/:seriesId/invite`.
- `series-page.tsx`: next date and action, coming up, schedule form (with a hidden browser
  time zone that is kept once set), hosts (members who cannot already run sessions by role),
  regulars, defaults, past nights. `series-actions.ts` holds the server actions.
- `components/session-card.tsx` replaces `preset-card.tsx`; `SessionAction` is shared with the
  session page header. `lib/sessions.ts` has the "happening now / upcoming" rules and the
  zone-aware date formatter.
- The night shell takes `canManage` from the board instead of the club role.

## Tests

- `test/schedule.test.ts` (hermetic, 6 tests).
- `test/hosts.pg.test.ts`: club with two plain members, schedule and `nextAt`, bad zone, a
  member refused until made a host, non-organiser cannot set hosts, host sets up the next night
  and the owner's duplicate set-up returns the same night, host runs it (walk-in) while the
  other member is refused, switch off removes the ability but keeps the list, clearing the
  schedule clears `nextAt`.
- Phase 2, Addendum 1.1 steps 1 and 3, and regulars suites still pass (20 database tests in
  all), so the permission swap did not change what organisers can do.

## Not in this step

- Keep-apart defaults copied onto nights and the check-in window on self check-in (step 2).
- Ratings (step 3). The table exists; nothing reads or writes it yet.
- Choosing a format per night and king of the court (step 4).
