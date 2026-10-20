import type {
  Activity,
  CreateActivityBody,
  CreateCommunityGroupBody,
  DiscoverQuery,
  DiscoverResult,
  GroupCard,
  Interest,
  MyCommunity,
  MyGroup,
  PublicActivityCard,
  RsvpStatusSchema,
  UpdateCommunityGroupBody,
} from '@buddyclub/shared-types';
import type { z } from 'zod';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, canOrgAction } from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { isPgCode, PG_UNIQUE_VIOLATION } from '../../platform/pg-errors.js';
import { slugify, toIso } from '../../platform/tokens.js';
import { AppError, forbidden, notFound } from '../../problems.js';
import type { Transaction } from 'kysely';
import type { Database } from '../../db/index.js';
import { ensureOwnParticipant, type CommandContext } from '../organisations/service.js';
import { ownParticipantId } from '../sessions/common.js';

type DbOrTrx = Db | Transaction<Database>;
type RsvpStatus = z.infer<typeof RsvpStatusSchema>;

/** Category-agnostic community model: interests, public groups, activities, RSVPs (ADR-018). */

export async function listInterests(db: DbOrTrx): Promise<Interest[]> {
  const rows = await db
    .selectFrom('community.interests')
    .select(['id', 'name', 'sort_order'])
    .orderBy('sort_order')
    .orderBy('name')
    .execute();
  return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

async function interestsFor(db: DbOrTrx, groupIds: string[]): Promise<Map<string, Interest[]>> {
  const out = new Map<string, Interest[]>();
  if (!groupIds.length) return out;
  const rows = await db
    .selectFrom('community.group_interests as gi')
    .innerJoin('community.interests as i', 'i.id', 'gi.interest_id')
    .select(['gi.group_id', 'i.id', 'i.name', 'i.sort_order'])
    .where('gi.group_id', 'in', groupIds)
    .orderBy('i.sort_order')
    .execute();
  for (const r of rows)
    out.set(r.group_id, [
      ...(out.get(r.group_id) ?? []),
      { id: r.id, name: r.name, sortOrder: r.sort_order },
    ]);
  return out;
}

function groupCardQuery(db: DbOrTrx) {
  const now = new Date();
  return db
    .selectFrom('community.groups as g')
    .innerJoin('community.organisations as o', 'o.id', 'g.organisation_id')
    .select((eb) => [
      'g.id',
      'g.name',
      'g.description',
      'g.sport_id',
      'g.visibility',
      'g.join_policy',
      'g.locality',
      'g.location_name',
      'g.organisation_id',
      'o.name as organisation_name',
      eb
        .selectFrom('community.group_members as gm')
        .select((e) => e.fn.countAll<string>().as('n'))
        .whereRef('gm.group_id', '=', 'g.id')
        .where('gm.status', '=', 'active')
        .as('member_count'),
      eb
        .selectFrom('community.activities as a')
        .select('a.id')
        .whereRef('a.group_id', '=', 'g.id')
        .where('a.state', '=', 'scheduled')
        .where('a.starts_at', '>=', now)
        .orderBy('a.starts_at')
        .limit(1)
        .as('next_activity_id'),
    ])
    .where('g.archived_at', 'is', null);
}

type GroupCardRow = Awaited<ReturnType<ReturnType<typeof groupCardQuery>['execute']>>[number];

async function toGroupCards(db: DbOrTrx, rows: GroupCardRow[]): Promise<GroupCard[]> {
  const interests = await interestsFor(
    db,
    rows.map((r) => r.id),
  );
  const nextIds = rows.map((r) => r.next_activity_id).filter((x): x is string => !!x);
  const next = nextIds.length
    ? await db
        .selectFrom('community.activities')
        .select(['id', 'title', 'starts_at'])
        .where('id', 'in', nextIds)
        .execute()
    : [];
  return rows.map((r) => {
    const n = next.find((a) => a.id === r.next_activity_id);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      interests: interests.get(r.id) ?? [],
      sportId: r.sport_id,
      visibility: r.visibility,
      joinPolicy: r.join_policy,
      locality: r.locality,
      locationName: r.location_name,
      organisationId: r.organisation_id,
      organisationName: r.organisation_name,
      memberCount: Number(r.member_count ?? 0),
      nextActivity: n ? { id: n.id, title: n.title, startsAt: toIso(n.starts_at) } : null,
    };
  });
}

