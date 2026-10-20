/* eslint-disable no-console */
// Smoke test for the bundled platform API: starts dist/server.js, hits /healthz, /v1/me (401),
// and /v1/me with a locally minted HS256 token (200), then stops the server.
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';

const PORT = 4777;
const SECRET = 'smoke-secret-that-is-at-least-32-characters-long';
const SUPABASE_URL = 'http://127.0.0.1:54321';
const serverPath = process.argv[2];

const b64 = (s) => Buffer.from(s).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64(
  JSON.stringify({
    sub: '55555555-5555-4555-8555-555555555555',
    iss: `${SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
    iat: now,
    exp: now + 600,
    role: 'authenticated',
    email: 'smoke@example.com',
    user_metadata: { full_name: 'Smoke Tester' },
  }),
);
const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
const token = `${header}.${payload}.${sig}`;

const child = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    LOG_LEVEL: 'warn',
    SUPABASE_URL,
    SUPABASE_JWT_SECRET: SECRET,
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error('server did not start');
}

try {
  const health = await waitForServer();
  console.log('GET /healthz ->', health.status, await health.json());

  const anon = await fetch(`http://127.0.0.1:${PORT}/v1/me`);
  console.log(
    'GET /v1/me (no token) ->',
    anon.status,
    anon.headers.get('content-type'),
    await anon.json(),
  );

  const me = await fetch(`http://127.0.0.1:${PORT}/v1/me`, {
    headers: { authorization: `Bearer ${token}`, 'x-correlation-id': 'smoke-run-0001' },
  });
  console.log(
    'GET /v1/me (token) ->',
    me.status,
    'cache-control:',
    me.headers.get('cache-control'),
    'x-correlation-id:',
    me.headers.get('x-correlation-id'),
  );
  console.log(JSON.stringify(await me.json(), null, 2));

  const missing = await fetch(`http://127.0.0.1:${PORT}/v1/nope`);
  console.log('GET /v1/nope ->', missing.status, (await missing.json()).code);
} finally {
  child.kill('SIGTERM');
}
