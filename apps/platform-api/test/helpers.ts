import { createTokenVerifier } from '@buddyclub/auth';
import { signTestToken, type TestTokenInput } from '@buddyclub/auth/testing';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import type { Db } from '../src/db/index.js';
import { MemoryIdentityRepository } from '../src/modules/identity/memory-repository.js';
import type { IdentityRepository } from '../src/modules/identity/repository.js';
import type { IdempotencyStore } from '../src/plugins/idempotency.js';

export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const TEST_SUPABASE_URL = 'http://127.0.0.1:54321';
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;
export const TEST_AUDIENCE = 'authenticated';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    SUPABASE_URL: TEST_SUPABASE_URL,
    SUPABASE_JWT_SECRET: TEST_SECRET,
    GUEST_TOKEN_SECRET: 'guest-token-secret-for-tests-at-least-32-chars',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides,
  });
}

export interface TestApp<R extends IdentityRepository> {
  app: FastifyInstance;
  repo: R;
  config: AppConfig;
}

export async function createTestApp<R extends IdentityRepository = MemoryIdentityRepository>(
  options: {
    repo?: R;
    db?: Db;
    idempotencyStore?: IdempotencyStore;
    checkDatabase?: () => Promise<void>;
    configOverrides?: Record<string, string>;
  } = {},
): Promise<TestApp<R>> {
  const config = testConfig(options.configOverrides ?? {});
  const repo = (options.repo ?? new MemoryIdentityRepository()) as R;
  const app = await buildApp({
    config,
    identityRepo: repo,
    tokenVerifier: createTokenVerifier({
      issuer: config.supabase.issuer,
      audience: config.supabase.audience,
      jwtSecret: TEST_SECRET,
    }),
    ...(options.db ? { db: options.db } : {}),
    ...(options.idempotencyStore ? { idempotencyStore: options.idempotencyStore } : {}),
    ...(options.checkDatabase ? { checkDatabase: options.checkDatabase } : {}),
    logger: process.env['TEST_LOG'] ? { level: 'error' } : false,
  });
  await app.ready();
  return { app, repo, config };
}

export function tokenFor(sub: string, extra: Partial<TestTokenInput> = {}): Promise<string> {
  return signTestToken({
    secret: TEST_SECRET,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    sub,
    ...extra,
  });
}

export async function bearer(sub: string, extra: Partial<TestTokenInput> = {}) {
  return { authorization: `Bearer ${await tokenFor(sub, extra)}` };
}
