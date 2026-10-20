import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // Long-running server (local dev, container fallback). Workspace packages ship TypeScript
    // source, so bundle them; npm dependencies stay external.
    entry: { server: 'src/server.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    sourcemap: true,
    clean: false,
    splitting: false,
    noExternal: [/^@buddyclub\//],
  },
  {
    // Vercel Function (ADR-012). Self-contained CommonJS bundle: every dependency is inlined so
    // the function needs no node_modules, which pnpm's symlinked layout cannot provide to Vercel's
    // file tracer. `pg-native` is an optional binding pg probes for; swagger-ui is only loaded
    // outside production and ships static assets, so both stay out of the bundle.
    entry: { vercel: 'src/vercel.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs' }),
    sourcemap: false,
    clean: false,
    splitting: false,
    noExternal: [/.*/],
    external: ['pg-native', '@fastify/swagger-ui'],
  },
]);
