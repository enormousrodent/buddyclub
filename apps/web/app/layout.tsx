import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { PRODUCTS } from '../lib/brand';
import type { Product } from '../lib/env';
import { readTheme } from '../lib/theme-server';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

async function currentProduct(): Promise<Product> {
  const value = (await headers()).get('x-buddyclub-product');
  return value === 'rally' ? 'rally' : 'buddyclub';
}

export async function generateMetadata(): Promise<Metadata> {
  const product = await currentProduct();
  const brand = PRODUCTS[product];
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: brand.tagline,
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: brand.name },
    icons: {
      icon: [
        { url: `/icons/${product}.svg`, type: 'image/svg+xml' },
        { url: `/icons/${product}-192.png`, sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: `/icons/${product}-apple.png`, sizes: '180x180', type: 'image/png' }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const [product, theme] = await Promise.all([currentProduct(), readTheme()]);
  const brand = PRODUCTS[product];
  const themeColor =
    theme === 'system'
      ? [
          { media: '(prefers-color-scheme: light)', color: brand.themeColor },
          { media: '(prefers-color-scheme: dark)', color: brand.themeColorDark },
        ]
      : theme === 'dark'
        ? brand.themeColorDark
        : brand.themeColor;
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [product, theme] = await Promise.all([currentProduct(), readTheme()]);
  return (
    <html
      lang="en-GB"
      data-product={product}
      {...(theme === 'system' ? {} : { 'data-theme': theme })}
      className={poppins.variable}
    >
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