async function loadGroupCard(db: DbOrTrx, groupId: string): Promise<GroupCard> {
  const row = await groupCardQuery(db).where('g.id', '=', groupId).executeTakeFirst();
  if (!row) throw notFound('Group not found');
  return (await toGroupCards(db, [row]))[0] as GroupCard;
}

function assertCanSee(actor: Actor | null, group: GroupCard): void {
  if (group.visibility === 'public') return;
  const m = actor?.memberships.get(group.organisationId);
  if (!m || m.status !== 'active') throw notFound('Group not found');
}

/** A public group for anyone; a private one for its club's members. */
export async function getCommunityGroup(
  db: Db,
  actor: Actor | null,
  groupId: string,
): Promise<{ group: GroupCard; activities: Activity[]; myRole: 'organiser' | 'member' | null }> {
  const group = await loadGroupCard(db, groupId);
  assertCanSee(actor, group);
  const activities = await listActivities(db, actor, {
    groupId,
    publicOnly: !actor?.memberships.get(group.organisationId),
  });
  let myRole: 'organiser' | 'member' | null = null;
  if (actor) {
    if (canOrgAction(actor, group.organisationId, 'groups.manage')) myRole = 'organiser';
    else {
      const pid = await ownParticipantId(db, group.organisationId, actor.profileId);
      if (pid) {
        const member = await db
          .selectFrom('community.group_members')
          .select('id')
          .where('group_id', '=', groupId)
          .where('participant_id', '=', pid)
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (member) myRole = 'member';
      }
    }
  }
  return { group, activities, myRole };
}

/**
 * Creates a community group. Without an organisation, a club named after the group is created
 * with the caller as admin, so a person with no club can start one (ADR-018).
 */
export async function createCommunityGroup(
  db: Db,
  actor: Actor,
  body: CreateCommunityGroupBody,
  ctx: CommandContext,
): Promise<GroupCard> {
  if (body.organisationId) assertOrgAction(actor, body.organisationId, 'groups.manage');
  const known = await db
    .selectFrom('community.interests')
    .select('id')
    .where('id', 'in', body.interestIds)
    .execute();
  if (known.length !== new Set(body.interestIds).size)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown interest', undefined, [
      { path: 'body/interestIds', message: 'all interests must exist' },
    ]);
  const groupId = await db.transaction().execute(async (trx) => {
    let organisationId = body.organisationId ?? null;
    if (!organisationId) {
      const base = slugify(body.name).slice(0, 48) || 'group';
      let created: { id: string } | null = null;
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          created = await trx
            .insertInto('community.organisations')
            .values({ name: body.name, slug, owner_profile_id: actor.profileId, kind: 'club' })
            .returning('id')
            .executeTakeFirstOrThrow();
        } catch (error) {
          if (!isPgCode(error, PG_UNIQUE_VIOLATION)) throw error;
        }
      }
      if (!created) throw new AppError(409, 'CONFLICT', 'Could not find a free name for the club');
      organisationId = created.id;
      await trx
        .insertInto('community.memberships')
        .values({
          organisation_id: organisationId,
          user_profile_id: actor.profileId,
          role: 'org_admin',
        })
        .execute();
      await ensureOwnParticipant(trx, organisationId, actor.profileId, actor.displayName);
      await recordAudit(trx, {
        entityType: 'organisation',
        entityId: organisationId,
        operation: 'create',
        actor: { type: 'user', id: actor.profileId },
        correlationId: ctx.correlationId,
        after: { name: body.name, from: 'community_group' },
      });
    }
    const group = await trx
      .insertInto('community.groups')
      .values({
        organisation_id: organisationId,
        sport_id: body.sportId ?? null,
        name: body.name,
        description: body.description ?? null,
        visibility: body.visibility,
        join_policy: body.joinPolicy,
        locality: body.locality ?? null,
        location_name: body.locationName ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('community.group_interests')
      .values(
        [...new Set(body.interestIds)].map((interest_id) => ({ group_id: group.id, interest_id })),
      )
      .execute();
    // The creator is the first member.
    await ensureOwnParticipant(trx, organisationId, actor.profileId, actor.displayName);
    const pid = await ownParticipantId(trx, organisationId, actor.profileId);
    if (pid)
      await trx
        .insertInto('community.group_members')
        .values({ group_id: group.id, participant_id: pid })
        .onConflict((oc) => oc.doNothing())
        .execute();
    await recordAudit(trx, {
      entityType: 'group',
      entityId: group.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: {
        organisationId,
        name: body.name,
        interests: body.interestIds,
        visibility: body.visibility,
      },
    });
    return group.id;
  });
  return loadGroupCard(db, groupId);
}

