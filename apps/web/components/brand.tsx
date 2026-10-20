import type { Product } from '../lib/env';

/**
 * Brand marks (docs/design/README.md, "Brand identity").
 * The Buddy Club B is one unbroken stroke: a shared path, not a letter. Rally is a racket and a
 * ball drawn with the same stroke weight. Both are inline SVG so they take the current colour.
 */
export function BuddyClubMark({
  size = 28,
  color = 'currentColor',
  title,
}: {
  size?: number;
  color?: string;
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
      <path
        d="M28 86V16h22a17 17 0 0 1 0 34H28h26a18 18 0 0 1 0 36H40"
        stroke={color}
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  color?: string;
  title?: string;
}) {
  const c = color ?? 'var(--bc-primary)';
  return product === 'rally' ? (
    <RallyMark size={size} color={c} {...(title ? { title } : {})} />
  ) : (
    <BuddyClubMark size={size} color={c} {...(title ? { title } : {})} />
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

/** App-icon tile used on sign-in and empty states. */
export function IconTile({ product, size = 72 }: { product: Product; size?: number }) {
  const bg = product === 'rally' ? '#2350d6' : '#1f5f43';
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 4, background: bg }}
    >
      {product === 'rally' ? (
        <RallyMark size={size * 0.62} color="#f6f3ec" ball="#c9f24a" />
      ) : (
        <BuddyClubMark size={size * 0.62} color="#f6f3ec" />
      )}
    </span>
  );
}
