# ADR-014: Realtime transport for live session pages

**Status:** Accepted 2026-10-19 (Supabase Realtime now; Ably is the designated replacement)  
**Date:** 2026-10-19

## Context

Organisers and players watch the session console and "my game" pages during play. Polling every
5 to 10 seconds works but lags and wastes requests. The owner is open to Ably if it is cheaper
than Supabase Realtime at higher limits.

## Decision

1. **Signal, not payload.** Realtime carries only "something changed" for an occurrence; clients
   then refetch the API read model (spec section 10). Every Phase 2 write bumps
   `session_occurrences.version` or `social_rounds.revision`, so those two tables are the signal.
2. **Supabase Realtime, Postgres changes, for signed-in users.** Migration 6 adds
   `activities.session_occurrences` and `activities.social_rounds` to the `supabase_realtime`
   publication. The browser subscribes with the user's own session, so the existing RLS policies
   (members of the organisation only) filter what it may see. No service key, no new vendor.
3. **Guests keep polling.** Guest credentials are API-issued (ADR-008), not Supabase sessions, so
   they cannot subscribe. The guest page polls every 8 seconds, which is acceptable for a view that
   changes once per round.
4. **Polling stays as the fallback** at a slower interval (30 seconds) on realtime pages, so a
   dropped socket degrades to the Phase 2 behaviour rather than a stale screen.
5. **One abstraction.** `apps/web/components/live-subscription.tsx` is the only place that knows
   the transport. Swapping to Ably means replacing that component and adding a token endpoint to
   the API; pages do not change.

## Why not Ably now

At pilot scale (a handful of clubs, tens of concurrent connections, thousands of messages a
night) both services sit inside their free allowances. Ably's advantages (higher connection
ceilings, guaranteed ordering, presence, push integrations) matter when sessions run across many
clubs at once or when native push arrives. Supabase Realtime's advantages today are zero
integration cost and RLS-filtered subscriptions without a second auth system. Revisit when either
the Supabase plan's concurrent-connection cap is approached or native push (Expo) is scheduled.

## Consequences

- Phase 3 league pages reuse the same component with meet- and fixture-level signal tables.
- Realtime must be enabled on the Supabase project (it is by default) and the publication kept
  current when new signal tables are added.