export async function updateCommunityGroup(
  db: Db,
  actor: Actor,
  groupId: string,
  body: UpdateCommunityGroupBody,
  ctx: CommandContext,
): Promise<GroupCard> {
  const group = await loadGroupCard(db, groupId);
  assertOrgAction(actor, group.organisationId, 'groups.manage');
  await db.transaction().execute(async (trx) => {
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.description !== undefined) patch['description'] = body.description;
    if (body.visibility !== undefined) patch['visibility'] = body.visibility;
    if (body.joinPolicy !== undefined) patch['join_policy'] = body.joinPolicy;
    if (body.locality !== undefined) patch['locality'] = body.locality;
    if (body.locationName !== undefined) patch['location_name'] = body.locationName;
    if (Object.keys(patch).length)
      await trx.updateTable('community.groups').set(patch).where('id', '=', groupId).execute();
    if (body.interestIds) {
      await trx.deleteFrom('community.group_interests').where('group_id', '=', groupId).execute();
      await trx
        .insertInto('community.group_interests')
        .values(
          [...new Set(body.interestIds)].map((interest_id) => ({ group_id: groupId, interest_id })),
        )
        .execute();
    }
    await recordAudit(trx, {
      entityType: 'group',
      entityId: groupId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: body,
    });
  });
  return loadGroupCard(db, groupId);
}

/** Joins a public, open group: becomes a club participant member if needed, then a group member. */
export async function joinGroup(
  db: Db,
  actor: Actor,
  groupId: string,
  ctx: CommandContext,
): Promise<MyGroup> {
  const group = await loadGroupCard(db, groupId);
  const membership = actor.memberships.get(group.organisationId);
  const isMember = !!membership && membership.status === 'active';
  const organiser = canOrgAction(actor, group.organisationId, 'groups.manage');
  if (!organiser && group.joinPolicy !== 'open')
    throw forbidden('This group is invitation only; ask an organiser for a link');
  if (!isMember && group.visibility !== 'public')
    throw forbidden('This group is private; ask an organiser for a link');
  await db.transaction().execute(async (trx) => {
    if (!isMember)
      await trx
        .insertInto('community.memberships')
        .values({
          organisation_id: group.organisationId,
          user_profile_id: actor.profileId,
          role: 'participant',
        })
        .onConflict((oc) =>
          oc.columns(['organisation_id', 'user_profile_id']).doUpdateSet({ status: 'active' }),
        )
        .execute();
    await ensureOwnParticipant(trx, group.organisationId, actor.profileId, actor.displayName);
    const pid = (await ownParticipantId(trx, group.organisationId, actor.profileId)) as string;
    await trx
      .insertInto('community.group_members')
      .values({ group_id: groupId, participant_id: pid })
      .onConflict((oc) =>
        oc.columns(['group_id', 'participant_id']).doUpdateSet({ status: 'active', left_at: null }),
      )
      .execute();
    await recordAudit(trx, {
      entityType: 'group',
      entityId: groupId,
      operation: 'join',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId: pid, newMember: !isMember },
    });
  });
  return {
    ...(await loadGroupCard(db, groupId)),
    role:
      isMember && canOrgAction(actor, group.organisationId, 'groups.manage')
        ? 'organiser'
        : 'member',
  };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

