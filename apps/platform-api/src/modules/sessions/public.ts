import type {
  PublicSessionCard,
  PublicSessionsQuery,
  SessionSeries,
} from '@buddyclub/shared-types';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { canOrgAction } from '../../platform/authz.js';
import { toIso } from '../../platform/tokens.js';
import { forbidden } from '../../problems.js';
import { ensureOwnParticipant, type CommandContext } from '../organisations/service.js';
import { loadSeries, nextStartOf, scheduleOf, toSeries } from './common.js';

/**
 * Addendum 1.5: the session is the group. A public session is listed for anyone; an open one
 * can be joined by anyone with an account, who becomes a plain member of its club and one of
 * its regulars. Invitation-only sessions are reached by link as before.
 */

const LIMIT = 50;

export async function listPublicSessions(
  db: Db,
  q: PublicSessionsQuery,
): Promise<PublicSessionCard[]> {
  let query = db
    .selectFrom('activities.session_series as s')
    .innerJoin('community.organisations as o', 'o.id', 's.organisation_id')
    .innerJoin('community.sports as sp', 'sp.id', 's.sport_id')
    .leftJoin('facilities.venues as v', 'v.id', 's.venue_id')
    .select((eb) => [
      's.id',
      's.name',
      's.description',
      's.sport_id',
      'sp.name as sport_name',
      's.organisation_id',
      'o.name as organisation_name',
      'v.name as venue_name',
      's.locality',
      's.join_policy',
      's.schedule_weekday',
      's.schedule_time',
      's.schedule_timezone',
      's.default_duration_minutes',
      eb
        .selectFrom('activities.session_regulars as r')
        .select(eb.fn.countAll<string>().as('n'))
        .whereRef('r.series_id', '=', 's.id')
        .as('regulars'),
    ])
    .where('s.visibility', '=', 'public')
    .where('s.archived_at', 'is', null)
    .orderBy('s.name')
    .limit(LIMIT);
  if (q.sport) query = query.where('s.sport_id', '=', q.sport);
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '')}%`;
    query = query.where((eb) => eb.or([eb('s.name', 'ilike', like), eb('o.name', 'ilike', like)]));
  }
  if (q.locality) {
    const like = `%${q.locality.replace(/[%_]/g, '')}%`;
    query = query.where(sql<boolean>`coalesce(s.locality, v.name, o.name) ilike ${like}`);
  }
  const rows = await query.execute();
  return rows.map((r) => {
    const next = nextStartOf(r);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      sportId: r.sport_id,
      sportName: r.sport_name,
      organisationId: r.organisation_id,
      organisationName: r.organisation_name,
      venueName: r.venue_name ?? null,
      locality: r.locality,
      schedule: scheduleOf(r),
      nextAt: next ? toIso(next) : null,
      joinPolicy: r.join_policy,
      regulars: Number(r.regulars ?? 0),
    };
  });
}

/** Join an open session: club membership if needed, a player record, and a place on the regulars. */
export async function joinSession(
  db: Db,
  actor: Actor,
  seriesId: string,
  ctx: CommandContext,
): Promise<SessionSeries> {
  const row = await loadSeries(db, seriesId);
  const membership = actor.memberships.get(row.organisation_id);
  const isMember = !!membership && membership.status === 'active';
  const organiser = canOrgAction(actor, row.organisation_id, 'session.manage');
  if (row.archived_at) throw forbidden('This session has been archived');
  if (!organiser && row.join_policy !== 'open')
    throw forbidden('This session is invitation only; ask the organiser for a link');
  if (!isMember && row.visibility !== 'public')
    throw forbidden('This session is private; ask the organiser for a link');
  await db.transaction().execute(async (trx) => {
    if (!isMember)
      await trx
        .insertInto('community.memberships')
        .values({
          organisation_id: row.organisation_id,
          user_profile_id: actor.profileId,
          role: 'participant',
        })
        .onConflict((oc) =>
          oc.columns(['organisation_id', 'user_profile_id']).doUpdateSet({ status: 'active' }),
        )
        .execute();
    await ensureOwnParticipant(trx, row.organisation_id, actor.profileId, actor.displayName);
    const participant = await trx
      .selectFrom('identity.participants')
      .select('id')
      .where('organisation_id', '=', row.organisation_id)
      .where('user_profile_id', '=', actor.profileId)
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('activities.session_regulars')
      .values({
        series_id: seriesId,
        participant_id: participant.id,
        added_by_profile_id: actor.profileId,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
    await recordAudit(trx, {
      entityType: 'session_series',
      entityId: seriesId,
      operation: 'join',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId: participant.id, newMember: !isMember },
    });
  });
  return toSeries(row, actor);
}
