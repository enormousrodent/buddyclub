import type { Product } from './env';

/** Brand facts shared by metadata, the manifest and the shells (docs/design/README.md). */
export const PRODUCTS: Record<
  Product,
  {
    name: string;
    shortName: string;
    tagline: string;
    /** Primary accent; also the PWA theme colour. */
    themeColor: string;
    /** Browser chrome colour in the dark theme: the night ground. */
    themeColorDark: string;
    /** App ground; also the PWA background colour. */
    backgroundColor: string;
  }
> = {
  buddyclub: {
    name: 'Buddy Club',
    shortName: 'Buddy Club',
    tagline: 'Do things together. Clubs, groups and meetups near you.',
    themeColor: '#d62e5a',
    themeColorDark: '#0f1729',
    backgroundColor: '#ffffff',
  },
  // The product is Buddy Club (Addendum 1.4); `rally` is the internal name of this look and app.
  rally: {
    name: 'Buddy Club',
    shortName: 'Buddy Club',
    tagline: 'Run the session. Find your buddies. Racket sports, together.',
    themeColor: '#2350d6',
    themeColorDark: '#0f1729',
    backgroundColor: '#ffffff',
  },
};