interface ActivityRow {
  id: string;
  group_id: string;
  group_name: string;
  organisation_id: string;
  organisation_name: string;
  title: string;
  description: string | null;
  interest_id: string | null;
  interest_name: string | null;
  interest_sort: number | null;
  venue_id: string | null;
  venue_name: string | null;
  location_name: string | null;
  starts_at: Date;
  ends_at: Date;
  capacity: number | null;
  visibility: 'public' | 'private';
  state: 'scheduled' | 'cancelled' | 'completed';
  rally_occurrence_id: string | null;
  rally_state: string | null;
  rally_slug: string | null;
  version: number;
  created_at: Date;
}

function activityQuery(db: DbOrTrx) {
  return db
    .selectFrom('community.activities as a')
    .innerJoin('community.groups as g', 'g.id', 'a.group_id')
    .innerJoin('community.organisations as o', 'o.id', 'a.organisation_id')
    .leftJoin('community.interests as i', 'i.id', 'a.interest_id')
    .leftJoin('facilities.venues as v', 'v.id', 'a.venue_id')
    .leftJoin('activities.session_occurrences as so', 'so.id', 'a.rally_occurrence_id')
    .select([
      'a.id',
      'a.group_id',
      'g.name as group_name',
      'a.organisation_id',
      'o.name as organisation_name',
      'a.title',
      'a.description',
      'a.interest_id',
      'i.name as interest_name',
      'i.sort_order as interest_sort',
      'a.venue_id',
      'v.name as venue_name',
      'a.location_name',
      'a.starts_at',
      'a.ends_at',
      'a.capacity',
      'a.visibility',
      'a.state',
      'a.rally_occurrence_id',
      'so.state as rally_state',
      'so.public_slug as rally_slug',
      'a.version',
      'a.created_at',
    ]);
}

async function counts(
  db: DbOrTrx,
  rows: ActivityRow[],
): Promise<Map<string, { going: number; maybe: number }>> {
  const out = new Map<string, { going: number; maybe: number }>();
  if (!rows.length) return out;
  const rsvps = await db
    .selectFrom('community.activity_rsvps')
    .select((eb) => ['activity_id', 'status', eb.fn.countAll<string>().as('n')])
    .where(
      'activity_id',
      'in',
      rows.map((r) => r.id),
    )
    .groupBy(['activity_id', 'status'])
    .execute();
  const rallyIds = rows.map((r) => r.rally_occurrence_id).filter((x): x is string => !!x);
  const rally = rallyIds.length
    ? await db
        .selectFrom('activities.session_entries')
        .select((eb) => ['occurrence_id', eb.fn.countAll<string>().as('n')])
        .where('occurrence_id', 'in', rallyIds)
        .where('attendance_status', 'in', ['registered', 'checked_in'])
        .groupBy('occurrence_id')
        .execute()
    : [];
  for (const r of rows) {
    const going = r.rally_occurrence_id
      ? Number(rally.find((x) => x.occurrence_id === r.rally_occurrence_id)?.n ?? 0)
      : Number(rsvps.find((x) => x.activity_id === r.id && x.status === 'going')?.n ?? 0);
    const maybe = Number(rsvps.find((x) => x.activity_id === r.id && x.status === 'maybe')?.n ?? 0);
    out.set(r.id, { going, maybe });
  }
  return out;
}

