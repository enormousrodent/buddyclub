# Addendum 1.5: the session is the group, built (2026-10-22)

**Direction:** [`../product/addendum-1.5-sessions-are-the-group.md`](../product/addendum-1.5-sessions-are-the-group.md).
**Status:** built, typechecked, linted, hermetic and database suites green, web build green. Not
opened in a browser. Not committed. Migration 18 applied to the cloud dev database, and the
three dev groups deleted with their members and interests.

## Database and API

- **Migration 18** (`20261022001800_addendum_1_5_sessions_public.sql`): `visibility`
  (`private` default), `join_policy` (`invite` default) and `locality` on
  `activities.session_series`, with a partial index for the public listing.
- `SessionSeries` carries the three fields; create and update bodies accept them.
- `GET /v1/public/sessions?q&locality&sport` (no account needed, 30 s cache): public,
  unarchived sessions with club, sport, venue or area, schedule, next date, join policy and
  regulars count. Place matches the session's area, then the venue name, then the club name.
- `POST /v1/sessions/:id/join`: open and public (or the caller already a member of the club for
  the policy check, or an organiser) → club membership as participant if needed, a player
  record (seeded from the self-rated level as before), a place on the regulars, an audit row.
  Idempotent. 403 otherwise with a message saying to ask for a link.
- `public-sessions.pg.test.ts` (2): defaults, invitation-only is seen but not joinable, open is
  found by place and sport and joined by a stranger once.

## Web

- Tabs: Home, Sessions, Buddies, Profile.
- Removed: `groups`, `activities`, `community-actions.ts`, the club's Groups tab and page.
  `components/discover.tsx` stays because the parked Buddy Club home still imports it.
- `/explore` is "Near you": search by name, area and sport; Join on open sessions when signed
  in, "Invite only" otherwise, "Open" when already a member. Joining lands on the session page.
- The club overview shows Sessions (schedule, next date, visibility; Configure for organisers;
  New session for those who may run one), Coming up, and the last eight nights Played, with the
  full history on the All nights tab.
- The session page's Defaults form gains About, Who can see it, Who can join, and Town or area.

## Not done

- No public session page for a signed-out visitor; the Near you row carries what they need and
  sign-in leads back to it.
- Capacity on a session (a group feature) was not carried over; nobody had used it.
