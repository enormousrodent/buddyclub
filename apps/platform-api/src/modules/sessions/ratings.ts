import {
  RATING_MIN_FOR_SUMMARY,
  RATING_WINDOW_DAYS,
  type PendingRating,
  type RateOccurrenceBody,
  type RatingSummary,
  type SeriesRatingSummary,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgMember } from '../../platform/authz.js';
import { isPgCode, PG_UNIQUE_VIOLATION } from '../../platform/pg-errors.js';
import { toIso } from '../../platform/tokens.js';
import { AppError } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { loadOccurrence, ownParticipantId, type DbOrTrx, type OccurrenceRow } from './common.js';

/**
 * Night ratings (Addendum 1.2 step 3). Attendees with an account rate a completed night once:
 * a score and tags, no text. Nobody ever reads a single rating back; the API serves aggregates
 * once enough people have rated. Hosts are not rated.
 */

const WINDOW_MS = RATING_WINDOW_DAYS * 86_400_000;

function withinWindow(occ: OccurrenceRow, now: Date): boolean {
  return (
    occ.state === 'completed' &&
    occ.completed_at !== null &&
    now.getTime() - occ.completed_at.getTime() <= WINDOW_MS
  );
}

/** Did the caller actually come? Checked in, or left after checking in. */
async function attended(db: DbOrTrx, occ: OccurrenceRow, profileId: string): Promise<boolean> {
  const self = await ownParticipantId(db, occ.organisation_id, profileId);
  if (!self) return false;
  const entry = await db
    .selectFrom('activities.session_entries')
    .select(['attendance_status', 'check_in_at'])
    .where('occurrence_id', '=', occ.id)
    .where('participant_id', '=', self)
    .executeTakeFirst();
  return !!entry && entry.check_in_at !== null && entry.attendance_status !== 'no_show';
}

function aggregate(rows: { score: number; tags: string[] }[]): {
  average: number | null;
  tags: Record<string, number> | null;
} {
  if (rows.length < RATING_MIN_FOR_SUMMARY) return { average: null, tags: null };
  const average = Math.round((rows.reduce((s, r) => s + r.score, 0) / rows.length) * 10) / 10;
  const tags: Record<string, number> = {};
  for (const r of rows) for (const t of r.tags) tags[t] = (tags[t] ?? 0) + 1;
  return { average, tags };
}

export async function summary(db: Db, actor: Actor, occurrenceId: string): Promise<RatingSummary> {
  const occ = await loadOccurrence(db, occurrenceId);
  assertOrgMember(actor, occ.organisation_id);
  const now = new Date();
  const [rows, mine, came] = await Promise.all([
    db
      .selectFrom('activities.session_ratings')
      .select(['score', 'tags'])
      .where('occurrence_id', '=', occurrenceId)
      .execute(),
    db
      .selectFrom('activities.session_ratings')
      .select(['score', 'tags'])
      .where('occurrence_id', '=', occurrenceId)
      .where('rater_profile_id', '=', actor.profileId)
      .executeTakeFirst(),
    attended(db, occ, actor.profileId),
  ]);
  return {
    count: rows.length,
    ...aggregate(rows),
    myRating: mine ? { score: mine.score, tags: mine.tags } : null,
    canRate: !mine && came && withinWindow(occ, now),
  };
}

export async function rate(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  body: RateOccurrenceBody,
  ctx: CommandContext,
): Promise<RatingSummary> {
  const occ = await loadOccurrence(db, occurrenceId);
  assertOrgMember(actor, occ.organisation_id);
  const now = new Date();
  if (!withinWindow(occ, now))
    throw new AppError(
      409,
      'CONFLICT',
      'This night cannot be rated',
      `Ratings open when a night completes and close ${RATING_WINDOW_DAYS} days later`,
    );
  if (!(await attended(db, occ, actor.profileId)))
    throw new AppError(403, 'FORBIDDEN', 'Only people who were there can rate a night');
  await db.transaction().execute(async (trx) => {
    try {
      await trx
        .insertInto('activities.session_ratings')
        .values({
          occurrence_id: occurrenceId,
          rater_profile_id: actor.profileId,
          score: body.score,
          tags: body.tags,
        })
        .execute();
    } catch (error) {
      if (isPgCode(error, PG_UNIQUE_VIOLATION))
        throw new AppError(409, 'CONFLICT', 'You have already rated this night');
      throw error;
    }
    // The audit trail records that a rating was given, never what it was.
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'rate',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { rated: true },
    });
  });
  return summary(db, actor, occurrenceId);
}

export async function seriesSummary(
  db: Db,
  actor: Actor,
  seriesId: string,
): Promise<SeriesRatingSummary> {
  const series = await db
    .selectFrom('activities.session_series')
    .select('organisation_id')
    .where('id', '=', seriesId)
    .executeTakeFirst();
  if (!series) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  assertOrgMember(actor, series.organisation_id);
  const rows = await db
    .selectFrom('activities.session_ratings as r')
    .innerJoin('activities.session_occurrences as o', 'o.id', 'r.occurrence_id')
    .select(['r.score', 'r.tags', 'r.occurrence_id'])
    .where('o.series_id', '=', seriesId)
    .execute();
  return {
    count: rows.length,
    nights: new Set(rows.map((r) => r.occurrence_id)).size,
    ...aggregate(rows),
  };
}

/** Completed nights the caller attended in the last week and has not rated. */
export async function pending(db: Db, actor: Actor): Promise<PendingRating[]> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .selectFrom('activities.session_occurrences as o')
    .innerJoin('activities.session_series as s', 's.id', 'o.series_id')
    .innerJoin('community.organisations as org', 'org.id', 'o.organisation_id')
    .innerJoin('identity.participants as p', (join) =>
      join
        .onRef('p.organisation_id', '=', 'o.organisation_id')
        .on('p.user_profile_id', '=', actor.profileId),
    )
    .innerJoin('activities.session_entries as e', (join) =>
      join.onRef('e.occurrence_id', '=', 'o.id').onRef('e.participant_id', '=', 'p.id'),
    )
    .leftJoin('activities.session_ratings as r', (join) =>
      join.onRef('r.occurrence_id', '=', 'o.id').on('r.rater_profile_id', '=', actor.profileId),
    )
    .select([
      'o.id',
      's.name as series_name',
      'org.name as organisation_name',
      'o.starts_at',
      'o.completed_at',
    ])
    .where('o.state', '=', 'completed')
    .where('o.completed_at', '>=', since)
    .where('e.check_in_at', 'is not', null)
    .where('e.attendance_status', '!=', 'no_show')
    .where('r.id', 'is', null)
    .orderBy('o.completed_at', 'desc')
    .limit(10)
    .execute();
  return rows.map((r) => ({
    occurrenceId: r.id,
    seriesName: r.series_name,
    organisationName: r.organisation_name,
    startsAt: toIso(r.starts_at),
    completedAt: toIso(r.completed_at as Date),
  }));
}
