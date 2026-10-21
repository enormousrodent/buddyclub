# Terms of use and privacy policy pages (2026-10-21)

**Status:** Implemented in `apps/web`  
**Purpose:** Public URLs the owner can give Google (Search Console, and the OAuth consent screen
when Google sign-in is switched on) and link from anywhere else.

## What changed

- `app/public/terms/page.tsx` and `app/public/privacy/page.tsx`: the two documents. They are
  served from `app/public` so they work signed out and on both hosts (`/terms` and `/privacy` on
  buddy-club.com and rally.buddy-club.com); `proxy.ts` adds both paths to `PUBLIC_PREFIXES`.
- `components/legal.tsx`: `LegalPage` (light header with the host's lockup, a reading column,
  footer with the contact address) and `Contents` (anchored table of contents). Typography is
  applied with Tailwind child selectors so the pages need no extra dependency.
- `lib/legal.ts`: the facts both documents print (operator name, contact email, hosts, effective
  date, governing law, minimum age). Change them there, not in the copy.
- Footer links to Terms and Privacy on the Buddy Club marketing footer (`components/marketing.tsx`)
  and the Rally marketing footer (`components/rally-marketing.tsx`). The sign-in form's existing
  "By continuing you agree" line now links to both documents.

## Facts the copy relies on

Drawn from the ADRs and the code, so the policy describes what the product actually does:
email + password and magic-link sign-in (ADR-010), Google and Apple described as future options;
Supabase in eu-west-1 and Vercel functions in Dublin (ADR-010); only functional cookies (Supabase
session, `bc-theme`, the three Rally onboarding cookies) and no analytics or advertising trackers;
participants independent of accounts and anonymisation on deletion leaving history intact
(ADR-003); public boards as redacted projections with display names only on social session
court boards (ADR-016); hashed guest tokens (ADR-008); audit events in `platform.audit_events`.

## Owner decisions still needed

- **Operator legal name**: `LEGAL.operator` is "Buddy Club" until the trading entity is confirmed.
- **Contact address**: `LEGAL.contactEmail` is `hello@buddy-club.com`; it must exist before the
  pages are given to Google.
- **Retention periods**: the policy states 30 days for logs, two years for the audit trail and
  30-day backup rollover, and promises a guest participant inactivity period before the first full
  season. ADR-010 still lists retention and backups as open; align the ADR with these figures or
  change the copy.
- **Account deletion**: there is no self-service delete yet, so the terms say to email the contact
  address. Update section 12 of the terms when a delete action ships.
