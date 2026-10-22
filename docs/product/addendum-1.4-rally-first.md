# Addendum 1.4: one product, the session runner first

**Date:** 2026-10-22 · **Against:** the codebase after Addendum 1.3 step 1 and the activity catalogue
**Status:** Accepted by the owner 2026-10-22 ("I'll trust you"). Steps 1 to 6 built the same day; see [`../implementation/addendum-1.4-steps-1-2.md`](../implementation/addendum-1.4-steps-1-2.md) and [`../implementation/addendum-1.4-steps-3-7.md`](../implementation/addendum-1.4-steps-3-7.md). **Name (owner, later on 2026-10-22): the product is called Buddy Club**, not Rally. The plan, the look (the Rally colours, dark theme and condensed type) and the code are unchanged; "Rally" below is the internal name of the runner and its route group. The owner has the domain and will swap the R logo for a B.
**Rule:** Additive only, as before. Nothing is deleted; the wider Buddy Club is parked, not removed.

## 1. The decision (owner, 2026-10-22)

Rally is the product. It is the niche version of Buddy Club, focused on racket sports, which is
where the owner plays day in, day out. The wider, category-agnostic Buddy Club is not useful until
the model is proven in that niche, and launching it now risks a wide, empty product. A new domain
for Rally is acceptable. If Rally succeeds at scale, the work can be ported into a wider Buddy Club
naming later; that is a future problem and nothing here is designed for it.

"Buddies" stay. **Buddy Club is the name of the membership inside Rally**: the social layer a
player joins after they have played, which keeps the concept alive without a second product.

## 2. Overrides to Addendum 1.1

| Addendum 1.1 said                                                          | Now                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Two products, two hosts; both must work alone                              | One product, one host. There is nothing for Rally to be independent of.                                                  |
| Buddy Club is category-agnostic community discovery                        | Parked. The community model (clubs, groups, gatherings, interests) is kept and used inside Rally for racket sports only. |
| Rally carries no social search, nearby players or people discovery         | Reversed. Finding people to play with is the Buddy Club membership inside Rally, with the safeguards of Addendum 1.3.    |
| Installing or registering for Buddy Club is never a prerequisite for Rally | Still true, restated: running and joining nights never needs the membership. The membership is an upgrade, never a gate. |
| Cross-link to Buddy Club sparingly                                         | There is no cross-link. There is one app.                                                                                |

Everything else in 1.1 stands: utility dashboard, Apple and Google sign-in on the shared issuer,
guests without accounts, resource-scoped permissions, additive migrations, immutable rulesets.

## 3. What Rally is

Two layers, one app, one account.

**The runner (free, no membership).** Everything built so far under the Rally name: sessions with
hosts and schedules, on-demand nights, check-in, rotation (fair or king of the court), round
timers, guest walk-ins, court views, ratings of the night, leagues. A host can run a night for
people who never create an account. A player can check in, see their court and rate the night
with nothing more than sign-in.

**The Buddy Club (membership).** Every signed-in account is a member, free, from the moment it
signs in (owner, 2026-10-22). There is no join flow: signing in is joining, and the sign-in
screen says so. The three tiers fall out of what already exists:

| Tier  | Who                               | What they have                                                                                                                     |
| ----- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Guest | No account; a walk-in a host adds | Their court on the board. Cannot rate. The guest claim flow (ADR-008) is the upgrade to Buddy.                                     |
| Buddy | Any signed-in account, free       | The buddy profile, buddies from shared nights, Say hi, groups and gatherings, the playing record. Find me and Show my gear opt-in. |
| Pro   | A member who pays, later          | Section 9: a services profile shown to the groups and clubs they belong to.                                                        |

What a member has:

- A buddy profile: the racket sports they play, a word-based level per sport, the days and parts
  of the day they are free for each, gear, a line about themselves, a town. This is Addendum 1.3
  step 1 re-homed, at `/profile/buddy`, with the six racket sports as the tiles.
- Buddies: the people they have shared a night with, kept automatically. This is the default
  circle. Those names were on the board that night, so membership exposes nothing new.
- Find me: opt-in, 18+ only, off by default. Makes them findable by other members in their area
  and sports, beyond the people they have played with. Membership never switches it on.
- Say hi: one tap to a buddy or a found person, with block and report. Messaging is still later.
- Groups and gatherings: a club's informal hits and standing groups, racket only, with RSVP. A
  gathering can be powered by a Rally night exactly as ADR-018 describes.

## 4. The profile-completion moment

Because everyone is already a member, the moment to win is not "join" but "complete your
profile", and it comes where the value is obvious, never on first run:

1. **After a night.** On the rating screen, once a rating is given: "Want more games with this
   lot? Say how good you are and when you're free." Level and days free, then the visibility
   switches. Their buddies list is already populated with that night's players.
2. **From the dashboard**, once a player has attended two or more nights, as a card, not a nag.
3. **From a host**, who can nudge the regulars of a session in one go.

A player who ignores it keeps everything in the runner. Nothing they already use is withdrawn.

## 5. First run

