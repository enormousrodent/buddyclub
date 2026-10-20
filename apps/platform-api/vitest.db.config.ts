import { defineConfig } from 'vitest/config';

// Database-backed integration tests. Require TEST_DATABASE_URL pointing at a migrated local
// Supabase database (`pnpm db:start`). Each test skips itself when the variable is unset.
export default defineConfig({
  test: {
    include: ['test/**/*.pg.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
