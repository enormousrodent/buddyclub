import type { Product } from '../lib/env';

/*
 * Brand marks (docs/design/README.md, "Brand identity").
 * Buddy Club: the owner's logo (2026-10-20), a tilted rounded ring in pink with two orange
 * bars; it carries its own colours, or one colour when `mono` is set (white on a tile, for
 * instance). Rally: a racket and a ball drawn with one stroke weight, taking the current colour.
 */

export const BUDDY_CLUB_LOGO = {
  viewBox: '0 0 160 158',
  ring: 'M22.1641 88.1441C14.8938 79.6083 15.9196 66.795 24.4554 59.5246L70.6671 20.164C79.2029 12.8937 92.0163 13.9196 99.2866 22.4554L107.843 32.5014L96.2516 42.3745L92.0392 37.4288C87.8224 32.4781 80.3906 31.8831 75.4399 36.0999L39.4288 66.7722C34.478 70.989 33.883 78.4207 38.0998 83.3715L68.7721 119.383C72.9889 124.333 80.4207 124.928 85.3714 120.712L121.383 90.0393C126.333 85.8225 126.928 78.3907 122.711 73.44L118.499 68.4942L130.091 58.621L138.647 68.667C145.918 77.2028 144.892 90.0162 136.356 97.2865L90.1442 136.647C81.6084 143.917 68.795 142.892 61.5247 134.356L22.1641 88.1441Z',
  bars: [
    'M50.9365 76.0461L76.3607 54.3912C79.5616 51.6649 84.3666 52.0496 87.093 55.2505C89.8194 58.4514 89.4347 63.2564 86.2337 65.9828L60.8096 87.6377L50.9365 76.0461Z',
    'M66.3384 94.1294L91.7625 72.4745C94.9635 69.7481 99.7685 70.1328 102.495 73.3337C105.221 76.5347 104.837 81.3397 101.636 84.066L76.2114 105.721L66.3384 94.1294Z',
  ],
  ringColor: '#FF4A79',
  barColor: '#F77A55',
} as const;

export function BuddyClubMark({
  size = 28,
  mono,
  title,
}: {
  size?: number;
  /** Render the whole mark in one colour (for example white on a coloured tile). */
  mono?: string;
  title?: string;
}) {
  const L = BUDDY_CLUB_LOGO;
  return (
    <svg
      width={size}
      height={size * (158 / 160)}
      viewBox={L.viewBox}
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={L.ring} fill={mono ?? L.ringColor} />
      {L.bars.map((d) => (
        <path key={d.slice(0, 12)} d={d} fill={mono ?? L.barColor} />
      ))}
    </svg>
  );
}

export function RallyMark({
  size = 28,
  color = 'currentColor',
  ball = 'var(--bc-ink)',
  title,
}: {
  size?: number;
  color?: string;
  ball?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="42" cy="42" r="23" stroke={color} strokeWidth="11" />
      <path d="M59 59l24 24" stroke={color} strokeWidth="13" strokeLinecap="round" />
      <circle cx="79" cy="25" r="9" fill={ball} />
    </svg>
  );
}

export function ProductMark({
  product,
  size = 28,
  color,
  title,
}: {
  product: Product;
  size?: number;
  /** Rally's stroke colour; ignored by the Buddy Club logo, which keeps its own colours. */
  color?: string;
  title?: string;
}) {
  return product === 'rally' ? (
    <RallyMark size={size} color={color ?? 'var(--bc-primary)'} {...(title ? { title } : {})} />
  ) : (
    <BuddyClubMark size={size} {...(title ? { title } : {})} />
  );
}

/** Mark plus wordmark, for shells and sign-in. */
export function Lockup({ product, size = 28 }: { product: Product; size?: number }) {
  const name = product === 'rally' ? 'Rally' : 'Buddy Club';
  return (
    <span className="inline-flex items-center gap-2">
      <ProductMark product={product} size={size} title={name} />
      <span className="font-display text-xl font-bold leading-none">{name}</span>
      {product === 'rally' ? (
        <span className="mt-1 text-xs font-medium text-muted">by Buddy Club</span>
      ) : null}
    </span>
  );
}

/** App-icon tile used on sign-in and empty states. Buddy Club's logo sits on white in its own colours. */
export function IconTile({ product, size = 72 }: { product: Product; size?: number }) {
  if (product === 'rally') {
    return (
      <span
        className="inline-flex items-center justify-center"
        style={{ width: size, height: size, borderRadius: size / 4, background: '#2350d6' }}
      >
        <RallyMark size={size * 0.62} color="#ffffff" ball="#d9f74d" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center border border-hairline bg-white"
      style={{ width: size, height: size, borderRadius: size / 4 }}
    >
      <BuddyClubMark size={size * 0.66} />
    </span>
  );
}
