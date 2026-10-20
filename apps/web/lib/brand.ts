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
    themeColor: '#1d4fc4',
    themeColorDark: '#0f1729',
    backgroundColor: '#ffffff',
  },
  rally: {
    name: 'Rally',
    shortName: 'Rally',
    tagline: 'Run the session. Fair rotations, live courts, leagues.',
    themeColor: '#2350d6',
    themeColorDark: '#0f1729',
    backgroundColor: '#ffffff',
  },
};
