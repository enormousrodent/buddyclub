# ADR-013: Web-first clients, one Next.js codebase serving two products

**Status:** Accepted 2026-10-19 (owner confirmed: all roles in one app; Rally on its own subdomain; everything on Vercel)  
**Date:** 2026-10-19

## Context

The owner wants to test the whole product with real people before committing to native app
development. The spec lists Expo mobile apps plus Next.js admin and live-board apps (section 13),
which is the right end state but the slowest route to a pilot. Both products share one identity
(ADR-001), and Rally is expected to live on its own subdomain.

## Decision

1. **Web first.** Until the pilot has proven the flows, there are no native apps. The web apps
   are mobile-first and installable as PWAs (manifest, icons, standalone display), so testers add
   them to a phone home screen and use them like apps. Expo arrives later (ADR to follow) and
   reuses `@buddyclub/api-client`, `@buddyclub/shared-types` and the API unchanged.
2. **One Next.js codebase, two products, two hostnames.** `apps/web` contains route groups
   `app/(buddyclub)` and `app/(rally)`. Middleware selects the group from the request hostname:
   the Buddy Club host serves sign-in, profile, clubs, groups and session discovery; the Rally host
   (planned `rally.buddy-club.com`, subject to the owner's DNS) serves everything competitive:
   player, organiser, director/admin and the public live board. One deployment, one set of shared
   components (`packages/ui-web`), one session.
3. **Every role in one app.** Navigation and screens are driven by the memberships and roles
   returned by `GET /v1/me`; the API remains the authority and refuses anything the role does not
   allow. There is no separate "admin app": a director sees the admin sections, a player does not.
4. **Shared login across subdomains.** The Supabase session cookie is set on the parent domain so
   signing in on either host signs in on both. This is a deliberate refinement of ADR-001, which
   keeps per-app sessions for native apps only.
5. **Hosting.** The web app deploys to Vercel (preview URL per pull request, custom domains
   mapped when DNS is ready). The API deploys as the existing container (ADR-012); the provider
   is chosen in ADR-010.

## Consequences

- Deviates from the spec's `apps/{rally-admin,rally-live,buddyclub-mobile,rally-mobile}` layout:
  `apps/web` replaces the two Next.js apps, and the Expo apps are deferred. Splitting Rally into
  its own Next.js app later is a folder move because the route groups are already separate.
- iOS web push is limited; the pilot relies on the live court board and the organiser's screen
  rather than push alerts. Push lands with Expo.
- The public live board must work without a session (redacted projection, ADR-011).
- `.env` for the web app holds only the Supabase URL and publishable key; nothing secret.
