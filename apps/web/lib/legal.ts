/**
 * Facts the legal pages (/terms, /privacy) print. Change them here, not in the page copy.
 * The operator name and contact address are placeholders until the owner confirms the legal
 * entity behind Buddy Club (see docs/implementation/legal-pages.md).
 */
export const LEGAL = {
  /** Who runs the service and is the data controller. */
  operator: 'Buddy Club',
  /** Where to send privacy requests, complaints and notices. */
  contactEmail: 'hello@buddy-club.com',
  /** Public hosts the documents cover. */
  hosts: ['buddy-club.com', 'rally.buddy-club.com'],
  /** Date both documents took effect (ISO). */
  effectiveDate: '2026-10-21',
  /** Governing law and courts for the terms. */
  governingLaw: 'the laws of England and Wales',
  courts: 'the courts of England and Wales',
  /** Minimum age to hold an account. Younger people take part only through an organiser. */
  minimumAge: 16,
} as const;

export function formatEffectiveDate(): string {
  return new Date(`${LEGAL.effectiveDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
