import type { Round } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertManageSeries } from '../../platform/authz.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { loadOccurrence, loadRound, toRoundDto } from './common.js';

/**
 * Results on social matches (Addendum 1.2 step 4): who won on a court. Stored as a confirmed
 * result revision, the same table league rubbers use; the latest revision counts, and a null
 * winner clears a mistake. King of the court reads these to move teams up and down.
 */
export async function recordResult(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  matchId: string,
  winnerSide: 1 | 2 | null,
  ctx: CommandContext,
): Promise<Round> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, occ.organisation_id, occ.series_id);
    const match = await trx
      .selectFrom('matches.matches as m')
      .innerJoin('activities.social_rounds as r', 'r.id', 'm.social_round_id')
      .select(['m.id', 'r.id as round_id', 'r.status'])
      .where('m.id', '=', matchId)
      .where('r.occurrence_id', '=', occurrenceId)
      .executeTakeFirst();
    if (!match) throw notFound('Match not found in this session');
    if (match.status === 'published' || match.status === 'cancelled')
      throw new AppError(
        409,
        'CONFLICT',
        `Cannot record a result while the round is ${match.status}`,
      );
    const last = await trx
      .selectFrom('matches.result_revisions')
      .select((eb) => eb.fn.max('revision').as('n'))
      .where('match_id', '=', matchId)
      .executeTakeFirst();
    const now = new Date();
    await trx
      .insertInto('matches.result_revisions')
      .values({
        match_id: matchId,
        revision: Number(last?.n ?? 0) + 1,
        submitted_by_profile_id: actor.profileId,
        confirmed_by_profile_id: actor.profileId,
        score_json: JSON.stringify({ winnerSide }),
        result_status: 'confirmed',
        confirmed_at: now,
      })
      .execute();
    await recordAudit(trx, {
      entityType: 'match',
      entityId: matchId,
      operation: 'result',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { occurrenceId, roundId: match.round_id, winnerSide },
    });
    const round = await loadRound(trx, match.round_id);
    return toRoundDto(trx, round, now);
  });
}
