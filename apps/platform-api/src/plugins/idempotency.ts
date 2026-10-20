import { createHash } from 'node:crypto';
import { IDEMPOTENCY_KEY_HEADER } from '@buddyclub/shared-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '../db/index.js';
import { sendProblem } from '../problems.js';

/**
 * Idempotency-Key support for mutating requests (spec section 4).
 * Scope is the acting identity so keys cannot collide across people. The first request with a key
 * reserves it; its final response is stored and replayed for retries with the same key and body.
 * A different body under the same key is a conflict.
 */

export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

export interface IdempotencyStore {
  /** Returns the existing record, or reserves the key and returns null. */
  begin(
    scope: string,
    key: string,
    requestHash: string,
    ttlMs: number,
  ): Promise<{ requestHash: string; response: StoredResponse | null } | null>;
  complete(scope: string, key: string, response: StoredResponse): Promise<void>;
  release(scope: string, key: string): Promise<void>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly rows = new Map<
    string,
    { requestHash: string; response: StoredResponse | null; expiresAt: number }
  >();

  async begin(scope: string, key: string, requestHash: string, ttlMs: number) {
    const id = `${scope}:${key}`;
    const existing = this.rows.get(id);
    if (existing && existing.expiresAt > Date.now()) {
      return { requestHash: existing.requestHash, response: existing.response };
    }
    this.rows.set(id, { requestHash, response: null, expiresAt: Date.now() + ttlMs });
    return null;
  }

  async complete(scope: string, key: string, response: StoredResponse) {
    const row = this.rows.get(`${scope}:${key}`);
    if (row) row.response = response;
  }

  async release(scope: string, key: string) {
    this.rows.delete(`${scope}:${key}`);
  }
}

export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Db) {}

  async begin(scope: string, key: string, requestHash: string, ttlMs: number) {
    const inserted = await this.db
      .insertInto('platform.idempotency_keys')
      .values({ scope, key, request_hash: requestHash, expires_at: new Date(Date.now() + ttlMs) })
      .onConflict((oc) => oc.columns(['scope', 'key']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted) return null;

    const existing = await this.db
      .selectFrom('platform.idempotency_keys')
      .select(['request_hash', 'status_code', 'response_body', 'expires_at'])
      .where('scope', '=', scope)
      .where('key', '=', key)
      .executeTakeFirst();
    if (!existing) return null;
    if (existing.expires_at.getTime() <= Date.now()) {
      await this.db
        .updateTable('platform.idempotency_keys')
        .set({
          request_hash: requestHash,
          status_code: null,
          response_body: null,
          expires_at: new Date(Date.now() + ttlMs),
        })
        .where('scope', '=', scope)
        .where('key', '=', key)
        .execute();
      return null;
    }
    return {
      requestHash: existing.request_hash,
      response:
        existing.status_code === null
          ? null
          : { statusCode: existing.status_code, body: existing.response_body },
    };
  }

  async complete(scope: string, key: string, response: StoredResponse) {
    await this.db
      .updateTable('platform.idempotency_keys')
      .set({ status_code: response.statusCode, response_body: JSON.stringify(response.body) })
      .where('scope', '=', scope)
      .where('key', '=', key)
      .execute();
  }

  async release(scope: string, key: string) {
    await this.db
      .deleteFrom('platform.idempotency_keys')
      .where('scope', '=', scope)
      .where('key', '=', key)
      .execute();
  }
}

interface IdempotencyState {
  scope: string;
  key: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    idempotency: IdempotencyState | null;
  }
  interface FastifyInstance {
    /**
     * preHandler for mutating routes. Place it after `requireActor` (or `requireGuest`) so the
     * scope is known. Requests without an Idempotency-Key header pass through untouched.
     */
    idempotent: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface IdempotencyPluginOptions {
  store: IdempotencyStore;
  ttlMs?: number;
}

function hashRequest(request: FastifyRequest): string {
  return createHash('sha256')
    .update(`${request.method} ${request.url}\n${JSON.stringify(request.body ?? null)}`)
    .digest('hex');
}

export const idempotencyPlugin = fp<IdempotencyPluginOptions>(
  async (app, options) => {
    const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    app.decorateRequest('idempotency', null);

    app.decorate('idempotent', async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = request.headers[IDEMPOTENCY_KEY_HEADER];
      const key = Array.isArray(raw) ? raw[0] : raw;
      if (!key) return;
      if (key.length > 200) {
        return sendProblem(
          reply,
          { status: 400, code: 'VALIDATION_FAILED', title: 'Idempotency-Key too long' },
          request.id,
        );
      }
      const scope = request.actor
        ? `user:${request.actor.profileId}`
        : request.guest
          ? `guest:${request.guest.grantId}`
          : null;
      if (!scope) return;

      const requestHash = hashRequest(request);
      const existing = await options.store.begin(scope, key, requestHash, ttlMs);
      if (!existing) {
        request.idempotency = { scope, key };
        return;
      }
      if (existing.requestHash !== requestHash) {
        return sendProblem(
          reply,
          {
            status: 409,
            code: 'IDEMPOTENCY_CONFLICT',
            title: 'Idempotency-Key reused with a different request',
          },
          request.id,
        );
      }
      if (!existing.response) {
        return sendProblem(
          reply,
          {
            status: 409,
            code: 'IDEMPOTENCY_CONFLICT',
            title: 'A request with this key is still in progress',
          },
          request.id,
        );
      }
      reply.header('idempotent-replayed', 'true');
      return reply.status(existing.response.statusCode).send(existing.response.body);
    });

    app.addHook('onSend', async (request, reply, payload) => {
      const state = request.idempotency;
      if (!state) return payload;
      request.idempotency = null;
      if (reply.statusCode >= 500) {
        await options.store.release(state.scope, state.key);
        return payload;
      }
      let body: unknown = null;
      if (typeof payload === 'string' && payload.length > 0) {
        try {
          body = JSON.parse(payload);
        } catch {
          body = payload;
        }
      }
      await options.store.complete(state.scope, state.key, { statusCode: reply.statusCode, body });
      return payload;
    });
  },
  { name: 'buddyclub-idempotency', fastify: '5.x' },
);
