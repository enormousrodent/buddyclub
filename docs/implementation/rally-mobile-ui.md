# Rally mobile UI in the web app (2026-10-20, evening)

**Status:** First pass implemented in `apps/web`; the Expo build will reproduce these screens.  
**Design:** canvas "Rally app screens" (27 boards). Night-court brand: navy ground, lime actions,
Barlow Condensed display, Poppins body; dark by default on the Rally host.

## Screens built, by flow

| Design | Route (Rally host)                  | Notes                                                                                                                       |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A1     | `/dashboard` signed out             | Welcome: logo, "Run the session", Get started, join by code.                                                                |
| A2, A3 | `/sign-in`                          | Email link first; password and account creation behind links; "Check your email" state with resend.                         |
| A4–A6  | `/welcome?step=1..3`                | Name + sports (sports kept in a cookie until the API has a field), organiser or player, usual-night preset via `/start`.    |
| B1     | `/dashboard` signed in              | Resume card, Start a session, presets strip, Tonight and upcoming, real competition rows, empty state (F3).                 |
| B2, B3 | `/start`                            | Unchanged flow, Rally type and tokens.                                                                                      |
| B4     | `/sessions/:id/players`             | Here / expected / gone groups, keep-apart shown under names, walk-in and club-player add, "Call the first round".           |
| B5     | `/sessions/:id/share`               | Public access toggle, QR, the code in display type, TV board link, guest links.                                             |
| B6     | `/sessions/:id/pairings`            | Keep apart first in the rule list; one rule per save.                                                                       |
| B7     | `/sessions/:id` (Call round N)      | Rotation preview and publish ("Call round", "Reshuffle").                                                                   |
| B8     | `/sessions/:id`                     | Live round: timer hero, pause/resume, end round, courts, resting, warnings. "+2 min" waits on an API for extending a round. |
| B10    | `/sessions/:id` when completed      | Rounds, players, minutes; the rest of the summary (minutes per player) waits on a stats endpoint.                           |
| C1     | `/join/:code`                       | Code shown large; sign-in to check in. Self-service guest joining follows ADR-008.                                          |
| C2, C3 | `/sessions/:id/me`, `/guest/:token` | Lime-bordered court card, With / Against, next up, resting state, offline banner.                                           |
| D1     | `/board/:code`                      | Courts, timer, resting, next round, and a join panel with QR and code.                                                      |
| E1–E3  | `/league/*`                         | Existing pages in the Rally tokens; layout polish is a later pass.                                                          |
| F1     | `/profile`                          | Appearance control; sports and level shown once the API stores them.                                                        |
| F2     | session screens                     | Offline banner (client-side `online`/`offline` events).                                                                     |

Not built: B9 optional scores for social rounds (needs a results endpoint for social matches),
C4 "keep tonight's games" (guest claim, ADR-008), "+2 min" on a running round.

## Presets and regulars (2026-10-21)

A preset is a session series. `/start` lists presets first (one tap each) and the builder below
it; the builder's "Start it now" switch, off, saves a preset and lands on its page. The preset page
(`/presets/:seriesId`) holds name and timings and the **regulars**: club players ticked there are
registered on every session started from the preset (migration 13, `GET/PUT
/v1/sessions/:id/regulars`, `POST /v1/sessions/:id/start` registers them). The Players screen
gains "Check everyone in". Profile photos: migration 12, `avatarUrl` on `PATCH /v1/me` and on
roster entries, upload from the browser to the `avatars` bucket.

## Structure

- `app/rally/(marketing)`: front page, own header and footer, `.theme-night`.
- `app/rally/(app)`: dashboard, start, welcome, under the app shell with the Rally tab bar.
- `app/shared/sessions/[occurrenceId]/`: `session-shell.tsx` loads the board once per screen and
  draws the frame (title, meta, segmented tabs); `page.tsx` (Live), `players/`, `pairings/`,
  `share/`, `me/`.
- `components/rally-kit.tsx` (Kicker, StatTile, SessionTabs), `components/offline-banner.tsx`.

## Verification

Typecheck, lint, Prettier and `next build` green. Signed-out routes rendered on the local Rally
host: welcome, sign-in, join, board with the join panel. Signed-in screens exercised through the
build and types only; walk them on the deployed site with the demo club.
