import type { CreateJoinRequestBody, JoinRequest } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, canOrgAction } from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import { ensureOwnParticipant, type CommandContext } from '../organisations/service.js';
import { loadSeries } from '../sessions/common.js';

/**
 * Ask to join (2026-10-26). A person who finds a public, invitation-only session asks to join
 * its club; organisers (anyone who may invite) approve or decline. One open request per person
 * per club. Approval does what an invitation link does, plus a place as a regular of the session
 * they asked about.
 */

type DbOrTrx = Db | Parameters<Parameters<ReturnType<Db['transaction']>['execute']>[0]>[0];

async function loadRequests(
  db: DbOrTrx,
  where: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>,
): Promise<JoinRequest[]> {
  const rows = await where(baseQuery(db)).execute();
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  const sports = new Map<string, JoinRequest['sports']>();
  if (ids.length) {
    const activities = await db
      .selectFrom('identity.profile_activities as a')
      .innerJoin('community.sports as s', 's.id', 'a.sport_id')
      .select(['a.profile_id', 's.name', 'a.level'])
      .where('a.profile_id', 'in', ids)
      .where('a.sport_id', '<>', 'other')
      .orderBy('s.name')
      .execute();
    for (const a of activities) {
      const list = sports.get(a.profile_id) ?? [];
      list.push({ activityName: a.name, level: a.level });
      sports.set(a.profile_id, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    organisationId: r.organisation_id,
    organisationName: r.organisation_name,
    seriesId: r.series_id,
    seriesName: r.series_name ?? null,
    profileId: r.profile_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    sports: sports.get(r.profile_id) ?? [],
    note: r.note,
    status: r.status,
    createdAt: toIso(r.created_at),
    decidedAt: toIsoOrNull(r.decided_at),
  }));
}

function baseQuery(db: DbOrTrx) {
  return db
    .selectFrom('community.join_requests as j')
    .innerJoin('community.organisations as o', 'o.id', 'j.organisation_id')
    .innerJoin('identity.user_profiles as u', 'u.id', 'j.profile_id')
    .leftJoin('activities.session_series as s', 's.id', 'j.series_id')
    .select([
      'j.id',
      'j.organisation_id',
      'o.name as organisation_name',
      'j.series_id',
      's.name as series_name',
      'j.profile_id',
      'u.display_name',
      'u.avatar_url',
      'j.note',
      'j.status',
      'j.created_at',
      'j.decided_at',
    ])
    .orderBy('j.created_at', 'desc')
    .limit(100);
}

/** Ask to join the club behind a public, invitation-only session. Idempotent while pending. */
export async function requestToJoin(
  db: Db,
  actor: Actor,
  seriesId: string,
  body: CreateJoinRequestBody,
  ctx: CommandContext,
): Promise<{ request: JoinRequest; created: boolean }> {
  const series = await loadSeries(db, seriesId);
  if (series.visibility !== 'public' || series.archived_at) throw notFound('No such session');
  const membership = actor.memberships.get(series.organisation_id);
  if (membership && membership.status === 'active')
    throw new AppError(409, 'CONFLICT', 'You are already a member of this club');
  if (series.join_policy === 'open')
    throw new AppError(409, 'CONFLICT', 'This session is open: join it directly');

  const created = await db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('community.join_requests')
      .values({
        organisation_id: series.organisation_id,
        series_id: seriesId,
        profile_id: actor.profileId,
        note: body.note || null,
      })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) return false;
    await recordAudit(trx, {
      entityType: 'organisation',
      entityId: series.organisation_id,
      operation: 'join_requested',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { requestId: inserted.id, seriesId },
    });
    await emitEvent(trx, {
      eventType: 'community.join_requested',
      aggregateType: 'organisation',
      aggregateId: series.organisation_id,
      payload: { requestId: inserted.id, profileId: actor.profileId, seriesId },
      dedupeKey: `join_requested:${inserted.id}`,
    });
    return true;
  });
  const [request] = await loadRequests(db, (q) =>
    q
      .where('j.organisation_id', '=', series.organisation_id)
      .where('j.profile_id', '=', actor.profileId)
      .where('j.status', '=', 'pending'),
  );
  if (!request) throw notFound('No such request');
  return { request, created };
}

