# ADR-016: Public boards and QR registration

**Status:** Accepted 2026-10-20 (Phase 4)  
**Date:** 2026-10-20

## Context

Venue screens, spectators and QR check-in need a view of a session or meet without a club
account. The spec requires public views to be server-filtered projections (section 11), forbids
exposing guest records through an unrestricted event QR, and keeps guest claim behind
organiser-approved proof (ADR-008). RLS grants nothing to `anon` (ADR-011).

## Decision

1. **Opt-in per event.** A meet or session occurrence gets a random 10-character slug only when an
   organiser enables public access; disabling drops the slug, so old codes stop working. The slug
   is the only identifier a public caller ever sees.
2. **One redacted projection, served by the API.** `GET /v1/public/events/:slug/board` is built
   by the API with service credentials from the same read models the app uses, then filtered by
   hand: team names, courts, scores, standings, round and timer; display names only on social
   session court boards (they are what the hall screen is for); no internal ids, no guest links,
   no contact or profile data. Responses are cacheable for five seconds and rate limited.
3. **QR registration for members only.** `POST /v1/public/events/:slug/join` requires a signed-in
   club member and registers or checks them in, creating their participant record if needed.
   Non-members are refused with guidance to ask the organiser, who can add them as a walk-in and
   hand out a guest link (Phase 1). Guest self-claim stays closed until ADR-008 is decided.
4. **Web pages without app chrome.** `/board/:slug` (night-court theme at TV size, polling) and
   `/join/:slug` (landing with one action) are served from `app/public` on both hosts.

## Consequences

- No RLS change; the public surface is two read endpoints and one authenticated command.
- Boards poll rather than subscribe: realtime needs a user session (ADR-014). Six-second polling
  of a cached projection is cheap enough for a hall screen.
- Organisers must understand that "public" means anyone with the link; the toggle copy says so.
