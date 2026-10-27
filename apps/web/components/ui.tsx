import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/*
 * Shared web components for the "Paper & Path" system (docs/design/README.md).
 * Keep this file presentational: no data fetching, no product logic.
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Icon({
  name,
  size = 20,
  className,
}: {
  name:
    | 'back'
    | 'chevron'
    | 'plus'
    | 'check'
    | 'clock'
    | 'lock'
    | 'qr'
    | 'pin'
    | 'users'
    | 'calendar'
    | 'trophy'
    | 'list'
    | 'user'
    | 'home'
    | 'search'
    | 'offline'
    | 'sync'
    | 'wave'
    | 'download'
    | 'pause'
    | 'play'
    | 'alert'
    | 'share'
    | 'x';
  size?: number;
  className?: string;
}) {
  const paths: Record<string, ReactNode> = {
    back: <path d="M15 6l-6 6 6 6" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="M5 13l4 4L19 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
    qr: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <circle cx="17" cy="9" r="2" />
        <path d="M3 20a6 6 0 0 1 12 0M14 20a4 4 0 0 1 7 0" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>
    ),
    trophy: (
      <path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3" />
    ),
    list: <path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </>
    ),
    offline: (
      <path d="M3 3l18 18M8.5 8.6A5 5 0 0 0 12 17a5 5 0 0 0 3.5-1.4M5 12.5A10 10 0 0 1 12 7c2 0 3.8.6 5.3 1.6" />
    ),
    sync: <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />,
    wave: <path d="M2 12h6l3 8 4-16 3 8h4" />,
    download: <path d="M12 3v12M8 11l4 4 4-4M4 19h16" />,
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="M7 5l12 7-12 7z" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </>
    ),
    share: <path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export function Page({
  title,
  eyebrow,
  lead,
  back,
  action,
  children,
  display = true,
}: {
  title: string;
  /** Small line above the title (club name, date). */
  eyebrow?: ReactNode;
  /** One sentence under the title. */
  lead?: ReactNode;
  back?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Use the display face for the title (default). Set false for utility screens. */
  display?: boolean;
}) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-28 pt-4">
      <header className="mb-5 flex items-start gap-2">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Icon name="back" size={22} />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 text-sm font-semibold text-muted">{eyebrow}</div> : null}
          <h1
            className={cx(
              'text-[28px] font-bold leading-8',
              display ? 'font-display' : 'tracking-tight',
            )}
          >
            {title}
          </h1>
          {lead ? <p className="mt-1.5 text-[15px] leading-6 text-ink-2">{lead}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = '',
  tone = 'surface',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'surface' | 'well' | 'ink' | 'live';
}) {
  const tones = {
    surface: 'border border-hairline bg-surface',
    well: 'bg-surface-2',
    ink: 'bg-ink text-on-ink',
    live: 'border-2 border-live bg-surface',
  };
  return <section className={cx('rounded-card p-4', tones[tone], className)}>{children}</section>;
}

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'lg' | 'sm';

function buttonClasses(variant: ButtonVariant, size: ButtonSize, className: string): string {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-primary-ink hover:bg-primary-strong',
    secondary: 'border-[1.5px] border-ink bg-transparent text-ink hover:bg-surface-2',
    tonal: 'bg-tint text-tint-ink hover:brightness-95',
    ghost: 'bg-transparent text-primary hover:bg-surface-2',
    danger: 'border-[1.5px] border-danger bg-transparent text-danger hover:bg-danger-soft',
  };
  const sizes: Record<ButtonSize, string> = {
    sm: 'min-h-9 px-3 text-[13px] rounded-full',
    md: 'min-h-12 px-4 text-[15px] rounded-control',
    lg: 'min-h-14 px-5 text-base rounded-[14px]',
  };
  return cx(
    'inline-flex items-center justify-center gap-2 font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  children,
  className = '',
  variant = 'primary',
  size = 'md',
}: {
  href: string;
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className={cx('mb-1.5 block text-[13px] font-semibold', error && 'text-danger')}>
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[13px] font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const controlClass =
  'min-h-12 w-full rounded-control border-[1.5px] border-hairline bg-surface px-3.5 text-base text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-tint';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={cx(controlClass, className)} {...props} />;
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select className={cx(controlClass, className)} {...props} />;
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(controlClass, 'py-3', className)} {...props} />;
}

