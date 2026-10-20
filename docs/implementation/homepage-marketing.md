# Signed-out homepage and the Rally sub-page (2026-10-20)

**Status:** Implemented in `apps/web` (local and deployable)  
**Design:** canvas "Buddy Club homepage" (direction A with direction B's word mosaic; Rally
sub-page). Owner decision 2026-10-20: C dropped; Rally gets its own front page later.

## What changed

- `app/buddyclub/page.tsx`: signed-out visitors on the Buddy Club host get the marketing page;
  signed-in visitors keep the discovery home unchanged. The marketing page reads the same public
  discovery endpoint as the app, so "Happening soon" is real content (optionally filtered by
  `?locality=`), and the hero search posts to `/explore`.
- `components/marketing.tsx`: hero with search, Happening soon (reuses `ActivityCard`), How it
  works, the interest word mosaic (links to `/explore?interest=`), For organisers (with a mock
  group card), the dark Rally band (uses the real `MyCourtHero`), trust row, footer; plus
  `RallyLanding` for the sub-page.
- `app/buddyclub/rally/page.tsx`: `/rally` on the Buddy Club host. Hero, six features, three
  steps, "with Buddy Club" panel. Buttons deep-link to the Rally host (`lib/env.ts`
  `rallyOrigin()`, which puts `RALLY_HOST_PREFIX` in front of the current host, so it works on
  localhost, vercel.app and the real domain). When Rally's own marketing is ready, this page's
  content becomes the Rally host's signed-out `/`.
- `components/app-shell.tsx`: the top bar widens and gains "What's on" and "Rally" links for
  signed-out Buddy Club visitors; the app's narrow shell is unchanged for signed-in users.

## Copy facts still missing (shown as neutral text, nothing invented)

Organiser pricing, who is behind Buddy Club, a safeguarding policy link, member and organiser
quotes, photography.

## Verification

Typecheck, lint, Prettier and `next build` green; `/`, `/rally` and `/explore?interest=books`
render against the deployed API with the demo content.
