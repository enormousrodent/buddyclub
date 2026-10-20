import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { PRODUCTS } from '../lib/brand';
import { productForHost } from '../lib/env';

/**
 * One manifest per product (ADR-013). The proxy skips this path, so the product comes straight
 * from the request host rather than the header the proxy sets for pages.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const product =
    h.get('x-buddyclub-product') === 'rally' ? 'rally' : productForHost(h.get('host'));
  const brand = PRODUCTS[product];
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: brand.backgroundColor,
    theme_color: brand.themeColor,
    icons: [
      { src: `/icons/${product}-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `/icons/${product}-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `/icons/${product}-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
