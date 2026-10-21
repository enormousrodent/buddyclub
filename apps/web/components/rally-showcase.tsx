'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MyCourtHero } from './court';
import { Avatar, Icon } from './ui';

/*
 * The hero's right-hand side on the Rally front page: five short scenes of a Thursday night,
 * cycling every few seconds, with a timer that keeps counting across all of them. Hover or focus
 * holds the current scene; the dots jump to one. Under prefers-reduced-motion it stays on the
 * first scene (the dots still work).
 */

const SCENE_MS = 5600;
const TIMER_START = 7 * 60 + 42;

type Scene = { id: string; label: string; render: (timer: string) => ReactNode };

function Chip({ children, tone = 'live' }: { children: ReactNode; tone?: 'live' | 'muted' }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 font-display text-[12px] font-bold uppercase tracking-[0.1em] ${
        tone === 'live' ? 'bg-tint text-live' : 'bg-surface-2 text-muted'
      }`}
    >
      {children}
    </span>
  );
}

function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex h-full flex-col gap-3 rounded-sheet border-2 border-live bg-surface p-5 text-ink ${className}`}
    >
      {children}
    </div>
  );
}

const ROUND: [string, string, string][] = [
  ['1', 'Aisha & Raj', 'Ben & Lucy'],
  ['2', 'Jo & Marcus', 'Elena & Kit'],
  ['3', 'Priya & You', 'Tom & Mei'],
  ['4', 'Hannah & Dev', 'Sam & Dan'],
];

const CHECKIN: [string, boolean][] = [
  ['Priya Kapoor', true],
  ['Tom Okafor', true],
  ['Mei Chen', true],
  ['Aisha Bello', true],
  ['Raj Patel', false],
  ['Lucy Marsh', false],
];

const TABLE: [string, number, number, number, number][] = [
  ['Riverside A', 6, 5, 0, 15],
  ['Northgate', 6, 4, 1, 13],
  ['Riverside B', 6, 3, 2, 11],
  ['Castle Hill', 6, 2, 3, 7],
  ['Meadow Lane', 6, 0, 5, 2],
];

/** A fixed 7x7 pattern that reads as a QR code at a glance. */
const QR = [
  '1111111 0 1111111',
  '1000001 1 1000001',
  '1011101 0 1011101',
  '1011101 1 1011101',
  '1011101 0 1011101',
  '1000001 1 1000001',
  '1111111 0 1111111',
  '0000000 1 0000000',
  '1010101 0 1101011',
  '0000000 1 0000000',
  '1111111 0 1011010',
  '1000001 1 0110101',
  '1011101 0 1101011',
  '1011101 1 0010110',
  '1011101 0 1101001',
  '1000001 1 0110110',
  '1111111 0 1011011',
].map((row) => row.replace(/ /g, ''));

