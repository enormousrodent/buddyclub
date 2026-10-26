# ADR-008: Guest redemption proof and claim verification

**Status:** Decided 2026-10-26 (owner); built the same day  
**Date:** 2026-10-19, decided 2026-10-26

## What is already fixed by the schema

- `identity.guest_grants` stores only a SHA-256 hash of a redemption token, its scopes, expiry,
  revocation, redeem count and maximum redeems. Tokens are at least 128 bits of entropy.
- Redemption returns a short-lived, API-issued guest credential scoped to one participant and (when
  set) one session occurrence. It is never a Supabase Auth session.
- Claiming (linking a guest participant to an account) only sets `participants.user_profile_id`
  and writes an audit event with the consent record. History is untouched (ADR-003).

## Decisions still needed

1. Which secondary proof is acceptable for a claim: organiser-issued PIN, individual link sent by
   the organiser, captain approval, or a combination.
2. Whether a public event QR may open a self-service join page, and what it may show before proof.
3. Guest credential TTL and whether re-redemption is allowed within a session.
4. Rate limits for redeem and claim endpoints.

Until decided, no guest view endpoints are exposed. The Phase 1 plan lists the chosen option before
implementation.

## Decision (2026-10-26)

1. **Proof is the organiser's individual guest link.** Whoever holds a valid, unrevoked link may,
   once signed in, take over the name-only player it points at. The organiser handed the link to
   that person; no PIN or captain approval on top. `GET /v1/guest/claim?token` previews,
   `POST /v1/guest/claim` claims. The reserved `claim-intents` and `confirm-claim` paths are gone.
2. **What a claim does:** sets `participants.user_profile_id`, renames the record to the
   account's display name, becomes `registered`, adds club membership as `participant`, revokes
   the grant, writes an audit row with `consent: true`. Nights, regular status, ratings and
   results stay with the record (ADR-003). If the account already had an empty player record in
   the club it is removed; if that record had played, the claim is refused (409) rather than
   merged automatically.
3. **Public event QR** opens the join page as before; it still shows nothing before sign-in.
4. **TTL and re-redemption** stay as issued by the organiser (hours and max redeems on the grant);
   a claim ends the grant.
5. **Rate limits:** the redeem endpoint keeps its limit; claim is behind sign-in.
