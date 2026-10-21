import type { Host } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { assertOrgAction } from '../../platform/authz.js';
import { AppError } from '../../problems.js';
import type { DbOrTrx } from './common.js';

/**
 * Hosts (Addendum 1.2): club members who may set up and run any night of a session. They do
 * not edit the session itself; only the organisation's organisers do, and only they change the
 * host list. The series' `hosts_enabled` switch turns the whole list off without losing it.
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

export async function listHosts(db: Db, actor: Actor, seriesId: string): Promise<Host[]> {
  const orgId = await seriesOrg(db, seriesId);
  assertOrgAction(actor, orgId, 'session.view');
  return loadHosts(db, seriesId);
}

export async function loadHosts(db: DbOrTrx, seriesId: string): Promise<Host[]> {
  const rows = await db
    .selectFrom('activities.session_hosts as h')
    .innerJoin('identity.user_profiles as u', 'u.id', 'h.profile_id')
    .select(['u.id', 'u.display_name', 'u.avatar_url'])
    .where('h.series_id', '=', seriesId)
    .orderBy('u.display_name')
    .execute();
  return rows.map((r) => ({
    profileId: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
  }));
}

/** Replaces the set. Hosts must be active members of the series' organisation. */
export async function setHosts(
  db: Db,
  actor: Actor,
  seriesId: string,
  profileIds: string[],
): Promise<Host[]> {
  const orgId = await seriesOrg(db, seriesId);
  assertOrgAction(actor, orgId, 'session.manage');
  const unique = [...new Set(profileIds)];
  await db.transaction().execute(async (trx) => {
    if (unique.length) {
      const valid = await trx
        .selectFrom('community.memberships')
        .select('user_profile_id')
        .where('organisation_id', '=', orgId)
        .where('status', '=', 'active')
        .where('user_profile_id', 'in', unique)
        .execute();
      if (valid.length !== unique.length)
        throw new AppError(400, 'VALIDATION_FAILED', 'Every host must be a member of this club');
    }
    await trx.deleteFrom('activities.session_hosts').where('series_id', '=', seriesId).execute();
    if (unique.length)
      await trx
        .insertInto('activities.session_hosts')
        .values(
          unique.map((profile_id) => ({
            series_id: seriesId,
            profile_id,
            added_by_profile_id: actor.profileId,
          })),
        )
        .execute();
  });
  return loadHosts(db, seriesId);
}
