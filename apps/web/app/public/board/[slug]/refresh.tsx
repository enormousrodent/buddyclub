'use client';

import { AutoRefresh } from '../../../../components/live';

/** Public boards have no user session for realtime, so they poll the redacted projection. */
export function BoardRefresh({ intervalMs }: { intervalMs: number }) {
  return <AutoRefresh intervalMs={intervalMs} />;
}
