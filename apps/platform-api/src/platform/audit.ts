import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema.js';

export interface AuditInput {
  entityType: string;
  entityId: string;
  operation: string;
  actor: { type: 'user' | 'guest' | 'service' | 'system'; id: string | null };
  correlationId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  rulesetVersion?: string;
}

/** Appends an audit event inside the caller's transaction (spec section 4). */
export async function recordAudit(
  db: Kysely<Database> | Transaction<Database>,
  input: AuditInput,
): Promise<void> {
  await db
    .insertInto('platform.audit_events')
    .values({
      entity_type: input.entityType,
      entity_id: input.entityId,
      operation: input.operation,
      actor_type: input.actor.type,
      actor_id: input.actor.id,
      correlation_id: input.correlationId,
      reason: input.reason ?? null,
      ruleset_version: input.rulesetVersion ?? null,
      before_json: input.before === undefined ? null : JSON.stringify(input.before),
      after_json: input.after === undefined ? null : JSON.stringify(input.after),
    })
    .execute();
}