async function toActivities(
  db: DbOrTrx,
  actor: Actor | null,
  rows: ActivityRow[],
): Promise<Activity[]> {
  const c = await counts(db, rows);
  const pids = actor
    ? (
        await db
          .selectFrom('identity.participants')
          .select(['id', 'organisation_id'])
          .where('user_profile_id', '=', actor.profileId)
          .where('archived_at', 'is', null)
          .execute()
      ).map((p) => p.id)
    : [];
  const myRsvps =
    pids.length && rows.length
      ? await db
          .selectFrom('community.activity_rsvps')
          .select(['activity_id', 'status'])
          .where('participant_id', 'in', pids)
          .where(
            'activity_id',
            'in',
            rows.map((r) => r.id),
          )
          .execute()
      : [];
  const rallyIds = rows.map((r) => r.rally_occurrence_id).filter((x): x is string => !!x);
  const myEntries =
    pids.length && rallyIds.length
      ? await db
          .selectFrom('activities.session_entries')
          .select(['occurrence_id', 'attendance_status'])
          .where('participant_id', 'in', pids)
          .where('occurrence_id', 'in', rallyIds)
          .execute()
      : [];
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    groupName: r.group_name,
    organisationId: r.organisation_id,
    organisationName: r.organisation_name,
    title: r.title,
    description: r.description,
    interest:
      r.interest_id && r.interest_name
        ? { id: r.interest_id, name: r.interest_name, sortOrder: r.interest_sort ?? 100 }
        : null,
    venueId: r.venue_id,
    venueName: r.venue_name,
    locationName: r.location_name,
    startsAt: toIso(r.starts_at),
    endsAt: toIso(r.ends_at),
    capacity: r.capacity,
    visibility: r.visibility,
    state: r.state,
    goingCount: c.get(r.id)?.going ?? 0,
    maybeCount: c.get(r.id)?.maybe ?? 0,
    myRsvp: myRsvps.find((m) => m.activity_id === r.id)?.status ?? null,
    rally: r.rally_occurrence_id
      ? {
          occurrenceId: r.rally_occurrence_id,
          state: r.rally_state ?? 'draft',
          publicSlug: r.rally_slug,
          myAttendance:
            myEntries.find((e) => e.occurrence_id === r.rally_occurrence_id)?.attendance_status ??
            null,
        }
      : null,
    version: r.version,
    createdAt: toIso(r.created_at),
  }));
}

async function listActivities(
  db: DbOrTrx,
  actor: Actor | null,
  opts: { groupId: string; publicOnly: boolean },
): Promise<Activity[]> {
  let q = activityQuery(db)
    .where('a.group_id', '=', opts.groupId)
    .where('a.ends_at', '>=', new Date(Date.now() - 6 * 3600 * 1000))
    .orderBy('a.starts_at')
    .limit(30);
  if (opts.publicOnly) q = q.where('a.visibility', '=', 'public');
  return toActivities(db, actor, (await q.execute()) as ActivityRow[]);
}

async function loadActivity(db: DbOrTrx, activityId: string): Promise<ActivityRow> {
  const row = await activityQuery(db).where('a.id', '=', activityId).executeTakeFirst();
  if (!row) throw notFound('Activity not found');
  return row as ActivityRow;
}

export async function getActivity(
  db: Db,
  actor: Actor | null,
  activityId: string,
): Promise<Activity> {
  const row = await loadActivity(db, activityId);
  if (row.visibility !== 'public') {
    const m = actor?.memberships.get(row.organisation_id);
    if (!m || m.status !== 'active') throw notFound('Activity not found');
  }
  return (await toActivities(db, actor, [row]))[0] as Activity;
}