const SCENES: Scene[] = [
  {
    id: 'court',
    label: 'What players see',
    render: (timer) => (
      <div className="flex h-full flex-col">
        <MyCourtHero
          courtCode="3"
          partners={['Priya Kapoor']}
          opponents={['Tom Okafor', 'Mei Chen']}
          resting={false}
          topLeft="Now · round 4"
          topRight={<span className="tnum font-display text-3xl font-extrabold">{timer}</span>}
        />
        <div className="mt-auto grid grid-cols-3 gap-2 pt-3 text-center">
          {[
            ['Next', 'Court 1'],
            ['With', 'Raj'],
            ['Resting', 'Sam, Dan'],
          ].map(([k, v], i) => (
            <div
              key={k}
              className="show-in rounded-control bg-surface px-2 py-2.5"
              style={{ animationDelay: `${160 + i * 90}ms` }}
            >
              <div className="font-display text-[12px] font-bold uppercase tracking-[0.1em] text-muted">
                {k}
              </div>
              <div className="truncate text-[13px] font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'round',
    label: 'Calling the round',
    render: () => (
      <Frame>
        <div className="flex items-center justify-between">
          <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            Round 5 · proposed
          </span>
          <Chip tone="muted">Fair for 14</Chip>
        </div>
        <ul className="flex flex-col divide-y divide-hairline">
          {ROUND.map(([court, a, b], i) => (
            <li
              key={court}
              className="show-in flex items-center gap-3 py-2.5"
              style={{ animationDelay: `${120 + i * 140}ms` }}
            >
              <span className="w-10 font-display text-[32px] font-extrabold leading-none">
                {court}
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold">
                {a} <span className="font-normal text-muted">vs</span> {b}
              </span>
            </li>
          ))}
        </ul>
        <div
          className="show-in mt-auto flex items-center justify-between gap-3"
          style={{ animationDelay: '760ms' }}
        >
          <span className="text-[13px] text-muted">Resting: Jess, Omar · nobody sits twice</span>
          <span className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-control bg-live px-4 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-live-ink">
            <Icon name="play" size={14} className="mr-1.5" />
            Call it
          </span>
        </div>
      </Frame>
    ),
  },
  {
    id: 'board',
    label: 'On the hall TV',
    render: (timer) => (
      <div className="flex h-full flex-col gap-3 rounded-sheet border-2 border-night-hairline bg-night p-5 text-night-ink">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-night-muted">
              Riverside Thursday · round 4
            </div>
            <div className="font-display text-[22px] font-bold uppercase leading-none">
              Court board
            </div>
          </div>
          <span className="tnum font-display text-[44px] font-extrabold leading-none text-live">
            {timer}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROUND.map(([court, a, b], i) => (
            <div
              key={court}
              className="show-in rounded-control bg-night-surface px-3 py-2.5"
              style={{ animationDelay: `${120 + i * 110}ms` }}
            >
              <div className="font-display text-[26px] font-extrabold leading-none">{court}</div>
              <div className="mt-1 truncate text-[12px] font-semibold">{a}</div>
              <div className="truncate text-[12px] text-night-muted">{b}</div>
            </div>
          ))}
        </div>
        <div
          className="show-in mt-auto flex items-center justify-between gap-3 border-t border-night-hairline pt-3"
          style={{ animationDelay: '640ms' }}
        >
          <div>
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-night-muted">
              Scan to join · or type
            </div>
            <div className="tnum font-display text-[30px] font-extrabold uppercase leading-none tracking-[0.1em]">
              AX7K
            </div>
          </div>
          <div
            aria-hidden
            className="grid shrink-0 gap-[1.5px] rounded-[4px] bg-night-ink p-1"
            style={{ gridTemplateColumns: 'repeat(17, 3px)' }}
          >
            {QR.flatMap((row, y) =>
              [...row].map((cell, x) => (
                <span
                  key={`${y}-${x}`}
                  className={`h-[3px] w-[3px] ${cell === '1' ? 'bg-night' : 'bg-night-ink'}`}
                />
              )),
            )}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'checkin',
    label: 'Check-in',
    render: () => (
      <Frame>
        <div className="flex items-center justify-between">
          <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            Players · 12 here
          </span>
          <Chip tone="muted">2 expected</Chip>
        </div>
        <ul className="flex flex-col divide-y divide-hairline">
          {CHECKIN.map(([name, here], i) => (
            <li
              key={name}
              className="show-in flex items-center gap-3 py-2"
              style={{ animationDelay: `${80 + i * 90}ms` }}
            >
              <Avatar name={name} size={32} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
              {here ? (
                <span
                  className="show-pop inline-flex h-7 w-7 items-center justify-center rounded-full bg-live text-live-ink"
                  style={{ animationDelay: `${700 + i * 380}ms` }}
                >
                  <Icon name="check" size={14} />
                </span>
              ) : (
                <span className="text-[12px] font-semibold text-muted">Expected</span>
              )}
            </li>
          ))}
        </ul>
        <div
          className="show-in mt-auto text-center text-[13px] text-muted"
          style={{ animationDelay: '900ms' }}
        >
          Regulars were registered when you started. Walk-ins join by name.
        </div>
      </Frame>
    ),
  },
  {
    id: 'league',
    label: 'League night',
    render: () => (
      <Frame>
        <div className="flex items-center justify-between">
          <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            Division 2 · week 6
          </span>
          <Chip>
            <Icon name="trophy" size={12} className="mr-1" />
            Standings
          </Chip>
        </div>
        <table className="w-full text-[14px]">
          <thead>
            <tr className="font-display text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="py-1 text-left font-bold">Team</th>
              <th className="py-1 text-right font-bold">P</th>
              <th className="py-1 text-right font-bold">W</th>
              <th className="py-1 text-right font-bold">L</th>
              <th className="py-1 text-right font-bold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {TABLE.map(([team, p, w, l, pts], i) => (
              <tr
                key={team}
                className={`show-in border-t border-hairline ${i === 2 ? 'bg-tint font-semibold' : ''}`}
                style={{ animationDelay: `${120 + i * 110}ms` }}
              >
                <td className="py-2 pl-1">
                  <span className="tnum mr-2 text-muted">{i + 1}</span>
                  {team}
                  {i === 2 ? (
                    <span className="ml-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-live">
                      ▲ 1
                    </span>
                  ) : null}
                </td>
                <td className="tnum py-2 text-right">{p}</td>
                <td className="tnum py-2 text-right">{w}</td>
                <td className="tnum py-2 text-right">{l}</td>
                <td className="tnum py-2 pr-1 text-right font-bold">{pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          className="show-in mt-auto text-center text-[13px] text-muted"
          style={{ animationDelay: '800ms' }}
        >
          Results confirmed by both captains. Disputes go to the director.
        </div>
      </Frame>
    ),
  },
];

export function RallyShowcase() {
  const [scene, setScene] = useState(0);
  const [seconds, setSeconds] = useState(TIMER_START);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);

  // Deep link to a scene for sharing and QA: #scene-board, #scene-league, ...
  useEffect(() => {
    const wanted = SCENES.findIndex((s) => `#scene-${s.id}` === window.location.hash);
    if (wanted >= 0) setScene(wanted);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s <= 1 ? 12 * 60 : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (held || still) return;
    const id = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(id);
  }, [scene, held, still]);

  const timer = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const current = SCENES[scene]!;

  return (
    <div
      className="relative"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Chip>{current.label}</Chip>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Scenes">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === scene}
              aria-label={s.label}
              onClick={() => setScene(i)}
              className={`h-2.5 rounded-full transition-all ${
                i === scene ? 'w-6 bg-live' : 'w-2.5 bg-hairline-strong hover:bg-muted'
              }`}
            />
          ))}
        </div>
      </div>
      <div key={current.id} className="show-in h-[440px]">
        {current.render(timer)}
      </div>
      {!still ? (
        <div aria-hidden className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-surface-2">
          <div
            key={`${current.id}-${held ? 'held' : 'run'}`}
            className="show-bar h-full bg-live"
            style={{
              ['--show-ms' as string]: `${SCENE_MS}ms`,
              animationPlayState: held ? 'paused' : 'running',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
