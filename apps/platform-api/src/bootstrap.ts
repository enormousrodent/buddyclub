import { createTokenVerifier } from '@buddyclub/auth';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { createDb, pingDb, type Db } from './db/index.js';
import { MemoryIdentityRepository } from './modules/identity/memory-repository.js';
import { PgIdentityRepository } from './modules/identity/pg-repository.js';

export interface BootedApp {
  app: FastifyInstance;
  config: AppConfig;
  db: Db | null;
}

/** Builds the API from environment variables. Shared by the long-running server and the Vercel function. */
export async function bootstrap(
  options: { logger?: FastifyServerOptions['logger'] } = {},
): Promise<BootedApp> {
  const config = loadConfig();
  const db: Db | null = config.databaseUrl
    ? createDb({
        connectionString: config.databaseUrl,
        maxConnections: config.nodeEnv === 'production' ? 3 : 10,
      })
    : null;

  const verifierOptions: Parameters<typeof createTokenVerifier>[0] = {
    issuer: config.supabase.issuer,
    audience: config.supabase.audience,
  };
  if (config.supabase.jwtSecret) verifierOptions.jwtSecret = config.supabase.jwtSecret;
  // Both may be set: the token's alg header picks the key (legacy secret vs signing keys).
  if (config.supabase.jwksUrl) verifierOptions.jwksUrl = config.supabase.jwksUrl;

  const app = await buildApp({
    config,
    tokenVerifier: createTokenVerifier(verifierOptions),
    identityRepo: db ? new PgIdentityRepository(db) : new MemoryIdentityRepository(),
    ...(db ? { db, checkDatabase: () => pingDb(db) } : {}),
    logger: options.logger ?? {
      level: config.logLevel,
      ...(config.nodeEnv === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  if (!db) {
    app.log.warn(
      'DATABASE_URL is not set: using the in-memory identity repository. Profiles reset on restart.',
    );
  }
  return { app, config, db };
}
