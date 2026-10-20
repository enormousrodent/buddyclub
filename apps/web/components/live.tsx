'use client';

import type { Timer } from '@buddyclub/shared-types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Re-renders the server page on an interval so live boards stay fresh without push. */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Reading =
  | { kind: 'idle'; text: string }
  | { kind: 'running'; text: string; zero: boolean }
  | { kind: 'paused'; text: string }
  | { kind: 'done'; text: string };

/**
 * Timer driven by the server's fields (spec section 10). Anchors on the page's server time so a
 * phone with a wrong clock still agrees with the organiser's screen.
 */
function useTimerReading(timer: Timer, serverTime: string, status: string): Reading {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const offset = Date.parse(serverTime) - now;
  if (!timer.startedAt || !timer.endsAt)
    return { kind: 'idle', text: format(timer.durationSeconds) };
  if (status === 'paused') return { kind: 'paused', text: format(timer.remainingSeconds ?? 0) };
  if (status === 'completed' || status === 'cancelled') return { kind: 'done', text: status };
  const remaining = Math.max(0, Math.round((Date.parse(timer.endsAt) - (now + offset)) / 1000));
  return { kind: 'running', text: format(remaining), zero: remaining === 0 };
}

/** Compact countdown for cards and rows. */
export function Countdown({
  timer,
  serverTime,
  status,
}: {
  timer: Timer;
  serverTime: string;
  status: string;
}) {
  const r = useTimerReading(timer, serverTime, status);
  if (r.kind === 'idle') return <span className="text-sm text-muted">Not started · {r.text}</span>;
  if (r.kind === 'done') return <span className="text-sm text-muted">{r.text}</span>;
  return (
    <span
      className={`tnum text-2xl font-extrabold tracking-tight ${
        r.kind === 'running' && r.zero ? 'text-danger' : ''
      }`}
    >
      {r.text}
      {r.kind === 'paused' ? (
        <span className="ml-1 text-sm font-semibold text-muted">paused</span>
      ) : null}
    </span>
  );
}

/** The authoritative timer on live screens: 72px digits, round label, state word. */
export function TimerHero({
  timer,
  serverTime,
  status,
  label,
  invert = false,
}: {
  timer: Timer;
  serverTime: string;
  status: string;
  label: string;
  invert?: boolean;
}) {
  const r = useTimerReading(timer, serverTime, status);
  const muted = invert ? 'text-on-ink-muted' : 'text-muted';
  const digits = invert ? 'text-on-ink' : 'text-ink';
  const stateWord =
    r.kind === 'idle'
      ? 'ready'
      : r.kind === 'paused'
        ? 'paused'
        : r.kind === 'done'
          ? r.text
          : r.zero
            ? 'time'
            : 'in play';
  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] ${muted}`}
      >
        {r.kind === 'running' ? (
          <span className="h-2 w-2 rounded-full bg-live outline-2 outline-ink" aria-hidden />
        ) : null}
        {label}
        <span className="font-semibold normal-case tracking-normal">· {stateWord}</span>
      </div>
      <div
        className={`tnum text-[72px] font-extrabold leading-none tracking-[-0.04em] ${
          r.kind === 'running' && r.zero ? 'text-danger' : digits
        } ${r.kind === 'idle' || r.kind === 'done' ? 'opacity-60' : ''}`}
      >
        {r.kind === 'done' ? '--:--' : r.text}
      </div>
    </div>
  );
}
