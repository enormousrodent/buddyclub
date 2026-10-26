import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema.js';

export type OutboxEventType =
  | 'session.round_published'
  | 'session.round_started'
  | 'session.round_completed'
  | 'session.occurrence_opened'
  | 'participant.withdrawn'
  | 'meet.fixtures_published'
  | 'match.court_assigned'
  | 'match.result_confirmed'
  | 'match.result_disputed'
  | 'match.dispute_resolved'
  | 'activity.cancelled'
  | 'meet.standings_updated'
  | 'meet.progression_published'
  | 'catalogue.activity_promoted'
  | 'buddies.hello'
  | 'community.join_requested'
  | 'community.join_decided';

export interface OutboxInput {
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  /** Stable key so retries never duplicate a notification (ADR-006). */
  dedupeKey?: string;
}

/** Writes a domain event in the caller's transaction; workers drain it later (ADR-006). */
export async function emitEvent(
  db: Kysely<Database> | Transaction<Database>,
  input: OutboxInput,
): Promise<void> {
  await db
    .insertInto('platform.outbox_events')
    .values({
      event_type: input.eventType,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      payload_json: JSON.stringify(input.payload),
      dedupe_key: input.dedupeKey ?? null,
    })
    .onConflict((oc) => oc.column('dedupe_key').doNothing())
    .execute();
}
