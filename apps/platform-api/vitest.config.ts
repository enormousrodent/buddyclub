import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/*.pg.test.ts', '**/node_modules/**'],
  },
});
