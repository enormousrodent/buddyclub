'use client';

import { useEffect, useState } from 'react';

/**
 * Hidden field carrying the browser's IANA time zone for a new schedule. A schedule that already
 * has a zone keeps it, so an organiser saving from abroad does not move the session.
 */
export function TimezoneField({
  name = 'timezone',
  fixed,
}: {
  name?: string;
  fixed?: string | null | undefined;
}) {
  const [zone, setZone] = useState(fixed ?? 'Europe/London');
  useEffect(() => {
    if (fixed) return;
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // keep the default
    }
  }, [fixed]);
  return <input type="hidden" name={name} value={zone} />;
}
