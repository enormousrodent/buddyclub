# Addendum 1.4, steps 1 and 2: one front door, first run on the profile (2026-10-22)

**Direction:** [`../product/addendum-1.4-rally-first.md`](../product/addendum-1.4-rally-first.md).
**Status:** built, typechecked, linted, web unit tests green. Not opened in a browser. Not
committed. No migration: the profile columns from Addendum 1.3 already carry everything.

## Step 1: one front door

- `WEB_PRODUCT` (apps/web/lib/env.ts) decides what a deployment serves: `rally` (default) on
  every host, `buddyclub` the reverse, `host` the earlier hostname-prefix routing (ADR-013).
  `productForHost` and `rallyOrigin` honour it; with one product `rallyOrigin` is the current
  origin. `lib/env.test.ts` covers the three modes.
- With the default, every non-shared path rewrites to `app/rally`, so the Buddy Club group
  (marketing home, Explore, groups, gatherings, clubs, the five-step welcome) is unreachable
  without being deleted. The proxy, headers and the root layout are unchanged.
- The buddy profile editor moved from the Buddy Club group to `app/shared/profile/buddy`
  (`/profile/buddy`) with its actions beside it; the profile page links to it for every account.
  The parked Buddy Club welcome imports the same actions. `/buddy` is gone.
- Sign-in on Rally says that an account is the Buddy Club membership.
- `apps/web/.env` documents `WEB_PRODUCT`; the Vercel projects need it set only if a second
  product is ever wanted again.

## Step 2: first run on the profile

- `app/rally/(app)/welcome`: step 1 saves the display name and at least one racket sport
  (`sports.ts`, six catalogue ids) to the profile with `PUT /v1/me/activities`, keeping any
  activity already there that is not one of the six, and keeping level, days and notes on
  re-pick. Step 2 (organiser or player) sets `onboarded: 'rally'` and sends organisers to the
  usual-night screen, players to the dashboard. Step 3's buttons are plain links, so "Set it up
  now" and "Create a club" no longer bounce back to the welcome. Deep links to steps 2 and 3
  without a sport fall back to step 1.
- The Rally app layout (`app/rally/(app)/layout.tsx`) reads the profile for a signed-in person
  on every page except `/welcome` and redirects until `onboarded.rally` is true, the same way
  the Buddy Club layout did. The dashboard's cookie gate, the `/welcome/done` route and the
  three device cookies are removed; sign-out still clears the old cookie names.
- Start defaults the sport to the first racket sport on the profile.

## Not done, by design

- Shared pages (`/sessions`, `/league`, `/profile`, the guest and invite flows) are not gated,
  so a QR join still works for someone who has not finished first run.
- The role chosen at step 2 is not stored; nothing read it before either.
- No browser run. The flows to check by hand: new account → welcome → dashboard; existing
  account with the old cookie but no profile sports → welcome once; `/profile/buddy` from the
  profile page.
