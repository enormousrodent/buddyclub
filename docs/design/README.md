# Design system: Buddy Club and Rally

> **Palette update 2026-10-20.** The owner chose "White with Cobalt and Coral" from the colour
> studies (canvas "Buddy Club palettes"): white ground, cobalt #1D4FC4 actions, coral #FF6B57 as
> the decorative highlight, lime #D9F74D for live, navy #141E33 ink and night. Colour values in the
> sections below describe the original paper-and-forest palette; the current tokens are in
> `tokens.json` 2.0.0 and `apps/web/app/globals.css`. Everything else on this page still applies.

**Status:** First pass, 2026-10-19. Canvas with directions, screens and states:
<https://claude.ai/artifact/X91kJW7YfYuU5SzL6nzxrZ> (private until shared). Decision record: ADR-015.
Tokens: [`tokens.json`](tokens.json). Implementation: `apps/web/app/globals.css`,
`apps/web/components/{ui,brand,nav,court,live,app-shell}.tsx`.

## 1. Strategy

Two products, one family. **Buddy Club** is about doing things together: clubs, groups, meetups,
dog walks and book clubs as much as badminton. **Rally** is a tool you open on a sports-hall floor:
sessions, players, rotations, timers, courts, leagues. The design has to feel like one brand while
making the different jobs obvious the moment the app opens.

Principles, in priority order:

1. **Legible on a court.** Timer digits and court numbers are the biggest things on their screens,
   tabular, high contrast. Nothing read outdoors is under 16px.
2. **One primary action per screen**, 56px tall, always reachable with a thumb. Everything else
   is secondary, tonal or ghost.
3. **Colour is a signal, not a wash.** Forest green means Buddy Club, court blue means Rally, lime
   means live or your court. Red is reserved for errors. No gradients, glass or illustration.
4. **States are first-class.** Empty, loading, error, offline, unsaved and conflict states are
   designed, not improvised (section 7).
5. **Same bones, different accent.** Type, ground, spacing, radii, components and motion are shared;
   only the accent and the icon change per product.

## 2. Three directions reviewed

| Direction        | Idea                                                                                | Verdict                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A · Paper & Path | Warm paper, forest ink, one expressive display face, rounded but not soft           | **Recommended.** Friendly enough for a book club, crisp enough for a court. Best daylight legibility.             |
| B · Court Lines  | Pure white, near-black, 6px corners, 1.5px rules, uppercase labels, one flat accent | Strong for Rally alone; cold for Buddy Club. Its discipline for live screens is folded into A.                    |
| C · Clubhouse    | Deep forest and cream, gold accents, night-court dark mode for Rally                | Premium, but dark surfaces lose in sunlight and tonal steps need more care. Built as the dark theme (2026-10-20). |

## 3. Brand identity

- **The mark (owner, 2026-10-22).** A tilted rounded ring with two bars through it, in ink
  (`#0e1728`) on a lime tile (`#e6fe6f`), radius about 7% of the tile. One product, one mark;
  the condensed wordmark reads "Buddy Club". The earlier B monogram and the R racket icon are
  retired.
- Files: the source is `apps/web/public/icons/rally-logo.svg`; `node apps/web/scripts/make-icons.mjs`
  writes `{rally,buddyclub}.svg` and the PNG set (192, 512, maskable 512, Apple 180) for both
  product keys. The marks are also React components in
  `components/brand.tsx` so they take the current colour.

## 4. Foundations (tokens)

See [`tokens.json`](tokens.json) for every value. Summary:

| Token group | Values                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Ground      | paper `#F6F3EC`, surface `#FFFFFF`, surface-2 `#EFEBE2`, hairline `#E3DED3`                            |
| Ink         | ink `#172019`, ink-2 `#3E4A42`, muted `#66716A` (4.9:1 on paper)                                       |
| Buddy Club  | primary `#1F5F43`, tint `#E3EFE7`, highlight marigold `#E7A33A` (decorative only)                      |
| Rally       | primary `#2350D6`, tint `#E4EAFB`, highlight lime `#C9F24A` (live, your court)                         |
| Semantic    | info, warning, danger (`#B3261E`), success; night palette for the player hero and future dark theme    |
| Type        | Figtree for UI and body; Bricolage Grotesque for titles and big numbers; tabular numerals on timers    |
| Scale       | display 34, page title 28, heading 26, title 20, body 16, label 13, caption 12; timer 72; court 44/120 |
| Spacing     | 4px base; 4, 8, 12, 16, 20, 24, 32, 40; gutter 20; card padding 16; section gap 24                     |
| Radii       | control 12, card 16, sheet 24, pill                                                                    |
| Elevation   | flat (hairline), raised (segment), sheet                                                               |
| Touch       | 44 minimum, 48 controls, 56 primary, 64 live action                                                    |
| Motion      | 120 / 200 / 320 ms ease-out; sheets slide, nothing bounces; reduced motion respected                   |

In the web app the tokens are CSS custom properties (`--bc-*`) exposed to Tailwind through
`@theme inline`, so classes read `bg-primary`, `text-muted`, `rounded-card`. The product accent
switches on `html[data-product]`, set by the root layout from the hostname (ADR-013).

## 5. Navigation architecture

**Buddy Club** (web now): bottom tabs Home · Sessions · Me. Home lists clubs and the two things you
can do (sessions, leagues). Club pages keep the segmented sub-navigation (Overview, Sessions,
Members, Players, Groups, Venues). Target app: Home (discovery) · Explore · Mine · Me, as drawn on
the canvas.

