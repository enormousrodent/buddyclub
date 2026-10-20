import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@buddyclub/api-client', '@buddyclub/auth', '@buddyclub/shared-types'],
  // Monorepo root, so pnpm's symlinked packages resolve wherever the build runs (Vercel included).
  turbopack: { root: path.join(import.meta.dirname, '../..') },
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
};

export default nextConfig;