export function Empty({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border-[1.5px] border-dashed border-hairline-strong p-6 text-center">
      {title ? <p className="text-base font-bold">{title}</p> : null}
      <p className="text-sm leading-5 text-muted">{children}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={cx('text-sm text-muted', className)}>{children}</span>;
}

export type BadgeTone = 'neutral' | 'primary' | 'live' | 'success' | 'warning' | 'danger' | 'info';

/** Status pill. Pass a tone and, for anything that must be told apart, a leading icon or dot. */
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-surface-2 text-ink',
    primary: 'bg-tint text-tint-ink',
    live: 'bg-live text-live-ink',
    success: 'bg-success text-success-ink',
    warning: 'bg-warning text-warning-ink',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info text-info-ink',
  };
  return (
    <span
      className={cx(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold',
        tones[tone],
      )}
    >
      {dot ? <span className="h-1.75 w-1.75 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Maps API state words to a tone so screens don't each invent one. */
export function stateTone(state: string): BadgeTone {
  switch (state) {
    case 'live':
    case 'in_progress':
      return 'live';
    case 'open':
    case 'published':
    case 'checked_in':
    case 'confirmed':
    case 'completed':
    case 'active':
      return 'success';
    case 'paused':
    case 'submitted':
    case 'needs_review':
    case 'pending':
    case 'invited':
      return 'warning';
    case 'cancelled':
    case 'disputed':
    case 'no_show':
    case 'void':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Words people see for API states that read badly as they are. */
const STATE_LABELS: Record<string, string> = {
  // A night (or meet) that exists but is not open yet.
  draft: 'planned',
};

export function StateBadge({ state }: { state: string }) {
  const label = STATE_LABELS[state] ?? state.replace(/_/g, ' ');
  return (
    <Badge tone={stateTone(state)} dot={state === 'live' || state === 'in_progress'}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
}

export function Avatar({
  name,
  size = 40,
  src,
}: {
  name: string;
  size?: number;
  /** Profile photo; initials when absent. */
  src?: string | null | undefined;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  if (src)
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-tint font-bold text-tint-ink"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
    >
      {initials || '?'}
    </span>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface">
      {children}
    </ul>
  );
}

export function Row({
  href,
  title,
  subtitle,
  right,
  leading,
}: {
  href?: string | undefined;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  leading?: ReactNode;
}) {
  const inner = (
    <div className="flex min-h-15 items-center gap-3 px-4 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold">{title}</div>
        {subtitle ? <div className="truncate text-[13px] text-muted">{subtitle}</div> : null}
      </div>
      {right}
      {href ? <Icon name="chevron" size={18} className="shrink-0 text-muted" /> : null}
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block hover:bg-surface-2">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

export function Tabs({
  items,
  current,
}: {
  items: { href: string; label: string }[];
  current: string;
}) {
  return (
    <nav className="scroll-hide mb-4 flex gap-1 rounded-control bg-surface-2 p-1 text-sm">
      {items.map((item) => {
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              'min-h-10 whitespace-nowrap rounded-[9px] px-3 py-2 font-semibold',
              active ? 'bg-surface text-ink shadow-raised' : 'text-muted',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <div className="font-display text-3xl font-bold">{value}</div>
      <div className="text-[13px] text-muted">{label}</div>
    </Card>
  );
}

export function Alert({
  tone = 'warning',
  children,
  title,
}: {
  tone?: 'warning' | 'danger' | 'info' | 'success' | 'ink';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    warning: 'bg-warning text-warning-ink',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info text-info-ink',
    success: 'bg-success text-success-ink',
    ink: 'bg-ink text-on-ink',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('rounded-control px-3.5 py-3 text-sm leading-5', tones[tone])}
    >
      {title ? <div className="font-bold">{title}</div> : null}
      {children}
    </div>
  );
}

/** Small inline text button for row actions (keeps a 44px hit area). */
export function TextButton({
  children,
  danger = false,
  ...props
}: ComponentProps<'button'> & { danger?: boolean }) {
  return (
    <button
      type="submit"
      className={cx(
        'inline-flex min-h-11 items-center px-1 text-[13px] font-bold',
        danger ? 'text-danger' : 'text-primary',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Placeholder blocks shown while a page's data loads (route `loading.tsx`). Shaped like the
 * screens they stand in for: a title, then a few rows. Nothing moves except a slow pulse.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <main
      className="mx-auto w-full max-w-xl animate-pulse px-5 pb-28 pt-4"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="mb-5 h-8 w-2/5 rounded-lg bg-surface-2" />
      <div className="mb-3 h-22 rounded-[20px] bg-surface-2" />
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-16 rounded-card bg-surface-2" />
        ))}
      </div>
    </main>
  );
}
