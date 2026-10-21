import type {
  AddEntryBody,
  CreatePairLockBody,
  Entry,
  PairLock,
  WithdrawBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import {
  assertManageSeries,
  assertOrgMember,
  canManageSeries,
  canOrgAction,
} from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { isPgCode, PG_UNIQUE_VIOLATION } from '../../platform/pg-errors.js';
import { toIso } from '../../platform/tokens.js';
import { AppError, forbidden, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { applyKeepApart } from './keep-apart.js';
import {
  assertState,
  bumpOccurrenceVersion,
  loadEntries,
  loadOccurrence,
  loadPairLocks,
  ownParticipantId,
  type DbOrTrx,
} from './common.js';

async function entryDto(db: DbOrTrx, occurrenceId: string, participantId: string): Promise<Entry> {
  const entry = (await loadEntries(db, occurrenceId)).find(
    (e) => e.participantId === participantId,
  );
  if (!entry) throw notFound('Entry not found');
  return entry;
}

async function assertParticipantInOrg(
  db: DbOrTrx,
  organisationId: string,
  participantId: string,
): Promise<void> {
  const p = await db
    .selectFrom('identity.participants')
    .select(['id', 'archived_at'])
    .where('id', '=', participantId)
    .where('organisation_id', '=', organisationId)
    .executeTakeFirst();
  if (!p || p.archived_at) throw notFound('Participant not found in this organisation');
}

/** Adds an existing participant or creates a walk-in guest by name, in one transaction. */
export async function addEntry(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  body: AddEntryBody,
  ctx: CommandContext,
): Promise<Entry> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, occ.organisation_id, occ.series_id);
    assertState(occ, ['draft', 'open', 'live'], 'change the roster');

    let participantId = body.participantId ?? null;
    if (participantId) {
      await assertParticipantInOrg(trx, occ.organisation_id, participantId);
    } else {
      const created = await trx
        .insertInto('identity.participants')
        .values({
          organisation_id: occ.organisation_id,
          user_profile_id: null,
          display_name: body.displayName as string,
          source: 'guest',
          skill_rating: body.skillRating ?? null,
          declared_attributes: '{}',
          created_by_profile_id: actor.profileId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      participantId = created.id;
      await recordAudit(trx, {
        entityType: 'participant',
        entityId: participantId,
        operation: 'create_guest',
        actor: { type: 'user', id: actor.profileId },
        correlationId: ctx.correlationId,
        after: { organisationId: occ.organisation_id, displayName: body.displayName, occurrenceId },
      });
    }

    const now = new Date();
    const status = body.checkIn ? 'checked_in' : 'registered';
    await trx
      .insertInto('activities.session_entries')
      .values({
        occurrence_id: occurrenceId,
        participant_id: participantId,
        attendance_status: status,
        joined_at: now,
        check_in_at: body.checkIn ? now : null,
        created_by_profile_id: actor.profileId,
      })
      .onConflict((oc) =>
        oc.columns(['occurrence_id', 'participant_id']).doUpdateSet({
          attendance_status: status,
          check_in_at: body.checkIn ? now : null,
          left_at: null,
          left_reason: null,
        }),
      )
      .execute();
    await applyKeepApart(trx, occ.series_id, occurrenceId, actor.profileId);
    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'roster_add',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId, status },
    });
    return entryDto(trx, occurrenceId, participantId);
  });
}

