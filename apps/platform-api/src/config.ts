import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SUPABASE_URL: z.url(),
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  SUPABASE_JWKS_URL: z.url().optional(),
  SUPABASE_JWT_ISSUER: z.url().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL')
    .optional(),
  /** Signs guest access credentials issued by the API (ADR-008). Required in production. */
  GUEST_TOKEN_SECRET: z.string().min(32).optional(),
  /** Base URL of the web app, used to build invitation and guest links. */
  PUBLIC_WEB_URL: z.url().optional(),
  /** Comma-separated list of allowed browser origins. Empty means no browser origins. */
  CORS_ORIGINS: z.string().optional(),
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),
  API_VERSION: z.string().default('0.1.0'),
});

const DEV_GUEST_TOKEN_SECRET = 'development-only-guest-token-secret-do-not-use-in-production';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  apiVersion: string;
  supabase: {
    url: string;
    issuer: string;
    audience: string;
    jwtSecret?: string;
    jwksUrl?: string;
  };
  databaseUrl?: string;
  guestTokenSecret: string;
  publicWebUrl?: string;
  corsOrigins: string[];
  rateLimitEnabled: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Parses process.env (or any record) into a validated, typed config. Throws ConfigError. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid environment: ${problems}`);
  }
  const e = parsed.data;

  if (!e.SUPABASE_JWT_SECRET && !e.SUPABASE_JWKS_URL) {
    throw new ConfigError('Set SUPABASE_JWT_SECRET (HS256) or SUPABASE_JWKS_URL (asymmetric keys)');
  }
  if (e.NODE_ENV === 'production' && !e.DATABASE_URL) {
    throw new ConfigError('DATABASE_URL is required in production');
  }
  if (e.NODE_ENV === 'production' && !e.GUEST_TOKEN_SECRET) {
    throw new ConfigError('GUEST_TOKEN_SECRET is required in production');
  }

  const supabase: AppConfig['supabase'] = {
    url: e.SUPABASE_URL.replace(/\/+$/, ''),
    issuer: e.SUPABASE_JWT_ISSUER ?? `${e.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`,
    audience: e.SUPABASE_JWT_AUDIENCE,
  };
  if (e.SUPABASE_JWT_SECRET) supabase.jwtSecret = e.SUPABASE_JWT_SECRET;
  if (e.SUPABASE_JWKS_URL) supabase.jwksUrl = e.SUPABASE_JWKS_URL;

  const config: AppConfig = {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    apiVersion: e.API_VERSION,
    supabase,
    guestTokenSecret: e.GUEST_TOKEN_SECRET ?? DEV_GUEST_TOKEN_SECRET,
    corsOrigins: (e.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitEnabled: e.RATE_LIMIT_ENABLED === 'true',
  };
  if (e.DATABASE_URL) config.databaseUrl = e.DATABASE_URL;
  if (e.PUBLIC_WEB_URL) config.publicWebUrl = e.PUBLIC_WEB_URL.replace(/\/+$/, '');
  return config;
}
