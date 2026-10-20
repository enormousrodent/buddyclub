import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { bootstrap } from './bootstrap.js';

/**
 * Vercel Function entry (ADR-012). The Fastify instance is built once per function instance and
 * reused across invocations; Fluid Compute keeps instances warm. Configuration comes from Vercel
 * environment variables, so no dotenv here.
 */
let appPromise: Promise<FastifyInstance> | undefined;

async function getApp(): Promise<FastifyInstance> {
  appPromise ??= bootstrap({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } }).then(
    async ({ app }) => {
      await app.ready();
      return app;
    },
  );
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