export async function createActivity(
  db: Db,
  actor: Actor,
  groupId: string,
  body: CreateActivityBody,
  ctx: CommandContext,
): Promise<Activity> {
  const group = await loadGroupCard(db, groupId);
  assertOrgAction(actor, group.organisationId, 'groups.manage');
  const startsAt = new Date(body.startsAt);
  const endsAt = body.endsAt
    ? new Date(body.endsAt)
    : new Date(startsAt.getTime() + 2 * 3600 * 1000);
  if (body.venueId) {
    const v = await db
      .selectFrom('facilities.venues')
      .select('id')
      .where('id', '=', body.venueId)
      .where('organisation_id', '=', group.organisationId)
      .executeTakeFirst();
    if (!v)
      throw new AppError(400, 'VALIDATION_FAILED', 'Unknown venue', undefined, [
        { path: 'body/venueId', message: 'not a venue of this club' },
      ]);
  }
  if (body.rallyOccurrenceId)
    await assertRallyLinkable(db, group.organisationId, body.rallyOccurrenceId);
  const id = await db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('community.activities')
      .values({
        organisation_id: group.organisationId,
        group_id: groupId,
        title: body.title,
        description: body.description ?? null,
        interest_id: body.interestId ?? group.interests[0]?.id ?? null,
        venue_id: body.venueId ?? null,
        location_name: body.locationName ?? group.locationName,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity: body.capacity ?? null,
        visibility: body.visibility ?? group.visibility,
        rally_occurrence_id: body.rallyOccurrenceId ?? null,
        created_by_profile_id: actor.profileId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'activity',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: {
        groupId,
        title: body.title,
        startsAt: startsAt.toISOString(),
        rally: body.rallyOccurrenceId ?? null,
      },
    });
    return row.id;
  });
  return getActivity(db, actor, id);
}

async function assertRallyLinkable(db: DbOrTrx, organisationId: string, occurrenceId: string) {
  const occ = await db
    .selectFrom('activities.session_occurrences')
    .select(['id', 'organisation_id'])
    .where('id', '=', occurrenceId)
    .executeTakeFirst();
  if (!occ || occ.organisation_id !== organisationId)
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Rally session must belong to the same club',
      undefined,
      [{ path: 'body/rallyOccurrenceId', message: 'unknown or in another club' }],
    );
  const taken = await db
    .selectFrom('community.activities')
    .select('id')
    .where('rally_occurrence_id', '=', occurrenceId)
    .executeTakeFirst();
  if (taken)
    throw new AppError(409, 'CONFLICT', 'That Rally session is already linked to an activity');
}

export async function linkRally(
  db: Db,
  actor: Actor,
  activityId: string,
  occurrenceId: string | null,
  ctx: CommandContext,
): Promise<Activity> {
  const row = await loadActivity(db, activityId);
  assertOrgAction(actor, row.organisation_id, 'session.manage');
  if (occurrenceId) await assertRallyLinkable(db, row.organisation_id, occurrenceId);
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('community.activities')
      .set({ rally_occurrence_id: occurrenceId, version: row.version + 1 })
      .where('id', '=', activityId)
      .execute();
    await recordAudit(trx, {
      entityType: 'activity',
      entityId: activityId,
      operation: occurrenceId ? 'rally_link' : 'rally_unlink',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { rallyOccurrenceId: row.rally_occurrence_id },
      after: { rallyOccurrenceId: occurrenceId },
    });
  });
  return getActivity(db, actor, activityId);
}

export async function cancelActivity(
  db: Db,
  actor: Actor,
  activityId: string,
  ctx: CommandContext,
): Promise<Activity> {
  const row = await loadActivity(db, activityId);
  assertOrgAction(actor, row.organisation_id, 'groups.manage');
  if (row.state !== 'scheduled') throw new AppError(409, 'CONFLICT', `Activity is ${row.state}`);
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('community.activities')
      .set({ state: 'cancelled', version: row.version + 1 })
      .where('id', '=', activityId)
      .execute();
    await recordAudit(trx, {
      entityType: 'activity',
      entityId: activityId,
      operation: 'cancel',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
    });
    await emitEvent(trx, {
      eventType: 'activity.cancelled',
      aggregateType: 'activity',
      aggregateId: activityId,
      payload: { activityId, groupId: row.group_id },
      dedupeKey: `activity_cancelled:${activityId}`,
    });
  });
  return getActivity(db, actor, activityId);
}

/**
 * RSVP. Joining a public open group happens implicitly. When Rally runs the gathering, Rally's
 * entries are the ledger: `going` registers the person, `not_going` withdraws a registration.
 */
