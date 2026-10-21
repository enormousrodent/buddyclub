# Addendum 1.2, steps 2 to 4: night defaults, ratings and formats (2026-10-21)

**Status:** Built and tested against the cloud dev database. Not yet committed or deployed.
**Plan:** [`../product/addendum-1.2-sessions.md`](../product/addendum-1.2-sessions.md), section 5.
**Before this:** [`addendum-1.2-step-1.md`](addendum-1.2-step-1.md). No new migration: the tables
from migration 14 and the league results table carry everything here.

## Step 2: keep-apart defaults and the check-in window

- A session keeps **pairs who never share a court**. They are copied onto a night as `avoid`
  pair locks whenever a player arrives on it: at set-up (regulars), on a walk-in or club player
  being added, and on self check-in. A pair is copied once; the organiser can still release or
  add locks on the night as before.
- **Self check-in opens** `checkInWindowMinutes` before the start (default 10; set on the
  session). Before that an attendee gets a 409 whose detail says when it opens. Organisers and
  hosts check anyone in at any time. The board and the personal schedule carry
  `checkInOpensAt`; the Players and My game screens show "Check-in opens at 19:20" instead of
  the button until then.
- API: `GET/PUT /v1/sessions/:seriesId/keep-apart` (organisers set; pairs normalised so A/B and
  B/A are one row; strangers rejected). Session page: "Keep apart" section with two pickers.

## Step 3: ratings

- Attendees with an account rate a **completed night once**, within 7 days: 0 to 5 stars and
  tags from a fixed list (positive tags from 3 stars, negative below; a mismatch is a 400).
  Only people who checked in (or left after checking in) may rate; the organiser who ran it but
  was not on the roster cannot. Guests without accounts cannot. No free text anywhere.
- **Nobody reads a single rating.** The only reads are aggregates: count always, average and tag
  counts only from 3 ratings. The caller sees their own rating. The audit trail records that a
  rating was given, not what it was. There is no list endpoint and no RLS read policy.
- API: `POST /v1/occurrences/:id/ratings`, `GET /v1/occurrences/:id/ratings/summary`,
  `GET /v1/sessions/:seriesId/ratings/summary`, `GET /v1/me/ratings/pending`.
- Web: `/sessions/:id/rate` (stars, then tag chips, then Done; `components/rating-form.tsx`);
  a "How was Monday Pickleball on Mon 27 Oct?" card on the Rally home for a week; the completed
  night shows "Rate the night" to attendees and the aggregate (or "2 so far, shown from 3") to
  organisers and hosts; the session page shows the running average over its nights.
- Tag vocabulary lives in `shared-types` (`RATING_TAGS`), so the API validates and the web
  renders from one list.

## Step 4: formats and king of the court

- The social rules gain `rotation.mode: 'mix' | 'king_of_the_court'`, defaulted, so stored
  rules keep parsing and the schema version stays at 1.
- **Per night:** "Set up" and "Start now" accept `mode` (and `roundMinutes`); a host can switch
  the format on the Players screen until the first round is called, after which a 409 locks
  it. The session's usual format is a select in its Defaults. The night shows a "King of the
  court" badge.
- **Results on social matches:** `POST /v1/occurrences/:id/matches/:matchId/result` with
  `winnerSide` 1, 2 or null (clear). Stored as a confirmed revision in `matches.result_revisions`,
  the league results table, so nothing new is append-only-exempt. Allowed once a round is in
  progress, paused or completed; organisers and hosts only. Rounds and boards carry
  `winnerSide` per court, and court cards show two "who won" buttons to those who may record.
- **Movement** (`rotation-engine/src/king-of-the-court.ts`, pure, 6 unit tests): courts are
  ranked by the night's court order. Winners move up a court, losers move down, teams stay
  together. On the top court the winners stay. On the bottom court the losers step off when
  players are waiting (rest priority: longest wait first) and the waiting players come on.
  Someone who went home is replaced from the waiting list; a court that cannot be filled is
  dropped with a warning. A match without a recorded result counts side 1 as the winner, with a
  `RESULT_MISSING` warning, so the night keeps moving. The first round of a king-of-the-court
  night is the normal fair mix.

## Tests

- `test/addendum12.pg.test.ts`: keep-apart saved, duplicate order collapsed, stranger refused,
  non-organiser refused; copied onto a set-up night; early self check-in refused with the
  opening time, `checkInOpensAt` on the board, organiser check-in allowed; a king-of-the-court
  night: mode and round minutes on start, self check-in open when started now, avoid lock
  arriving with the players, round 1 mixed, format locked after a round, result refused before
  the round starts and from a player, result recorded and visible, round 2 placed exactly by
  the result (winners stay with the two who rested, losers rest); ratings: once per person,
  non-attendee refused, tag/score mismatch refused, summary withheld under 3 then shown with
  average 3.3 and tag counts, pending list empties, series summary.
- Phase 2 keeps its member self check-in by setting a two-hour window on its session, since
  its night starts in an hour. Phase 2, phase 3, addendum 1.1 and the step 1 suites pass:
  34 database tests in all this evening, 34 hermetic API tests, 24 rotation-engine tests.

## Not done

- The Players screen shows avoid pairs from the night's locks (unchanged). The session page
  does not yet warn when a keep-apart pair are both regulars but one is not a club member.
- No visual check in a browser; typecheck, lint and tests only.
