import Link from 'next/link';
import type { ReactNode } from 'react';
import { RallyMark } from './brand';
import { RallyShowcase } from './rally-showcase';
import { Icon } from './ui';

/*
 * Rally's marketing surface. Rendered inside `.theme-night` (dark tokens), with Rally's
 * condensed display face, so it reads as its own product next to Buddy Club.
 */

export function Wide({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-5xl px-5 ${className}`}>{children}</div>;
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="font-display text-[14px] font-bold uppercase tracking-[0.14em] text-live">
      {children}
    </div>
  );
}

export function RallyMarketingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-paper/90 backdrop-blur">
      <Wide className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2.5 text-ink">
          <RallyMark size={40} title="Buddy Club" />
          <span className="font-display text-[26px] font-extrabold uppercase tracking-[0.04em]">
            Buddy Club
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="hidden items-center gap-6 text-[15px] font-semibold sm:flex"
        >
          <a href="/#how" className="text-ink-2 hover:text-ink">
            How it works
          </a>
          <a href="/#features" className="text-ink-2 hover:text-ink">
            What it does
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? null : (
            <Link
              href="/sign-in"
              className="inline-flex min-h-10 items-center rounded-full border-[1.5px] border-hairline-strong px-4 text-[13px] font-bold text-ink hover:border-ink"
            >
              Sign in
            </Link>
          )}
          <Link
            href="/dashboard"
            className="inline-flex min-h-10 items-center rounded-full bg-live px-4 text-[13px] font-bold text-live-ink hover:brightness-95"
          >
            Open the app
          </Link>
        </div>
      </Wide>
    </header>
  );
}

const FEATURES: {
  icon: 'sync' | 'qr' | 'clock' | 'trophy' | 'users' | 'offline';
  title: string;
  body: string;
}[] = [
  {
    icon: 'sync',
    title: 'Fair rotations',
    body: 'Who plays with whom, who sits out, and when. Levels, pairs and rest handled every round, with the organiser able to overrule.',
  },
  {
    icon: 'qr',
    title: 'Live board and QR join',
    body: 'A board for the hall TV that changes as rounds change. Players scan to join and see their own court on their phone.',
  },
  {
    icon: 'clock',
    title: 'One timer',
    body: 'The server keeps time, so every phone and the board agree. Pause, extend, finish.',
  },
  {
    icon: 'trophy',
    title: 'Leagues and tournaments',
    body: 'Divisions, fixtures, results with confirmation, standings, pools into knockout, disputes to the director.',
  },
  {
    icon: 'users',
    title: 'Members, guests, walk-ins',
    body: 'Club members, guests by link and walk-ins on the night, all on one list. Nobody needs an account to play.',
  },
  {
    icon: 'offline',
    title: 'Works on its own',
    body: 'No club needed. Start a session on your own phone, or run one for a club. Your buddies and your clubs are right there when you want more players.',
  },
];

const STEPS: [string, string, string][] = [
  [
    '01',
    'Open a session',
    'Pick a session or set courts, round length and who is in. Share the code or the QR.',
  ],
  [
    '02',
    'Call the round',
    'Buddy Club proposes the fairest next round. Change anything, then publish. Everyone sees their court.',
  ],
  [
    '03',
    'Play, repeat',
    'The timer runs, results go in, the next round is ready. Standings keep themselves on league nights.',
  ],
];

export function RallyLanding() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(var(--bc-live) 1px, transparent 1px), linear-gradient(90deg, var(--bc-live) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at 70% 30%, black 20%, transparent 70%)',
          }}
        />
        <Wide className="relative grid items-center gap-10 py-16 sm:py-24 md:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-6">
            <Kicker>Badminton · Padel · Pickleball · Tennis · Squash</Kicker>
            <h1 className="font-display text-[64px] font-extrabold uppercase leading-[0.9] tracking-[0.01em] sm:text-[104px]">
              Run the
              <br />
              session.
            </h1>
            <p className="max-w-lg text-lg leading-7 text-ink-2 sm:text-xl">
              Fair rotations, a live court board, one timer everyone agrees with, and leagues when
              you&apos;re ready. The organiser&apos;s phone stops being the bottleneck.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex min-h-14 items-center rounded-control bg-live px-7 font-display text-[20px] font-bold uppercase tracking-[0.06em] text-live-ink hover:brightness-95"
              >
                Start a session
              </Link>
              <a
                href="#how"
                className="inline-flex min-h-14 items-center rounded-control border-[1.5px] border-hairline-strong px-7 font-display text-[20px] font-bold uppercase tracking-[0.06em] text-ink hover:border-ink"
              >
                See how it works
              </a>
            </div>
            <p className="text-[13px] text-muted">
              Free for social sessions. Works in the browser; add it to your home screen.
            </p>
          </div>
          <RallyShowcase />
        </Wide>
      </section>

      <section id="how" className="border-y border-hairline bg-surface">
        <Wide className="py-16">
          <Kicker>How it works</Kicker>
          <div className="mt-6 grid gap-8 md:grid-cols-3">
            {STEPS.map(([n, t, b]) => (
              <div key={n} className="flex flex-col gap-3">
                <span className="tnum font-display text-[72px] font-extrabold leading-none text-primary">
                  {n}
                </span>
                <h2 className="font-display text-[28px] font-bold uppercase tracking-[0.02em]">
                  {t}
                </h2>
                <p className="leading-6 text-ink-2">{b}</p>
              </div>
            ))}
          </div>
        </Wide>
      </section>

      <section id="features">
        <Wide className="py-16">
          <Kicker>What it does</Kicker>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex flex-col gap-3 rounded-card border border-hairline bg-surface p-5"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-tint text-live">
                  <Icon name={f.icon} size={22} />
                </span>
                <h2 className="font-display text-[24px] font-bold uppercase tracking-[0.02em]">
                  {f.title}
                </h2>
                <p className="text-[15px] leading-6 text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </Wide>
      </section>

      <section className="bg-live text-live-ink">
        <Wide className="flex flex-wrap items-center justify-between gap-6 py-14">
          <h2 className="font-display text-[48px] font-extrabold uppercase leading-none tracking-[0.01em] sm:text-[64px]">
            Tonight, then.
          </h2>
          <Link
            href="/dashboard"
            className="inline-flex min-h-14 items-center rounded-control bg-live-ink px-7 font-display text-[20px] font-bold uppercase tracking-[0.06em] text-live hover:brightness-110"
          >
            Start a session
          </Link>
        </Wide>
      </section>
    </main>
  );
}

export function RallyMarketingFooter() {
  return (
    <footer className="border-t border-hairline">
      <Wide className="flex flex-wrap items-center justify-between gap-4 py-7 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <RallyMark size={18} color="var(--bc-primary)" ball="var(--bc-live)" />
          Buddy Club
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link href="/dashboard">Open the app</Link>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </Wide>
    </footer>
  );
}