/** Organiser checks a participant in, or a member checks themselves in. */
export async function checkIn(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  participantId: string | undefined,
  ctx: CommandContext,
): Promise<Entry> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertOrgMember(actor, occ.organisation_id);
    assertState(occ, ['open', 'live'], 'check in');
    let target = participantId ?? null;
    const self = await ownParticipantId(trx, occ.organisation_id, actor.profileId);
    if (!target) {
      if (!self) throw new AppError(409, 'CONFLICT', 'You have no player record in this club yet');
      target = self;
    } else if (target !== self) {
      assertManageSeries(actor, occ.organisation_id, occ.series_id);
      await assertParticipantInOrg(trx, occ.organisation_id, target);
    }
    const now = new Date();
    if (target === self && !canManageSeries(actor, occ.organisation_id, occ.series_id)) {
      // Attendees check themselves in from a little before the start; hosts at any time.
      const series = await trx
        .selectFrom('activities.session_series')
        .select('check_in_window_minutes')
        .where('id', '=', occ.series_id)
        .executeTakeFirstOrThrow();
      const opensAt = new Date(occ.starts_at.getTime() - series.check_in_window_minutes * 60_000);
      if (now < opensAt)
        throw new AppError(
          409,
          'CONFLICT',
          'Check-in is not open yet',
          `Check-in opens at ${opensAt.toISOString()}`,
        );
    }
    await trx
      .insertInto('activities.session_entries')
      .values({
        occurrence_id: occurrenceId,
        participant_id: target,
        attendance_status: 'checked_in',
        joined_at: now,
        check_in_at: now,
        created_by_profile_id: actor.profileId,
      })
      .onConflict((oc) =>
        oc.columns(['occurrence_id', 'participant_id']).doUpdateSet({
          attendance_status: 'checked_in',
          check_in_at: now,
          left_at: null,
          left_reason: null,
        }),
      )
      .execute();
    await applyKeepApart(trx, occ.series_id, occurrenceId, actor.profileId);
    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'check_in',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId: target, self: target === self },
    });
    return entryDto(trx, occurrenceId, target);
  });
}

export interface WithdrawResult {
  entry: Entry;
  /** Published-but-unstarted rounds that included the player and were cancelled. */
  cancelledRoundIds: string[];
  /** The in-progress match the player was in, if any, and what happened to it. */
  currentMatch: { matchId: string; action: 'finish' | 'cancel' } | null;
}

/** Marks departure. Committed rounds stay as history; only future placements change. */
export async function withdraw(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  participantId: string,
  body: WithdrawBody,
  ctx: CommandContext,
): Promise<WithdrawResult> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    const self = await ownParticipantId(trx, occ.organisation_id, actor.profileId);
    if (participantId !== self) assertManageSeries(actor, occ.organisation_id, occ.series_id);
    else assertOrgMember(actor, occ.organisation_id);
    assertState(occ, ['draft', 'open', 'live'], 'withdraw');

    const now = new Date();
    const updated = await trx
      .updateTable('activities.session_entries')
      .set({ attendance_status: 'left', left_at: now, left_reason: body.reason ?? null })
      .where('occurrence_id', '=', occurrenceId)
      .where('participant_id', '=', participantId)
      .where('attendance_status', 'in', ['registered', 'checked_in'])
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Participant is not on the roster');

    // Future placements: cancel published rounds (not yet started) that include this player.
    const published = await trx
      .selectFrom('activities.round_assignments as ra')
      .innerJoin('activities.social_rounds as r', 'r.id', 'ra.round_id')
      .select('r.id')
      .where('r.occurrence_id', '=', occurrenceId)
      .where('r.status', '=', 'published')
      .where('ra.participant_id', '=', participantId)
      .execute();
    const cancelledRoundIds = published.map((r) => r.id);
    if (cancelledRoundIds.length) {
      await trx
        .updateTable('activities.social_rounds')
        .set({ status: 'cancelled', cancelled_at: now })
        .where('id', 'in', cancelledRoundIds)
        .execute();
      await trx
        .updateTable('matches.matches')
        .set({ state: 'cancelled' })
        .where('social_round_id', 'in', cancelledRoundIds)
        .execute();
    }

    // Current match: organiser decides whether it finishes or stops now.
    const current = await trx
      .selectFrom('activities.round_assignments as ra')
      .innerJoin('activities.social_rounds as r', 'r.id', 'ra.round_id')
      .innerJoin('matches.matches as m', 'm.id', 'ra.match_id')
      .select('m.id')
      .where('r.occurrence_id', '=', occurrenceId)
      .where('r.status', 'in', ['in_progress', 'paused'])
      .where('ra.participant_id', '=', participantId)
      .where('m.state', '=', 'in_progress')
      .executeTakeFirst();
    let currentMatch: WithdrawResult['currentMatch'] = null;
    if (current) {
      currentMatch = { matchId: current.id, action: body.currentMatch };
      if (body.currentMatch === 'cancel') {
        await trx
          .updateTable('matches.matches')
          .set({ state: 'cancelled' })
          .where('id', '=', current.id)
          .execute();
      }
    }

    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'withdraw',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      ...(body.reason ? { reason: body.reason } : {}),
      after: { participantId, cancelledRoundIds, currentMatch },
    });
    await emitEvent(trx, {
      eventType: 'participant.withdrawn',
      aggregateType: 'session_occurrence',
      aggregateId: occurrenceId,
      payload: { occurrenceId, participantId, cancelledRoundIds },
    });
    return {
      entry: await entryDto(trx, occurrenceId, participantId),
      cancelledRoundIds,
      currentMatch,
    };
  });
}

