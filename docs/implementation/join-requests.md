# Ask to join: discovery and invitations (2026-10-26)

**Status:** built, typechecked, linted, database suite green, web build green. Migration 19
applied to the cloud dev database. Not committed.

## The three ways into a club

1. **An invitation link** from the club's Members tab (unchanged).
2. **A public, open session** in Near you: Join makes a member and a regular (Addendum 1.5).
3. **A public, invitation-only session** in Near you: **Ask to join**. The request carries the
   person's name, sports and self-rated level. Organisers (anyone who may invite) see it on the
   dashboard and on the club's Members tab and approve or decline. Approval does what a link
   does, plus a place as a regular of the session asked about.

## Pieces

- Migration 19: `community.join_requests`, one pending per person per club (partial unique
  index); decided rows keep who and when.
- API (`modules/join-requests`): `POST /v1/sessions/:id/join-requests` (201 new, 200 if already
  pending; 409 for open sessions and for members; 404 for private ones), `GET /v1/me/join-requests`,
  `GET /v1/me/join-requests/inbox`, `GET /v1/organisations/:id/join-requests?status`,
  `POST .../join-requests/:id/approve|decline`. Audit rows and outbox events
  (`community.join_requested`, `community.join_decided`) for a future notification channel.
- Web: Ask to join / Asked on Near you rows with an "Asked." card after sending; "Asked to join"
  at the top of the Members tab with Approve and Decline; a dashboard card per club with people
  waiting.
- `join-requests.pg.test.ts` (2).

## Also today

- The welcome's role step is a single choice with Continue.
- A code sign-in is offered a password once (`/profile/password?first=1`); the profile links to
  it afterwards.

## Guest claim (ADR-008, same day)

- `GET /v1/guest/claim?token` and `POST /v1/guest/claim` in `modules/guest`; the 501 stubs are
  removed. `claim.pg.test.ts` (3).
- The guest view carries "Is this you? It's me", which goes through sign-in to `/claim/:token`,
  a page that says what will happen (club, name, nights kept) with "Yes, that's me".
- For Liz: open her guest link on her phone, tap "It's me", sign in or create an account, confirm.
  Her record becomes her account under her real name; the walk-in entry is gone.
