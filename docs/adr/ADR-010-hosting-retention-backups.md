# ADR-010: Hosting region, data retention and backup policy

**Status:** Partly decided 2026-10-19 (hosting); retention and backups still open  
**Date:** 2026-10-19

## Decided

- **Database and Auth:** Supabase cloud project `xvkoukolmdpuvftvvcdd` in `eu-west-1` (Ireland).
  Connections from the API use the Supavisor pooler; the direct host is IPv6-only.
- **Everything else on Vercel:** the web app (`apps/web`, ADR-013) and the platform API
  (`apps/platform-api`, ADR-012) both deploy as Vercel projects from this repository. Vercel
  function region `dub1` (Dublin) keeps the API next to the database. Secrets live in Vercel
  project environment variables, never in the repository.
- **Domains:** the owner controls `buddy-club.com`. Planned hosts: `buddy-club.com` (Buddy Club
  web), `rally.buddy-club.com` (Rally web), `api.buddy-club.com` (platform API). The Supabase Auth
  site URL and redirect allowlist, the API CORS list and the session cookie domain are derived from
  these.
- **Sign-in methods for the pilot:** email + password and magic link. Google and Apple are added
  later; each is a provider toggle in Supabase plus a redirect URL, and Apple requires an Apple
  developer account.

## Still open

1. Guest participant retention: how long a guest with no account is kept after their last session,
   and whether archiving or anonymisation is the default.
2. Audit log retention and whether it is exported to cold storage.
3. Backups: the Supabase plan tier determines point-in-time recovery; confirm the tier and schedule
   a restore rehearsal before the first real league data.
