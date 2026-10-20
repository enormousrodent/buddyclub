// Flat ESLint config shared across the monorepo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/.vercel/**',
      '**/next-env.d.ts',
      'docs/api/openapi.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain JavaScript scripts (no TypeScript globals): declare the Node runtime globals.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Rules engines must stay pure: no HTTP, DB or framework imports.
    files: [
      'packages/rotation-engine/**/*.ts',
      'packages/competition-engine/**/*.ts',
      'packages/scoring-engine/**/*.ts',
      'packages/court-scheduler/**/*.ts',
      'packages/rules-schema/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['fastify', 'fastify/*', '@fastify/*'],
              message: 'Engines must not depend on HTTP.',
            },
            {
              group: ['kysely', 'pg', '@supabase/*'],
              message: 'Engines must not depend on the database.',
            },
            {
              group: ['node:http', 'node:https', 'node:net', 'node:fs', 'node:fs/promises'],
              message: 'Engines must be pure.',
            },
          ],
        },
      ],
    },
  },
);
