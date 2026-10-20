import type { DiscoverResult } from '@buddyclub/shared-types';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BuddyClubMark, RallyMark } from './brand';
import { MyCourtHero } from './court';
import { ActivityCard } from './discover';
import { Button, Icon, Input, LinkButton } from './ui';

/*
 * Signed-out marketing pages (docs/design: "Buddy Club homepage" canvas, direction A with B's
 * word mosaic). Presentational only; the pages fetch and pass data in.
 */

export function Wide({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-5xl px-5 ${className}`}>{children}</div>;
}

function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[13px] font-bold uppercase tracking-[0.06em] text-muted ${className}`}>
      {children}
    </div>
  );
}

const INTEREST_WORDS: { id: string; label: string; swatch: number; wide?: boolean }[] = [
  { id: 'books', label: 'Books', swatch: 4, wide: true },
  { id: 'dog_walking', label: 'Dog walking', swatch: 2 },
  { id: 'running', label: 'Running', swatch: 5 },
  { id: 'parent_toddler', label: 'Parent and toddler', swatch: 6 },
  { id: 'board_games', label: 'Board games', swatch: 3 },
  { id: 'walking', label: 'Walking and hiking', swatch: 1, wide: true },
  { id: 'wellbeing', label: 'Wellbeing', swatch: 5 },
  { id: 'food_drink', label: 'Food and drink', swatch: 4 },
  { id: 'arts_crafts', label: 'Arts and crafts', swatch: 2 },
];

