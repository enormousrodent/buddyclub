import type { ReactNode } from 'react';

type Side = { displayName: string }[];

/**
 * Court card: the number is the biggest thing on it (48px), teams underneath, "vs" between.
 * `highlight` is for the viewer's own court; `tone="ink"` for the player screen hero.
 */
export function CourtCard({
  code,
  teams,
  highlight = false,
  footer,
}: {
  code: string;
  teams: [Side | undefined, Side | undefined] | Side[];
  highlight?: boolean;
  footer?: ReactNode;
}) {
  const names = (side: Side | undefined) => side?.map((p) => p.displayName).join(' & ') || '—';
  return (
    <div
      className={`flex min-h-[132px] flex-col gap-1.5 rounded-card bg-surface p-3.5 ${
        highlight ? 'border-2 border-live' : 'border border-hairline'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.03em]">
          {code}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          {highlight ? 'your court' : 'court'}
        </span>
      </div>
      <div className="text-[15px] font-semibold leading-5">{names(teams[0])}</div>
      <div className="text-xs text-muted">vs</div>
      <div className="text-[15px] font-semibold leading-5">{names(teams[1])}</div>
      {footer}
    </div>
  );
}

export function RestingStrip({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface-2 px-3.5 py-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Resting</span>
      <span className="text-[15px] font-semibold">{names.join(', ')}</span>
    </div>
  );
}

/** Player hero: the court number at 120px on ink, partner and opponents underneath. */
export function MyCourtHero({
  courtCode,
  partners,
  opponents,
  resting,
  topLeft,
  topRight,
}: {
  courtCode?: string | null;
  partners: string[];
  opponents: string[];
  resting: boolean;
  topLeft: ReactNode;
  topRight: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-sheet bg-ink px-5 pb-5 pt-5 text-on-ink">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-on-ink-accent">
          {topLeft}
        </span>
        {topRight}
      </div>
      {resting ? (
        <div className="py-4">
          <div className="font-display text-[40px] font-bold leading-tight">Sit this one out</div>
          <div className="mt-1 text-on-ink-muted">Back on court next round.</div>
        </div>
      ) : (
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold text-on-ink-muted">Court</span>
          <span className="font-display text-[120px] font-extrabold leading-[0.92] tracking-[-0.05em]">
            {courtCode ?? '?'}
          </span>
        </div>
      )}
      {!resting ? (
        <div className="flex flex-col gap-1.5 border-t border-on-ink-hairline pt-2.5">
          {partners.length ? (
            <div className="flex items-center gap-2.5">
              <span className="w-16 text-xs font-bold uppercase tracking-[0.06em] text-on-ink-muted">
                With
              </span>
              <span className="text-xl font-bold">{partners.join(' & ')}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2.5">
            <span className="w-16 text-xs font-bold uppercase tracking-[0.06em] text-on-ink-muted">
              Against
            </span>
            <span className="text-[17px] font-semibold text-on-ink/90">
              {opponents.join(' & ') || '—'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