**Rally** (web now): bottom tabs Sessions · Leagues · Me. Home is session-first: **Start session**
is the dominant action, with Resume and My schedule beneath, then Tonight / Upcoming / Recent.
`/start` picks the club and creates the session with the existing server action. Target app adds
Groups (reusable rosters and presets) and the QR join sheet.

Shared routes on both hosts: sign-in, profile, invitations, guest links, sessions, leagues.

## 6. Component inventory

| Component                                                     | Web (`components/`)                     | Notes                                                               |
| ------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| Page header (title, eyebrow, lead)                            | `ui.tsx` `Page`                         | Display face, back button 40px, optional action slot                |
| Section heading                                               | `SectionHeading`                        | 13px uppercase muted, optional trailing action                      |
| Card (surface, well, ink, live)                               | `Card`                                  | `live` = 2px lime border for the viewer's own court / in-play round |
| Button (primary, secondary, tonal, ghost, danger; sm, md, lg) | `Button`, `LinkButton`, `TextButton`    | One primary per screen; lg = 56px                                   |
| Field, Input, Select, Textarea                                | `Field`, `Input`, …                     | 48px, focus ring in product tint, error text under the field        |
| Segmented control / chips                                     | `Tabs`                                  | Also the sign-in mode switch                                        |
| Status pill                                                   | `Badge`, `StateBadge`, `stateTone()`    | API state words map to tones; dot for live                          |
| List + Row (+ Avatar)                                         | `List`, `Row`, `Avatar`                 | 60px rows, chevron when linked                                      |
| Stat                                                          | `Stat`                                  | Club overview numbers                                               |
| Alert (warning, danger, info, success, ink)                   | `Alert`                                 | Also the offline banner (ink)                                       |
| Empty                                                         | `Empty`                                 | Title, one sentence, one action                                     |
| Court card, resting strip                                     | `court.tsx` `CourtCard`, `RestingStrip` | Court number 44px                                                   |
| Player hero                                                   | `MyCourtHero`                           | Court number 120px on ink; partner / against                        |
| Timer (compact, hero)                                         | `live.tsx` `Countdown`, `TimerHero`     | Server-anchored, tabular, 72px hero                                 |
| Bottom tab bar                                                | `nav.tsx` `BottomNav`                   | 3 tabs per product; active = primary + bold                         |
| Shell                                                         | `app-shell.tsx`                         | Lockup + sign in/out; tab bar when signed in                        |
| Brand marks                                                   | `brand.tsx`                             | `BuddyClubMark`, `RallyMark`, `Lockup`, `IconTile`                  |

Not yet built on web (drawn on the canvas): bottom sheet, toast, QR join sheet, group cover cards,
category grid, presets carousel, swipe-to-leave rows.

## 7. Interactive states

| State                         | Rule                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty                         | One sentence of what belongs here plus one action. Partial lists show what they have.                                                                     |
| Loading                       | Skeletons match the final layout; spinner only after 400 ms; buttons say "Working…" without changing width; timers show the last value dimmed.            |
| Error                         | What happened, then what to do. Field errors under the field. Problem codes become sentences; the correlation id is small and on request.                 |
| No connectivity               | A banner, never a modal. Host keeps timer, rotations and scores; player phones show "as of" and keep counting locally. Only server-bound actions disable. |
| Unsaved change                | Drafts autosave on the device ("Draft saved on this phone"). Server-bound forms ask before leaving; keeping is the primary button.                        |
| Conflict                      | A 409 names the other actor where the role may see it, shows both versions, and defaults to the safe choice. Never "something went wrong".                |
| Local / syncing / shared live | One pill, top right of every session screen: icon + word + lightness change together. Tapping opens the sync sheet.                                       |

## 8. Implementation guidance

**Web (now).** Tokens in `globals.css`; components in `apps/web/components`; fonts through
`next/font/google` (Figtree, Bricolage Grotesque, self-hosted at build). Icons and manifest are per
product. Dark theme ("Clubhouse", direction C) ships for both products: the `--bc-*` tokens are
redefined under `prefers-color-scheme: dark` and under `html[data-theme="dark"]`; the user
chooses System / Light / Dark on the Profile screen (`ThemeToggle`, cookie `bc-theme`, read by
the root layout so the server renders the right theme). Screens never pair `bg-ink` with
`text-night-*`; they use `on-ink-*`, which flips with the theme. `night-*` stays fixed for the
venue board, which is dark in both themes. Decorative covers use `--bc-swatch-1..6`.

**React Native / Expo (later).** `tokens.json` is the contract. Map `color.*` to a theme object,
`typography.scale` to text styles, `radius` and `spacing` as-is. Load the same two Google Fonts with
`expo-font`. The component inventory above is the parity list; names should match so screens port
without renaming. The brand marks are plain SVG paths and work with `react-native-svg`.

**Supabase.** No schema or policy change. Group covers and profile photos will need Storage buckets
with the visibility rules the spec already describes (section 8); not started.

## 9. Impact on existing behaviour (what changed, what did not)

- **No backend contracts changed.** Every screen calls the same API and server actions as before.
- **New web routes:** `/sessions` (my schedule, both hosts) and `/start` (Rally only; wraps the
  existing create-session action). `/clubs/[org]/sessions` still works.
- **Removed:** the generic teal square and the single shared manifest; replaced by per-product
  icons and manifests chosen from the hostname.
- **Known gaps against the brief:** offline-first local sessions without an account, reusable
  local groups and presets, and the QR join sheet are designed but not supported by the current
  architecture (the API is the authority, spec section 10 rules out multi-device offline writes in
  MVP). They need a local store and sync design before the Expo build; flagged in ADR-015. Apple and
  Google sign-in remain pending. Discovery (Explore) has no data model yet.
