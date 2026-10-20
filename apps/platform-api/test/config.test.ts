import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const base = {
  SUPABASE_URL: 'http://127.0.0.1:54321/',
  SUPABASE_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
};

describe('loadConfig', () => {
  it('derives the issuer from the Supabase URL and strips trailing slashes', () => {
    const config = loadConfig(base);
    expect(config.supabase.url).toBe('http://127.0.0.1:54321');
    expect(config.supabase.issuer).toBe('http://127.0.0.1:54321/auth/v1');
    expect(config.supabase.audience).toBe('authenticated');
    expect(config.port).toBe(4000);
  });

  it('requires some JWT key material', () => {
    expect(() => loadConfig({ SUPABASE_URL: base.SUPABASE_URL })).toThrow(ConfigError);
  });

  it('accepts a JWKS URL instead of a secret', () => {
    const config = loadConfig({
      SUPABASE_URL: base.SUPABASE_URL,
      SUPABASE_JWKS_URL: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
    });
    expect(config.supabase.jwksUrl).toContain('jwks.json');
    expect(config.supabase.jwtSecret).toBeUndefined();
  });

  it('refuses to run in production without a database', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('parses comma-separated CORS origins', () => {
    const config = loadConfig({
      ...base,
      CORS_ORIGINS: 'http://localhost:3000, https://admin.example',
    });
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://admin.example']);
  });
});
