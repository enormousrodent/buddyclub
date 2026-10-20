import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';
import type { Product } from '../../lib/env';

export default async function SharedLayout({ children }: { children: ReactNode }) {
  const product = ((await headers()).get('x-buddyclub-product') ?? 'buddyclub') as Product;
  return <AppShell product={product}>{children}</AppShell>;
}
