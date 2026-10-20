import type { Regular } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { assertOrgAction } from '../../platform/authz.js';
import { AppError } from '../../problems.js';
import type { DbOrTrx } from './common.js';

/**
 * Regulars: the people usually in a session preset. Starting the preset registers all of them
 * on the new occurrence, so the organiser only checks people in.
 */

async function seriesOrg(db: DbOrTrx, seriesId: string): Promise<string> {
  const row = await db
    .selectFrom('activities.session_series')
    .select('organisation_id')
    .where('id', '=', seriesId)
    .executeTakeFirst();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  return row.organisation_id;
}

export async function listRegulars(db: Db, actor: Actor, seriesId: string): Promise<Regular[]> {
  const orgId = await seriesOrg(db, seriesId);
  assertOrgAction(actor, orgId, 'session.view');
  const rows = await db
    .selectFrom('activities.session_regulars as r')
    .innerJoin('identity.participants as p', 'p.id', 'r.participant_id')
    .leftJoin('identity.user_profiles as u', 'u.id', 'p.user_profile_id')
    .select(['p.id', 'p.display_name', 'u.avatar_url'])
    .where('r.series_id', '=', seriesId)
    .where('p.archived_at', 'is', null)
    .orderBy('p.display_name')
    .execute();
  return rows.map((r) => ({
    participantId: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
  }));
}

/** Replaces the set. Participants must belong to the series' organisation. */
export async function setRegulars(
  db: Db,
  actor: Actor,
  seriesId: string,
  participantIds: string[],
): Promise<Regular[]> {
  const orgId = await seriesOrg(db, seriesId);
  assertOrgAction(actor, orgId, 'session.manage');
  const unique = [...new Set(participantIds)];
  await db.transaction().execute(async (trx) => {
    if (unique.length) {
      const valid = await trx
        .selectFrom('identity.participants')
        .select('id')
        .where('organisation_id', '=', orgId)
        .where('id', 'in', unique)
        .where('archived_at', 'is', null)
        .execute();
      if (valid.length !== unique.length)
        throw new AppError(400, 'VALIDATION_FAILED', 'Every regular must be a player in this club');
    }
    await trx.deleteFrom('activities.session_regulars').where('series_id', '=', seriesId).execute();
    if (unique.length)
      await trx
        .insertInto('activities.session_regulars')
        .values(
          unique.map((participant_id) => ({
            series_id: seriesId,
            participant_id,
            added_by_profile_id: actor.profileId,
          })),
        )
        .execute();
  });
  return listRegulars(db, actor, seriesId);
}

/** Registers every regular of the series on an occurrence that already has none of them. */
export async function registerRegulars(
  db: DbOrTrx,
  seriesId: string,
  occurrenceId: string,
): Promise<number> {
  const regulars = await db
    .selectFrom('activities.session_regulars as r')
    .innerJoin('identity.participants as p', 'p.id', 'r.participant_id')
    .select('r.participant_id')
    .where('r.series_id', '=', seriesId)
    .where('p.archived_at', 'is', null)
    .execute();
  if (!regulars.length) return 0;
  const existing = await db
    .selectFrom('activities.session_entries')
    .select('participant_id')
    .where('occurrence_id', '=', occurrenceId)
    .execute();
  const have = new Set(existing.map((e) => e.participant_id));
  const missing = regulars.map((r) => r.participant_id).filter((id) => !have.has(id));
  if (!missing.length) return 0;
  await db
    .insertInto('activities.session_entries')
    .values(
      missing.map((participant_id) => ({
        occurrence_id: occurrenceId,
        participant_id,
        attendance_status: 'registered' as const,
        joined_at: new Date(),
      })),
    )
    .execute();
  return missing.length;
}