export async function markNoShow(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  participantId: string,
  ctx: CommandContext,
): Promise<Entry> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, occ.organisation_id, occ.series_id);
    const updated = await trx
      .updateTable('activities.session_entries')
      .set({ attendance_status: 'no_show' })
      .where('occurrence_id', '=', occurrenceId)
      .where('participant_id', '=', participantId)
      .where('attendance_status', '=', 'registered')
      .returning('id')
      .executeTakeFirst();
    if (!updated)
      throw notFound(
        'Participant is not registered (only registered players can be marked no-show)',
      );
    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'no_show',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId },
    });
    return entryDto(trx, occurrenceId, participantId);
  });
}

export async function createPairLock(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  body: CreatePairLockBody,
  ctx: CommandContext,
): Promise<PairLock> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, occ.organisation_id, occ.series_id);
    assertState(occ, ['draft', 'open', 'live'], 'add a partner lock');
    const [a, b] = [body.participantA, body.participantB].sort();
    const entries = await trx
      .selectFrom('activities.session_entries')
      .select('participant_id')
      .where('occurrence_id', '=', occurrenceId)
      .where('participant_id', 'in', [a as string, b as string])
      .where('attendance_status', 'in', ['registered', 'checked_in'])
      .execute();
    if (entries.length !== 2) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Both players must be on the roster',
        undefined,
        [{ path: 'body/participantA', message: 'both participants need an active entry' }],
      );
    }
    let row;
    try {
      row = await trx
        .insertInto('activities.pair_locks')
        .values({
          occurrence_id: occurrenceId,
          participant_a: a as string,
          participant_b: b as string,
          kind: body.kind,
          until_round: body.untilRound ?? null,
          created_by_profile_id: actor.profileId,
        })
        .returning(['id', 'participant_a', 'participant_b', 'kind', 'until_round', 'created_at'])
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_UNIQUE_VIOLATION))
        throw new AppError(409, 'CONFLICT', 'These two are already locked together');
      throw error;
    }
    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'pair_lock_create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { lockId: row.id, a, b, kind: body.kind, untilRound: body.untilRound ?? null },
    });
    return {
      id: row.id,
      participantA: row.participant_a,
      participantB: row.participant_b,
      kind: row.kind,
      untilRound: row.until_round,
      createdAt: toIso(row.created_at),
    };
  });
}

export async function releasePairLock(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  lockId: string,
  ctx: CommandContext,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, occ.organisation_id, occ.series_id);
    const updated = await trx
      .updateTable('activities.pair_locks')
      .set({ released_at: new Date() })
      .where('id', '=', lockId)
      .where('occurrence_id', '=', occurrenceId)
      .where('released_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Partner lock not found');
    await bumpOccurrenceVersion(trx, occurrenceId);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'pair_lock_release',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { lockId },
    });
  });
}

export async function listPairLocks(
  db: Db,
  actor: Actor,
  occurrenceId: string,
): Promise<PairLock[]> {
  const occ = await loadOccurrence(db, occurrenceId);
  if (!canOrgAction(actor, occ.organisation_id, 'session.view'))
    throw forbidden('Not a member of this organisation');
  return loadPairLocks(db, occurrenceId);
}
