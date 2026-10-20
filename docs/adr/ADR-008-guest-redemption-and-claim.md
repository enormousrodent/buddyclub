# ADR-008: Guest redemption proof and claim verification

**Status:** Open (decide before guest view access ships in Phase 1)  
**Date:** 2026-10-19

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
