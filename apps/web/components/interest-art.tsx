/**
 * Line pictograms for the interest tiles: one clean mark per interest, drawn on a 100x100 grid
 * with a single stroke weight, shown behind the label as a quiet monotone shape.
 *
 * Photos were tried and set aside (owner decision 2026-10-20); the slot remains. A photo placed
 * at `public/interests/<id>.jpg` and listed in `INTEREST_PHOTOS` would replace the pictogram
 * and render as duotone in the tile's colour (see `.mosaic-art` in globals.css).
 */

/** Interests that should show a photograph instead of the pictogram. Empty on purpose. */
export const INTEREST_PHOTOS: ReadonlySet<string> = new Set<string>([]);

const PATHS: Record<string, string> = {
  // Two books, upright, spines facing out.
  books:
    'M22 30h26a4 4 0 0 1 4 4v46H26a4 4 0 0 1-4-4zM52 34a4 4 0 0 1 4-4h22v50a4 4 0 0 1-4 4H52zM30 42h14M56 42h14',
  // Dog in profile with a lead running up and out of frame.
  dog_walking:
    'M30 54h28a8 8 0 0 1 8 8v2a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8v-2a8 8 0 0 1 8-8zM62 56l8-10M76 42a8 8 0 1 0 0.1 0M72 36l-2-8M30 72v12M40 72v12M52 72v12M60 72v12M22 56l-8-10M84 36l8-14',
  // Runner mid-stride.
  running:
    'M62 22a6 6 0 1 0 0.1 0M58 34l-10 18M56 38l12 4 8-8M54 40l-12 2-6 8M48 52l14 8-2 20M48 52l-10 12-12 6',
  // Adult and toddler holding hands.
  parent_toddler:
    'M30 22a7 7 0 1 0 0.1 0M30 34v30M30 42h-10M30 42l14 10M30 64l-8 20M30 64l8 20M64 46a5 5 0 1 0 0.1 0M64 54v18M64 60l-10-6M64 60h8M64 72l-6 12M64 72l6 12',
  // A die and a meeple.
  board_games:
    'M20 46a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6zM30 50h0.1M40 60h0.1M50 70h0.1M74 32a6 6 0 1 0 0.1 0M74 44c-8 0-10 8-10 14h20c0-6-2-14-10-14zM66 58l-4 20h24l-4-20',
  // Hills and a sun.
  // Hiker with a pole and a pack, climbing a slope.
  walking:
    'M54 20a6 6 0 1 0 0.1 0M52 32l-4 24M50 38l-12 8M52 40l14-4M68 34l-2 52M48 56l12 12-4 18M48 56l-10 12-10 6',
  // Lotus: three petals on water.
  wellbeing:
    'M50 68c-8-6-12-14-12-22 0-8 6-16 12-20 6 4 12 12 12 20 0 8-4 16-12 22zM50 68c-12 0-24-6-30-16 10-2 20 0 30 6M50 68c12 0 24-6 30-16-10-2-20 0-30 6M22 82h56',
  // Mug with steam.
  food_drink:
    'M26 42h40v26a12 12 0 0 1-12 12H38a12 12 0 0 1-12-12zM66 50h6a8 8 0 0 1 0 16h-6M36 32c0-4 4-6 4-10M48 32c0-4 4-6 4-10',
  // Brush and palette.
  // Painter's palette with a thumb hole, and a brush.
  arts_crafts:
    'M46 24c-18 0-30 12-30 26 0 10 8 18 18 18 6 0 6-6 6-10s4-6 8-6h8c10 0 18-6 18-14 0-8-10-14-28-14zM34 42h0.1M46 34h0.1M60 38h0.1M58 86l26-26a4 4 0 0 0-6-6L52 80z',
  // Racket and ball.
  // Strung racket and a ball.
  racket_sports:
    'M42 18a18 22 0 1 0 0.1 0M30 30h24M27 40h30M30 50h24M36 22v36M48 22v36M50 58l24 26M46 60l4-2M78 22a6 6 0 1 0 0.1 0',
  // Tennis: racket with a ball in flight.
  tennis:
    'M40 20a18 22 0 1 0 0.1 0M28 32h24M25 42h30M28 52h24M34 24v36M46 24v36M48 60l24 26M78 20a7 7 0 1 0 0.1 0M74 16c3 3 5 6 5 10M82 24c-4 0-7-2-10-5',
  // Pickleball: a paddle with holes in the ball.
  pickleball:
    'M44 22a20 24 0 1 0 0.1 0M44 46v14M36 60h16v12H36zM76 30a10 10 0 1 0 0.1 0M72 26h.1M80 26h.1M70 32h.1M82 32h.1M76 36h.1M74 30h.1',
  // Badminton: a shuttlecock.
  badminton:
    'M62 22l18 18-30 30-4-4-14 14-6-6 14-14-4-4zM62 22l-8 8M70 30l-8 8M78 38l-8 8M44 70a6 6 0 1 0 0.1 0',
  // Padel: the holed bat, short handle.
  padel:
    'M46 20a20 20 0 1 1 0 40a20 20 0 1 1 0-40zM46 60v14M40 74h12v10H40zM40 34h.1M52 34h.1M34 44h.1M46 44h.1M58 44h.1M40 54h.1M52 54h.1M78 24l6 6M84 24l-6 6',
  // Squash: long thin racket and a small ball low in the frame.
  squash:
    'M50 16a14 20 0 1 0 0.1 0M40 26h20M38 36h24M40 46h20M46 20v36M54 20v36M50 56v30M44 86h12M80 74a5 5 0 1 0 0.1 0',
  // Table tennis: bat and a ball.
  table_tennis:
    'M48 24a20 20 0 1 1 0 40a20 20 0 1 1 0-40zM48 64v10M42 74h12v10H42zM78 36a6 6 0 1 0 0.1 0M18 80h60',
  cycling:
    'M26 70a14 14 0 1 0 0.1 0M78 70a14 14 0 1 0 0.1 0M26 70l18-28h18l16 28M44 42l-8-12h12M62 42l12 28',
  swimming: 'M14 70c8-6 16-6 24 0s16 6 24 0 16-6 24 0M60 34a6 6 0 1 0 0.1 0M24 60l20-18 12 10 10-6',
  families:
    'M28 26a7 7 0 1 0 0.1 0M28 34v28M16 46l12-8 12 8M28 62l-8 18M28 62l8 18M72 26a7 7 0 1 0 0.1 0M72 34v28M60 46l12-8 12 8M72 62l-8 18M72 62l8 18M50 46a5 5 0 1 0 0.1 0M50 52v18M42 60l8-5 8 5M50 70l-5 12M50 70l5 12',
  music: 'M40 70a8 8 0 1 0 0.1 0M72 62a8 8 0 1 0 0.1 0M48 70V30l32-8v40M48 42l32-8',
  volunteering: 'M50 66L34 50a9 9 0 0 1 16-10a9 9 0 0 1 16 10zM26 74c6 8 14 12 24 12s18-4 24-12',
  sports:
    'M52 24a28 28 0 1 0 0.1 0M24 52h56M52 24c-10 8-14 18-14 28s4 20 14 28c10-8 14-18 14-28s-4-20-14-28',
};

export function InterestArt({ id, className = '' }: { id: string; className?: string }) {
  const d = PATHS[id] ?? PATHS['sports']!;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
