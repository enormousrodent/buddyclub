'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from './ui';

/*
 * Pull to refresh for the installed app. A browser tab has its own reload control; a home-screen
 * app does not, so this only arms itself in standalone display mode. Pulling down from the very
 * top of a page shows a disc that fills as you pull; past the threshold it spins while the server
 * components re-render (`router.refresh()`), then slides away. Touch listeners are passive, so
 * scrolling stays smooth; the page itself is never moved, only the disc.
 */

const THRESHOLD = 72;
const DAMPING = 0.5;

export function PullToRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    setArmed(true);

    let startY: number | null = null;
    let distance = 0;

    const onStart = (e: TouchEvent) => {
      if (busy.current || window.scrollY > 0 || e.touches.length !== 1) {
        startY = null;
        return;
      }
      startY = e.touches[0]!.clientY;
      distance = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      if (window.scrollY > 0) {
        startY = null;
        setPull(0);
        return;
      }
      const dy = e.touches[0]!.clientY - startY;
      distance = dy > 0 ? Math.min(THRESHOLD * 1.5, dy * DAMPING) : 0;
      setPull(distance);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (distance >= THRESHOLD) {
        busy.current = true;
        setRefreshing(true);
        setPull(THRESHOLD);
        startTransition(() => router.refresh());
      } else {
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [router]);

  // The transition ends when the refreshed tree has rendered; hold the disc a beat so it reads.
  useEffect(() => {
    if (!refreshing || pending) return;
    const id = setTimeout(() => {
      setRefreshing(false);
      setPull(0);
      busy.current = false;
    }, 350);
    return () => clearTimeout(id);
  }, [refreshing, pending]);

  if (!armed || (pull === 0 && !refreshing)) return null;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      aria-live="polite"
      aria-label={refreshing ? 'Refreshing' : 'Pull to refresh'}
      className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2"
      style={{
        top: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        transform: `translate(-50%, ${pull - 48}px)`,
        opacity: refreshing ? 1 : progress,
        transition: refreshing || pull === 0 ? 'transform 0.25s ease-out, opacity 0.2s' : 'none',
      }}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-primary shadow-raised ${
          refreshing ? 'animate-spin' : ''
        }`}
        style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
      >
        <Icon name="sync" size={18} />
      </span>
    </div>
  );
}
