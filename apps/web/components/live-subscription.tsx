'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';

/**
 * Realtime transport for live pages (ADR-014). Subscribes to change signals for one occurrence
 * and refreshes the server-rendered page; a slow poll remains as the fallback. Swap this file to
 * change provider.
 */
export function LiveSubscription({
  occurrenceId,
  fallbackIntervalMs = 30_000,
}: {
  occurrenceId: string;
  fallbackIntervalMs?: number;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // Coalesce bursts (a commit touches several rows) into one refetch.
      timer.current = setTimeout(() => router.refresh(), 250);
    };

    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null =
      null;
    try {
      const supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel(`occurrence:${occurrenceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'activities',
            table: 'session_occurrences',
            filter: `id=eq.${occurrenceId}`,
          },
          refresh,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'activities',
            table: 'social_rounds',
            filter: `occurrence_id=eq.${occurrenceId}`,
          },
          refresh,
        )
        .subscribe();
    } catch {
      channel = null; // no public config: polling only
    }

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, fallbackIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (channel) void channel.unsubscribe();
    };
  }, [occurrenceId, fallbackIntervalMs, router]);

  return null;
}