Rally's welcome asks for a display name and the racket sports the person plays, writes both to
the profile, and nothing else; level and days belong to the completion moment so that first run
stays short. It cannot be skipped and at least one sport is required, as the owner decided for
onboarding on 2026-10-22. The mark is `rally_onboarded_at` on the profile, checked by the Rally
app layout on every page, so it follows the account rather than the device. The
`buddyclub_onboarded_at` column now means "profile completed" (level, days and visibility
answered) and is set by the completion flow, not by signing in.

## 6. What gets parked

Parked means unlinked and unreachable, kept in the repository, no deletion and no migration.

- The marketing home with the 28-category mosaic and the ribbon. Rally's marketing page is the
  home.
- Explore across all categories, and the public discover endpoint's non-racket results. The
  endpoint stays; the web only asks for racket sports.
- The Buddy Club route group as a product. Its pages that Rally needs (profile editor, groups,
  gatherings, clubs) move into Rally's app group or shared.
- The long tail of the activity catalogue. The file stays as the source of truth, the featured
  set becomes the six racket sports, search over the other 172 is hidden, and suggestions are
  not offered. Nothing is removed from the database.
- The second host and the product header. The proxy serves one product. Host routing code stays
  behind a default so a second product can come back without a rewrite.

Internal names (`@buddyclub/*` packages, schema names, `x-buddyclub-*` headers, Vercel project
names) do not change. They are not user-facing and renaming them is churn with no value.

## 7. Build order

Each step is shippable alone and leaves the app working.

1. **One front door.** Built 2026-10-22. The bare host serves Rally (`WEB_PRODUCT=rally`, the
   default); the Buddy Club group is unreachable; hostname routing stays behind
   `WEB_PRODUCT=host`. The buddy profile editor moved to `/profile/buddy` for every account.
   Rally's marketing page keeps its copy for now.
2. **First run on the profile.** Built 2026-10-22. Rally welcome writes the name and sports to
   the profile, forced, cookies removed; the app layout sends anyone not yet through it to
   `/welcome`. Start defaults to the person's first sport.
3. **Buddies.** Built 2026-10-22. The buddies list derived from shared nights (both checked in on the same
   occurrence), a Buddies tab in Rally, a buddy's card showing what they have chosen to show.
   Say hi, block and report. This is Addendum 1.3 steps 2 and 3 scoped to people you have played
   with, which removes most of the safety surface.
4. **Complete your profile.** Built 2026-10-22 (no host nudge yet). The completion flow (level, days, gear, 18+, Find me, show gear)
   from the rating screen and dashboard; `buddyclub_onboarded_at` set on completion. Hosts can
   nudge regulars.
5. **Find me.** Built 2026-10-22. Member search by sport, level and locality, visible only to members with Find me
   on, adults only. Addendum 1.3 step 2's visibility rules apply unchanged.
6. **Groups and gatherings in the app.** Built 2026-10-22. Re-home the existing pages under the app, racket only.
7. **Domain.** The owner has the Buddy Club domain; one env change and a Vercel domain when ready.

Rally organiser seeding of a club rating from the self-rated level (Addendum 1.3 step 4) fits
after step 4.

## 8. Open questions for the owner

1. **Free or paid?** Answered 2026-10-22: the membership is free. The paid layer is selling
   services (section 9), and the core product must not rely on it at first.
2. **The domain.** Answered: the Buddy Club domain the owner already holds.
3. **What a non-member sees of a member.** Proposal: display name and the sports they play,
   nothing else, and only on a night they share. Level, days and gear are member-to-member.
4. **Pickleball and padel players who never play tennis.** They are in from day one; the six
   racket sports are the wedge, not tennis alone.
5. **Does Buddy Club membership carry across clubs?** Proposal: yes, it is the person's, not the
   club's. Buddies are people, not club members.

## 9. The paid layer, later: selling services (owner, 2026-10-22)

The upsell is people selling their services through Rally: a coach offering private lessons, a
stringer, a physio, a fitness coach, anyone a club's players would pay. They pay Rally a small
monthly fee for a seller profile, and their listing is shown to the groups and clubs they are
already part of. This is the future of the paid tier, and the core product must not rely on it
at first.

Shape, so that nothing built now gets in its way:

- **The free Buddy Club membership stays free.** Sellers need a graph to sell into, so the paid
  tier is an add-on a member buys, not a replacement for the membership. Working name:
  "Buddy Club Pro". The naming is open.
- **Rally's only payment relationship is with the seller.** A monthly subscription (Stripe
  Billing or similar). Payment between a player and a coach stays off-platform at first, so there
  is no money handling, payout, dispute or VAT-on-the-service problem on day one.
- **A seller profile is the buddy profile plus services.** A service is a title, a short
  description, a price indication, where (club or area), and how to get in touch (Say hi first).
  Sport-specific credentials (for coaching: governing-body accreditation, safeguarding check) are
  shown as declared text until there is a way to verify them.
- **Distribution is membership.** A listing appears to the members of the groups and clubs the
  seller belongs to, and on the nights they host. This is why groups and clubs stay in Rally and
  why group members must be able to see each other.
- **Not yet:** bookings, taking payment for the service, reviews, a public marketplace page.
  Each is its own decision later.

Prerequisites, in order: the free membership (steps 3 to 5), groups and gatherings inside Rally
(step 6), then a payments provider. Nothing in steps 1 to 7 should be designed around it beyond
the two points above: the membership stays free and group members can see one another.
