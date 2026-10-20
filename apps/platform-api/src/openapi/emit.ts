import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { MemoryIdentityRepository } from '../modules/identity/memory-repository.js';

/** Writes docs/api/openapi.json from the live route schemas. Run with `pnpm openapi:emit`. */
async function main() {
  const config = loadConfig({
    NODE_ENV: 'test',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_JWT_SECRET: 'openapi-emit-placeholder-secret-not-used-at-runtime',
    API_VERSION: process.env['API_VERSION'] ?? '0.1.0',
  });
  const app = await buildApp({
    config,
    tokenVerifier: { verify: async () => Promise.reject(new Error('not used')) },
    identityRepo: new MemoryIdentityRepository(),
  });
  await app.ready();
  const document = app.swagger();
  await app.close();

  const here = dirname(fileURLToPath(import.meta.url));
  const target = resolve(here, '../../../../docs/api/openapi.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  console.warn(`OpenAPI written to ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