/** The caller's own requests, newest first, every status. */
export async function listMyJoinRequests(db: Db, actor: Actor): Promise<JoinRequest[]> {
  return loadRequests(db, (q) => q.where('j.profile_id', '=', actor.profileId));
}

/** Pending requests across every club the caller may invite into. */
export async function inbox(db: Db, actor: Actor): Promise<JoinRequest[]> {
  const orgs = [...actor.memberships.keys()].filter((id) =>
    canOrgAction(actor, id, 'members.invite'),
  );
  if (!orgs.length) return [];
  return loadRequests(db, (q) =>
    q.where('j.organisation_id', 'in', orgs).where('j.status', '=', 'pending'),
  );
}

export async function listOrgJoinRequests(
  db: Db,
  actor: Actor,
  orgId: string,
  status: JoinRequest['status'] | undefined,
): Promise<JoinRequest[]> {
  assertOrgAction(actor, orgId, 'members.invite');
  return loadRequests(db, (q) =>
    q
      .where('j.organisation_id', '=', orgId)
      .$if(Boolean(status), (qb) => qb.where('j.status', '=', status as JoinRequest['status'])),
  );
}

/** Approve (member, player record, regular of the session asked about) or decline. */
export async function decideJoinRequest(
  db: Db,
  actor: Actor,
  orgId: string,
  requestId: string,
  approve: boolean,
  ctx: CommandContext,
): Promise<JoinRequest> {
  assertOrgAction(actor, orgId, 'members.invite');
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('community.join_requests as j')
      .innerJoin('identity.user_profiles as u', 'u.id', 'j.profile_id')
      .leftJoin('activities.session_series as s', 's.id', 'j.series_id')
      .select(['j.id', 'j.profile_id', 'j.series_id', 'u.display_name', 's.archived_at'])
      .where('j.id', '=', requestId)
      .where('j.organisation_id', '=', orgId)
      .where('j.status', '=', 'pending')
      .forUpdate('j')
      .executeTakeFirst();
    if (!row) throw notFound('No open request with that id');
    if (approve) {
      await trx
        .insertInto('community.memberships')
        .values({ organisation_id: orgId, user_profile_id: row.profile_id, role: 'participant' })
        .onConflict((oc) =>
          oc.columns(['organisation_id', 'user_profile_id']).doUpdateSet({ status: 'active' }),
        )
        .execute();
      await ensureOwnParticipant(trx, orgId, row.profile_id, row.display_name);
      if (row.series_id && !row.archived_at) {
        const participant = await trx
          .selectFrom('identity.participants')
          .select('id')
          .where('organisation_id', '=', orgId)
          .where('user_profile_id', '=', row.profile_id)
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('activities.session_regulars')
          .values({
            series_id: row.series_id,
            participant_id: participant.id,
            added_by_profile_id: actor.profileId,
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    }
    await trx
      .updateTable('community.join_requests')
      .set({
        status: approve ? 'approved' : 'declined',
        decided_by_profile_id: actor.profileId,
        decided_at: new Date(),
      })
      .where('id', '=', requestId)
      .execute();
    await recordAudit(trx, {
      entityType: 'organisation',
      entityId: orgId,
      operation: approve ? 'join_approved' : 'join_declined',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { requestId, profileId: row.profile_id },
    });
    await emitEvent(trx, {
      eventType: 'community.join_decided',
      aggregateType: 'user_profile',
      aggregateId: row.profile_id,
      payload: { requestId, organisationId: orgId, approved: approve },
      dedupeKey: `join_decided:${requestId}`,
    });
  });
  const [request] = await loadRequests(db, (q) => q.where('j.id', '=', requestId));
  if (!request) throw notFound('No such request');
  return request;
}