export async function rsvp(
  db: Db,
  actor: Actor,
  activityId: string,
  status: RsvpStatus,
  ctx: CommandContext,
): Promise<Activity> {
  const row = await loadActivity(db, activityId);
  if (row.state !== 'scheduled') throw new AppError(409, 'CONFLICT', `Activity is ${row.state}`);
  const membership = actor.memberships.get(row.organisation_id);
  if (!membership || membership.status !== 'active') {
    const group = await loadGroupCard(db, row.group_id);
    if (group.visibility !== 'public' || group.joinPolicy !== 'open')
      throw forbidden('Join the group first');
    await joinGroup(db, actor, row.group_id, ctx);
  }
  await db.transaction().execute(async (trx) => {
    await ensureOwnParticipant(trx, row.organisation_id, actor.profileId, actor.displayName);
    const pid = (await ownParticipantId(trx, row.organisation_id, actor.profileId)) as string;
    if (status === 'going' && row.capacity && !row.rally_occurrence_id) {
      const going = await trx
        .selectFrom('community.activity_rsvps')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('activity_id', '=', activityId)
        .where('status', '=', 'going')
        .where('participant_id', '!=', pid)
        .executeTakeFirst();
      if (Number(going?.n ?? 0) >= row.capacity)
        throw new AppError(
          409,
          'CONFLICT',
          'This activity is full',
          'Choose maybe to be told if a place opens',
        );
    }
    await trx
      .insertInto('community.activity_rsvps')
      .values({ activity_id: activityId, participant_id: pid, status })
      .onConflict((oc) => oc.columns(['activity_id', 'participant_id']).doUpdateSet({ status }))
      .execute();
    if (row.rally_occurrence_id) {
      const occ = await trx
        .selectFrom('activities.session_occurrences')
        .select(['id', 'state', 'version'])
        .where('id', '=', row.rally_occurrence_id)
        .forUpdate()
        .executeTakeFirst();
      if (occ && ['draft', 'open', 'live'].includes(occ.state)) {
        if (status === 'going') {
          await trx
            .insertInto('activities.session_entries')
            .values({
              occurrence_id: occ.id,
              participant_id: pid,
              attendance_status: 'registered',
              joined_at: new Date(),
              created_by_profile_id: actor.profileId,
            })
            .onConflict((oc) => oc.columns(['occurrence_id', 'participant_id']).doNothing())
            .execute();
        } else if (status === 'not_going') {
          await trx
            .updateTable('activities.session_entries')
            .set({ attendance_status: 'left', left_at: new Date(), left_reason: 'rsvp' })
            .where('occurrence_id', '=', occ.id)
            .where('participant_id', '=', pid)
            .where('attendance_status', '=', 'registered')
            .execute();
        }
        await trx
          .updateTable('activities.session_occurrences')
          .set({ version: occ.version + 1 })
          .where('id', '=', occ.id)
          .execute();
      }
    }
    await recordAudit(trx, {
      entityType: 'activity',
      entityId: activityId,
      operation: 'rsvp',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId: pid, status, rally: row.rally_occurrence_id },
    });
  });
  return getActivity(db, actor, activityId);
}

// ---------------------------------------------------------------------------
// Discovery and "mine"
// ---------------------------------------------------------------------------

