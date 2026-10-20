# ADR-015: Design system foundations ("Paper & Path")

**Status:** Accepted 2026-10-19 (owner confirmed: A is the light theme, C "Clubhouse" is the dark
theme, B is dropped)  
**Date:** 2026-10-19

## Context

The proof-of-concept web UI had no identity: a teal square, system fonts, generic cards. The owner
asked for a serious first pass on look and feel before Phase 4, with a brief covering both products:
Buddy Club (real-world connection across many activities) and Rally (an offline-capable racket
session runner), one brand family, mobile-first, legible outdoors, no decorative effects.

Three directions were drawn and compared on a shared canvas (docs/design/README.md section 2).

## Decision

1. **Adopt direction A, "Paper & Path".** Warm paper ground, forest ink, Figtree for UI and
   Bricolage Grotesque for display, 12/16/24 radii, hairline cards, no shadows below sheet level.
   Direction B's live-screen discipline (huge tabular digits, 64px live action) is folded in.
   Direction C became the dark theme for both products on 2026-10-20 (decision 6).
2. **One token set, two accents.** Shared tokens live in `docs/design/tokens.json` and are
   mirrored in `apps/web/app/globals.css` as `--bc-*` custom properties exposed to Tailwind with
   `@theme inline`. The accent switches on `html[data-product]`: forest green for Buddy Club, court
   blue for Rally, lime reserved for live / your court, red reserved for errors.
3. **Brand marks.** Buddy Club: a single-stroke abstract B (a shared path). Rally: racket and lime
   ball at the same stroke weight. Both are inline SVG components and rasterised PWA icons per
   product; the manifest and metadata are chosen from the hostname (extends ADR-013).
4. **Component contract.** `apps/web/components/ui.tsx` (plus `court`, `live`, `nav`, `brand`) is
   the only place screens get colour, radius or type from. Screens compose; they do not restyle.
   The inventory in docs/design/README.md is also the parity list for the Expo apps.
5. **States are designed.** Empty, loading, error, offline, unsaved and conflict have rules
   (docs/design/README.md section 7) that new screens must follow.
6. **Two themes, one token set** (amended 2026-10-20; originally light only). The dark theme
   is direction C, "Clubhouse": deep forest ground, cream ink, gold on cream for the hero
   eyebrow, lifted accents that pass 4.5:1 as text and take dark ink as buttons. It applies
   with the system preference or an explicit choice stored in the `bc-theme` cookie and
   rendered by the root layout as `html[data-theme]`, so there is no flash. New `on-ink-*`
   tokens replace `night-*` on ink surfaces; `night-*` remains fixed for the venue board.

## Amendment 2026-10-20: palette "White with Cobalt and Coral"

After colour studies on the chosen homepage (canvas "Buddy Club palettes"), the owner replaced the
paper-and-forest palette with a white ground, cobalt actions, coral as the decorative highlight
and lime for live. Layout, type, radii, spacing, the component contract and the theme mechanism are
unchanged; only token values moved (`docs/design/tokens.json` 2.0.0, `globals.css`). Buddy Club
and Rally now share a blue family (cobalt #1D4FC4 and court blue #2350D6), which ties the products
together on purpose; the Rally mark keeps its own blue. The dark theme is navy rather than forest.
The brand marks and PWA icons were regenerated in the new colours. Every text pair was checked at
4.5:1 or better in both themes.

## Amendment 2026-10-20 (evening): raspberry accent and Poppins

The owner replaced the cobalt accent with raspberry #D62E5A for Buddy Club (white text 4.8:1), moved
the decorative highlight from coral to amber #FFB020 so the header stripe no longer sits next to a
near-identical accent, shifted the error colour to orange-red #C2410C so errors cannot be read as
buttons, and chose Poppins for both display and body in place of Bricolage Grotesque and Figtree.
Rally keeps court blue #2350D6. Interest tiles use the mid-saturation swatch set. Tokens 2.1.0.

## Consequences

- No API, schema or policy changes. Two web routes were added (`/sessions`, `/start`) that wrap
  existing endpoints and actions.
- The brief's offline-first local sessions, local groups/presets and QR join sheet are designed but
  cannot be delivered on the current "API is the authority" architecture (spec section 10). They
  need a local store plus sync design before the Expo build; this is the main open item.
- Fonts are fetched from Google Fonts at build time by `next/font`; CI needs network for the web
  build, as it already does for dependencies.
- Photography is part of the Buddy Club direction; storage buckets and visibility policies are not
  started.
- Tailwind utility names changed (`text-muted`, `bg-primary`, `rounded-card`); the old
  `var(--bc-*)` arbitrary classes were migrated by codemod and the legacy aliases `--bc-bg` and
  `--bc-border` remain for safety.
