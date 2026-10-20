'use client';

import { useEffect, useState } from 'react';
import { Icon } from './ui';

/**
 * Design F2: a banner, never a modal, when the phone loses signal. The page keeps showing the
 * last round it had; the countdown keeps counting locally; it catches up when the signal returns.
 */
export function OfflineBanner({ since }: { since?: string | undefined }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  const asOf = since
    ? new Date(since).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2.5 rounded-control bg-warning px-3.5 py-3 text-[13px] font-semibold text-warning-ink"
    >
      <Icon name="offline" size={18} />
      <span>
        No signal. Showing the last round{asOf ? ` as of ${asOf}` : ''}. The clock keeps counting
        here; this page catches up by itself.
      </span>
    </div>
  );
}