export async function discover(db: Db, query: DiscoverQuery): Promise<DiscoverResult> {
  const like = query.q ? `%${query.q.replace(/[%_]/g, '')}%` : null;
  let groups = groupCardQuery(db).where('g.visibility', '=', 'public');
  if (like)
    groups = groups.where((eb) =>
      eb.or([
        eb('g.name', 'ilike', like),
        eb('g.description', 'ilike', like),
        eb('g.locality', 'ilike', like),
      ]),
    );
  if (query.locality) groups = groups.where('g.locality', 'ilike', `%${query.locality}%`);
  if (query.interest)
    groups = groups.where((eb) =>
      eb.exists(
        eb
          .selectFrom('community.group_interests as gi')
          .select('gi.group_id')
          .whereRef('gi.group_id', '=', 'g.id')
          .where('gi.interest_id', '=', query.interest as string),
      ),
    );
  const groupRows = await groups.orderBy('g.name').limit(30).execute();

  let acts = activityQuery(db)
    .where('a.visibility', '=', 'public')
    .where('g.visibility', '=', 'public')
    .where('a.state', '=', 'scheduled')
    .where('a.ends_at', '>=', new Date());
  if (like)
    acts = acts.where((eb) =>
      eb.or([
        eb('a.title', 'ilike', like),
        eb('g.name', 'ilike', like),
        eb('a.location_name', 'ilike', like),
      ]),
    );
  if (query.locality)
    acts = acts.where((eb) =>
      eb.or([
        eb('g.locality', 'ilike', `%${query.locality}%`),
        eb('a.location_name', 'ilike', `%${query.locality}%`),
      ]),
    );
  if (query.interest)
    acts = acts.where((eb) =>
      eb.or([
        eb('a.interest_id', '=', query.interest as string),
        eb.exists(
          eb
            .selectFrom('community.group_interests as gi')
            .select('gi.group_id')
            .whereRef('gi.group_id', '=', 'g.id')
            .where('gi.interest_id', '=', query.interest as string),
        ),
      ]),
    );
  const actRows = (await acts.orderBy('a.starts_at').limit(30).execute()) as ActivityRow[];
  const c = await counts(db, actRows);
  const localities = new Map(groupRows.map((g) => [g.id, g.locality]));
  const activities: PublicActivityCard[] = actRows.map((r) => ({
    id: r.id,
    title: r.title,
    groupId: r.group_id,
    groupName: r.group_name,
    interest:
      r.interest_id && r.interest_name
        ? { id: r.interest_id, name: r.interest_name, sortOrder: r.interest_sort ?? 100 }
        : null,
    locality: localities.get(r.group_id) ?? null,
    locationName: r.location_name,
    venueName: r.venue_name,
    startsAt: toIso(r.starts_at),
    endsAt: toIso(r.ends_at),
    goingCount: c.get(r.id)?.going ?? 0,
    capacity: r.capacity,
    poweredByRally: !!r.rally_occurrence_id,
  }));
  return {
    interests: await listInterests(db),
    groups: await toGroupCards(db, groupRows),
    activities,
  };
}

export async function myCommunity(db: Db, actor: Actor): Promise<MyCommunity> {
  const pids = (
    await db
      .selectFrom('identity.participants')
      .select('id')
      .where('user_profile_id', '=', actor.profileId)
      .where('archived_at', 'is', null)
      .execute()
  ).map((p) => p.id);
  const memberOf = pids.length
    ? (
        await db
          .selectFrom('community.group_members')
          .select('group_id')
          .where('participant_id', 'in', pids)
          .where('status', '=', 'active')
          .execute()
      ).map((g) => g.group_id)
    : [];
  // Groups I belong to, plus every group in clubs I organise.
  const orgIds = [...actor.memberships.entries()]
    .filter(([id, m]) => m.status === 'active' && canOrgAction(actor, id, 'groups.manage'))
    .map(([id]) => id);
  let q = groupCardQuery(db);
  if (memberOf.length || orgIds.length)
    q = q.where((eb) =>
      eb.or([
        ...(memberOf.length ? [eb('g.id', 'in', memberOf)] : []),
        ...(orgIds.length ? [eb('g.organisation_id', 'in', orgIds)] : []),
      ]),
    );
  else return { groups: [], upcoming: [] };
  const rows = await q.orderBy('g.name').execute();
  const cards = await toGroupCards(db, rows);
  const groups: MyGroup[] = cards.map((g) => ({
    ...g,
    role: canOrgAction(actor, g.organisationId, 'groups.manage') ? 'organiser' : 'member',
  }));
  const groupIds = groups.map((g) => g.id);
  const upcomingRows = groupIds.length
    ? ((await activityQuery(db)
        .where('a.group_id', 'in', groupIds)
        .where('a.state', '=', 'scheduled')
        .where('a.ends_at', '>=', new Date())
        .orderBy('a.starts_at')
        .limit(20)
        .execute()) as ActivityRow[])
    : [];
  return { groups, upcoming: await toActivities(db, actor, upcomingRows) };
}
