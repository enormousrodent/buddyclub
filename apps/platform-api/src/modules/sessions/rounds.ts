import type { Round } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction } from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { AppError } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { loadOccurrence, loadRound, ROUND_COLUMNS, toRoundDto } from './common.js';

export type RoundAction = 'start' | 'pause' | 'resume' | 'complete' | 'cancel';

export async function transitionRound(
  db: Db,
  actor: Actor,
  roundId: string,
  action: RoundAction,
  ctx: CommandContext,
): Promise<Round> {
  return db.transaction().execute(async (trx) => {
    const round = await loadRound(trx, roundId, true);
    const occ = await loadOccurrence(trx, round.occurrence_id, true);
    assertOrgAction(actor, occ.organisation_id, 'session.manage');
    const now = new Date();
    const deny = (detail: string) =>
      new AppError(409, 'CONFLICT', `Cannot ${action} this round`, detail);

    let patch: Record<string, unknown> = {};
    switch (action) {
      case 'start': {
        if (round.status !== 'published') throw deny(`round is ${round.status}`);
        const other = await trx
          .selectFrom('activities.social_rounds')
          .select('sequence_no')
          .where('occurrence_id', '=', occ.id)
          .where('status', 'in', ['in_progress', 'paused'])
          .executeTakeFirst();
        if (other) throw deny(`round ${other.sequence_no} is still in progress`);
        patch = { status: 'in_progress', started_at: now };
        await trx
          .updateTable('matches.matches')
          .set({ state: 'in_progress', starts_at: now })
          .where('social_round_id', '=', roundId)
          .where('state', '=', 'scheduled')
          .execute();
        await trx
          .updateTable('activities.session_occurrences')
          .set({ state: 'live', started_at: occ.started_at ?? now })
          .where('id', '=', occ.id)
          .execute();
        break;
      }
      case 'pause':
        if (round.status !== 'in_progress') throw deny(`round is ${round.status}`);
        patch = { status: 'paused', paused_at: now };
        break;
      case 'resume': {
        if (round.status !== 'paused' || !round.paused_at) throw deny(`round is ${round.status}`);
        const pausedFor = Math.round((now.getTime() - round.paused_at.getTime()) / 1000);
        patch = {
          status: 'in_progress',
          paused_at: null,
          paused_total_seconds: round.paused_total_seconds + pausedFor,
        };
        break;
      }
      case 'complete': {
        if (round.status !== 'in_progress' && round.status !== 'paused')
          throw deny(`round is ${round.status}`);
        const extraPaused = round.paused_at
          ? Math.round((now.getTime() - round.paused_at.getTime()) / 1000)
          : 0;
        patch = {
          status: 'completed',
          completed_at: now,
          paused_at: null,
          paused_total_seconds: round.paused_total_seconds + extraPaused,
        };
        await trx
          .updateTable('matches.matches')
          .set({ state: 'completed', completed_at: now })
          .where('social_round_id', '=', roundId)
          .where('state', '=', 'in_progress')
          .execute();
        break;
      }
      case 'cancel':
        if (round.status !== 'published')
          throw deny('only a round that has not started can be cancelled');
        patch = { status: 'cancelled', cancelled_at: now };
        await trx
          .updateTable('matches.matches')
          .set({ state: 'cancelled' })
          .where('social_round_id', '=', roundId)
          .execute();
        break;
    }

    const updated = await trx
      .updateTable('activities.social_rounds')
      .set({ ...patch, revision: round.revision + 1 })
      .where('id', '=', roundId)
      .returning(ROUND_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'social_round',
      entityId: roundId,
      operation: action,
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { status: round.status },
      after: { status: updated.status, revision: updated.revision },
    });
    if (action === 'start' || action === 'complete') {
      await emitEvent(trx, {
        eventType: action === 'start' ? 'session.round_started' : 'session.round_completed',
        aggregateType: 'social_round',
        aggregateId: roundId,
        payload: {
          occurrenceId: occ.id,
          roundId,
          sequenceNo: round.sequence_no,
          revision: updated.revision,
        },
        dedupeKey: `round_${action}:${roundId}`,
      });
    }
    return toRoundDto(trx, updated, now);
  });
}