export function LandingHero({
  interests,
  locality,
}: {
  interests: DiscoverResult['interests'];
  locality?: string | undefined;
}) {
  return (
    <section className="pb-10 pt-12 sm:pt-20">
      <div className="flex max-w-3xl flex-col gap-5">
        <Eyebrow>Groups and gatherings near you</Eyebrow>
        <h1 className="font-display text-[44px] font-extrabold leading-[1.02] sm:text-[64px]">
          Find your people. Then actually go.
        </h1>
        <p className="max-w-xl text-lg leading-7 text-ink-2 sm:text-xl">
          Book clubs, dog walks, toddler mornings, badminton nights. Real groups in your town, each
          with a place, a time and a button that says you&apos;re going.
        </p>
      </div>
      <form
        method="get"
        action="/explore"
        className="mt-8 grid gap-2.5 rounded-card border border-hairline bg-surface p-2.5 shadow-raised sm:grid-cols-[1.4fr_1fr_auto]"
      >
        <label className="flex min-w-0 flex-col gap-1">
          <span className="pl-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            What do you fancy?
          </span>
          <Input id="landing-q" name="q" placeholder="Books, dogs, running, badminton…" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="pl-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Where?
          </span>
          <Input
            id="landing-locality"
            name="locality"
            defaultValue={locality ?? ''}
            placeholder="Town or area"
          />
        </label>
        <Button type="submit" className="self-end sm:min-h-12 sm:px-6">
          Show me
        </Button>
      </form>
      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {interests.slice(0, 10).map((i) => (
          <Link
            key={i.id}
            href={`/explore?interest=${encodeURIComponent(i.id)}`}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-hairline bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-2"
          >
            {i.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function HappeningSoon({
  result,
  locality,
}: {
  result: DiscoverResult;
  locality?: string | undefined;
}) {
  const items = result.activities.slice(0, 6);
  return (
    <section className="pb-16">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[26px] font-bold sm:text-[28px]">
          {locality ? `Happening soon in ${locality}` : 'Happening soon'}
        </h2>
        <Link href="/explore" className="text-[15px] font-bold text-primary">
          See everything
        </Link>
      </div>
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <ActivityCard key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border-[1.5px] border-dashed border-hairline-strong p-6 text-center">
          <p className="text-base font-bold">Nothing public here yet.</p>
          <p className="mt-1 text-sm text-muted">
            Be the first. Start a group and put a gathering up for your town.
          </p>
          <LinkButton href="/groups/new" size="sm" className="mt-3">
            Start a group
          </LinkButton>
        </div>
      )}
    </section>
  );
}

const STEPS: { icon: 'search' | 'check' | 'pin'; title: string; body: string }[] = [
  {
    icon: 'search',
    title: 'Find a group',
    body: 'Search by what you like and where you are. Every group is real people meeting in a real place, not a chat room.',
  },
  {
    icon: 'check',
    title: "Say you're going",
    body: 'One tap. The organiser sees numbers, you see who else is coming, and nobody chases anyone on a group chat.',
  },
  {
    icon: 'pin',
    title: 'Turn up',
    body: 'The place and time are on the card. Walk in, say hello, and come back next week if you liked it.',
  },
];

export function HowItWorks() {
  return (
    <section className="pb-16">
      <Eyebrow className="mb-3">How it works</Eyebrow>
      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.title} className="flex flex-col gap-2.5 rounded-card bg-surface-2 p-6">
            <Icon name={s.icon} size={28} className="text-primary" />
            <h3 className="font-display text-[22px] font-bold">{s.title}</h3>
            <p className="leading-6 text-ink-2">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function InterestMosaic() {
  return (
    <section className="border-y border-hairline bg-surface">
      <Wide className="py-14">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[32px] font-extrabold leading-tight sm:text-[40px]">
            No sport required.
          </h2>
          <Eyebrow>Though sport is very welcome</Eyebrow>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INTEREST_WORDS.map((w) => (
            <Link
              key={w.id}
              href={`/explore?interest=${w.id}`}
              className={`flex min-h-[120px] items-end rounded-card p-4 font-display text-[22px] font-bold text-ink sm:min-h-[150px] sm:text-[26px] ${
                w.wide ? 'sm:col-span-2 sm:text-[32px]' : ''
              }`}
              style={{ background: `var(--bc-swatch-${w.swatch})` }}
            >
              {w.label}
            </Link>
          ))}
          <Link
            href="/rally"
            className="flex min-h-[120px] flex-col justify-end gap-1 rounded-card bg-night p-4 font-display text-[22px] font-bold text-night-ink sm:min-h-[150px] sm:text-[26px]"
          >
            Racket sports
            <span className="font-sans text-[13px] font-semibold text-live">with Rally</span>
          </Link>
        </div>
      </Wide>
    </section>
  );
}

export function ForOrganisers() {
  const points = [
    'Public or private groups, open or invitation only',
    'Gatherings with capacity, so a full room stays full',
    "Members, join links and who's coming, in one place",
    'Racket sports get Rally for the courts, free with your club',
  ];
  return (
    <section className="py-16">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Eyebrow>For organisers</Eyebrow>
          <h2 className="font-display text-[32px] font-extrabold leading-tight sm:text-[40px]">
            Run your group without the admin.
          </h2>
          <p className="text-[17px] leading-7 text-ink-2">
            Set up a group in a minute. Add a gathering with a time, a place and a capacity. Share
            one link. People say they&apos;re going and you see who, without a spreadsheet or a
            group chat you dread opening.
          </p>
          <ul className="flex flex-col gap-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-tint text-tint-ink">
                  <Icon name="check" size={13} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2.5 pt-2">
            <LinkButton href="/groups/new">Start a group</LinkButton>
            <LinkButton href="/explore" variant="secondary">
              See groups first
            </LinkButton>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-card border border-hairline bg-surface p-4 shadow-sheet">
          <div className="flex items-center justify-between">
            <Eyebrow>Your group</Eyebrow>
            <span className="inline-flex h-7 items-center rounded-full bg-success px-2.5 text-xs font-bold text-success-ink">
              Public · open
            </span>
          </div>
          <div className="font-display text-2xl font-bold">Winchester Book Club</div>
          <div className="text-sm text-muted">Books · 14 members · Winchester</div>
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            {[
              ['October read', 'Thu 19:00 · 9 going · 3 spaces'],
              ['November pick', 'Thu 19:00 · 2 going'],
            ].map(([t, s]) => (
              <div
                key={t}
                className="flex items-center justify-between gap-3 rounded-control bg-surface-2 p-3"
              >
                <div>
                  <div className="font-bold">{t}</div>
                  <div className="text-[13px] text-muted">{s}</div>
                </div>
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold">Edit</span>
              </div>
            ))}
          </div>
          <span className="inline-flex min-h-11 items-center justify-center rounded-control bg-ink text-[15px] font-bold text-on-ink">
            Add a gathering
          </span>
        </div>
      </div>
    </section>
  );
}

export function RallyBand({ rallyUrl }: { rallyUrl: string }) {
  return (
    <section className="bg-night text-night-ink">
      <Wide className="py-14">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <RallyMark size={28} color="#7b9dff" ball="#c9f24a" />
              <span className="font-display text-[22px] font-bold">Rally</span>
              <span className="text-[13px] text-night-muted">by Buddy Club</span>
            </div>
            <h2 className="font-display text-[32px] font-extrabold leading-tight sm:text-[40px]">
              Racket sports? Rally runs the night.
            </h2>
            <p className="text-[17px] leading-7 text-night-muted">
              Fair rotations, a live court board on the hall TV, a timer everyone agrees with, and
              leagues when you&apos;re ready. Rally is its own app, and it works with or without a
              Buddy Club group.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/rally"
                className="inline-flex min-h-12 items-center rounded-control bg-live px-5 text-[15px] font-bold text-live-ink"
              >
                See Rally
              </Link>
              <a
                href={rallyUrl}
                className="inline-flex min-h-12 items-center rounded-control border-[1.5px] border-night-hairline px-5 text-[15px] font-bold text-night-ink"
              >
                Open the app
              </a>
            </div>
          </div>
          <MyCourtHero
            courtCode="4"
            partners={['Priya Kapoor']}
            opponents={['Tom Okafor', 'Mei Chen']}
            resting={false}
            topLeft="Now · round 3"
            topRight={<span className="tnum text-2xl font-extrabold">07:42</span>}
          />
        </div>
      </Wide>
    </section>
  );
}

export function TrustRow() {
  const items: [string, string][] = [
    [
      'What it costs',
      "Free to join a group and to say you're going. Organiser plans are still being worked out.",
    ],
    [
      'Keeping it safe',
      'Organisers decide who joins and can remove anyone. Private groups never appear in search.',
    ],
    ['Your data', 'Nothing about you is shown to anyone until you sign in and join something.'],
  ];
  return (
    <section className="py-14">
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map(([t, b]) => (
          <div key={t} className="flex flex-col gap-2">
            <Eyebrow>{t}</Eyebrow>
            <p className="leading-6 text-ink-2">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-hairline">
      <Wide className="flex flex-wrap items-center justify-between gap-4 py-7 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <BuddyClubMark size={18} color="var(--bc-primary)" />
          Buddy Club · Rally by Buddy Club
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link href="/rally">Rally</Link>
          <Link href="/explore">Explore</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </Wide>
    </footer>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Rally sub-page (/rally on the Buddy Club host; later the Rally host's own front page).
 */

const RALLY_FEATURES: {
  icon: 'sync' | 'qr' | 'clock' | 'trophy' | 'offline' | 'users';
  title: string;
  body: string;
}[] = [
  {
    icon: 'sync',
    title: 'Fair rotations',
    body: 'Who plays with whom, who sits out, and when. Levels, pairs and rest are all handled, round after round.',
  },
  {
    icon: 'qr',
    title: 'Live board and QR join',
    body: 'A board for the hall TV that updates as rounds change. Players scan to join and see their own court on their phone.',
  },
  {
    icon: 'clock',
    title: 'One timer',
    body: 'The server keeps time, so every phone and the board agree. Pause, extend, finish.',
  },
  {
    icon: 'trophy',
    title: 'Leagues and tournaments',
    body: 'Divisions, fixtures, results with confirmation, standings, pools into knockout. Disputes handled by the director.',
  },
  {
    icon: 'users',
    title: 'Members and walk-ins',
    body: 'Club members, guests by link and walk-ins on the night, all on the same list.',
  },
  {
    icon: 'offline',
    title: 'Works on its own',
    body: 'No club needed. Start a session on your own, or run it for a club. Link it to a Buddy Club gathering when you want one attendance list.',
  },
];

export function RallyLanding({ rallyUrl }: { rallyUrl: string }) {
  return (
    <main className="pb-16">
      <section className="bg-night text-night-ink">
        <Wide className="py-14 sm:py-20">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2.5">
                <RallyMark size={32} color="#7b9dff" ball="#c9f24a" />
                <span className="font-display text-[26px] font-bold">Rally</span>
                <span className="text-[13px] text-night-muted">by Buddy Club</span>
              </div>
              <h1 className="font-display text-[44px] font-extrabold leading-[1.02] sm:text-[64px]">
                Run the session.
              </h1>
              <p className="max-w-lg text-lg leading-7 text-night-muted sm:text-xl">
                For badminton, padel, pickleball, tennis and squash nights. Fair rotations, live
                court boards, one timer, and leagues when you&apos;re ready. The organiser&apos;s
                phone stops being the bottleneck.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href={`${rallyUrl}/start`}
                  className="inline-flex min-h-13 items-center rounded-control bg-live px-6 text-base font-bold text-live-ink"
                >
                  Start a session
                </a>
                <a
                  href={rallyUrl}
                  className="inline-flex min-h-13 items-center rounded-control border-[1.5px] border-night-hairline px-6 text-base font-bold text-night-ink"
                >
                  Open Rally
                </a>
              </div>
              <p className="text-[13px] text-night-muted">
                Free for social sessions. Works in the browser; add it to your home screen.
              </p>
            </div>
            <MyCourtHero
              courtCode="4"
              partners={['Priya Kapoor']}
              opponents={['Tom Okafor', 'Mei Chen']}
              resting={false}
              topLeft="Now · round 3"
              topRight={<span className="tnum text-2xl font-extrabold">07:42</span>}
            />
          </div>
        </Wide>
      </section>

      <Wide className="py-14">
        <Eyebrow className="mb-4">What it does</Eyebrow>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RALLY_FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-2.5 rounded-card border border-hairline bg-surface p-5"
            >
              <Icon name={f.icon} size={26} className="text-primary" />
              <h2 className="font-display text-[20px] font-bold">{f.title}</h2>
              <p className="text-[15px] leading-6 text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </Wide>

      <section className="border-y border-hairline bg-surface">
        <Wide className="py-14">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              [
                '1',
                'Open a session',
                'Pick a preset or set courts, round length and who is in. Share the join code or QR.',
              ],
              [
                '2',
                'Call the round',
                'Rally proposes the fairest next round. Adjust if you like, then publish. Everyone sees their court.',
              ],
              [
                '3',
                'Play, repeat',
                'The timer runs, results go in, the next round is ready. Standings keep themselves for league nights.',
              ],
            ].map(([n, t, b]) => (
              <div key={n} className="flex flex-col gap-2">
                <span className="font-display text-[40px] font-extrabold leading-none text-primary">
                  {n}
                </span>
                <h3 className="font-display text-[22px] font-bold">{t}</h3>
                <p className="leading-6 text-ink-2">{b}</p>
              </div>
            ))}
          </div>
        </Wide>
      </section>

      <Wide className="py-14">
        <div className="grid items-center gap-8 rounded-sheet bg-tint p-6 sm:p-10 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <BuddyClubMark size={22} color="var(--bc-primary)" />
              <span className="font-display text-lg font-bold text-tint-ink">With Buddy Club</span>
            </div>
            <h2 className="font-display text-[28px] font-extrabold leading-tight text-tint-ink sm:text-[32px]">
              Buddy Club finds the people. Rally runs the courts.
            </h2>
            <p className="max-w-xl leading-7 text-ink-2">
              Put your club night on Buddy Club so new players can find it. When a gathering is run
              by Rally, saying you&apos;re going registers you for the session. One list of
              who&apos;s coming, never two.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <LinkButton href="/groups/new">Start a group</LinkButton>
            <LinkButton href="/explore?interest=racket_sports" variant="secondary">
              Racket groups near you
            </LinkButton>
          </div>
        </div>
      </Wide>
    </main>
  );
}
