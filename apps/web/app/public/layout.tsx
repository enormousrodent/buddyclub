import type { ReactNode } from 'react';

/** Public pages (venue boards, QR landing) have no app chrome and no tab bar. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
