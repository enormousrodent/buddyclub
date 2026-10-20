import type {
  CreateGroupBody,
  Group,
  GroupDetail,
  GroupMember,
  UpdateGroupBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { isPgCode, PG_FOREIGN_KEY_VIOLATION } from '../../platform/pg-errors.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';

interface GroupRow {
  id: string;
  organisation_id: string;
  sport_id: string | null;
  name: string;
  description: string | null;
  archived_at: Date | null;
  version: number;
  created_at: Date;
  member_count: string | number;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    sportId: row.sport_id,
    name: row.name,
    description: row.description,
    archivedAt: toIsoOrNull(row.archived_at),
    memberCount: Number(row.member_count),
    version: row.version,
    createdAt: toIso(row.created_at),
  };
}

function groupQuery(db: Db) {
  return db.selectFrom('community.groups as g').select((eb) => [
    'g.id',
    'g.organisation_id',
    'g.sport_id',
    'g.name',
    'g.description',
    'g.archived_at',
    'g.version',
    'g.created_at',
    eb
      .selectFrom('community.group_members as gm')
      .select((e2) => e2.fn.countAll<string>().as('n'))
      .whereRef('gm.group_id', '=', 'g.id')
      .where('gm.status', '=', 'active')
      .as('member_count'),
  ]);
}

async function loadGroupRow(db: Db, groupId: string): Promise<GroupRow> {
  const row = await groupQuery(db).where('g.id', '=', groupId).executeTakeFirst();
  if (!row) throw notFound('Group not found');
  return { ...row, member_count: row.member_count ?? 0 };
}

/** Loads the group and checks membership of its organisation. */
async function loadGroupFor(
  db: Db,
  actor: Actor,
  groupId: string,
  action?: 'groups.manage',
): Promise<GroupRow> {
  const row = await loadGroupRow(db, groupId);
  if (action) assertOrgAction(actor, row.organisation_id, action);
  else assertOrgMember(actor, row.organisation_id);
  return row;
}

export async function createGroup(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateGroupBody,
  ctx: CommandContext,
): Promise<Group> {
  assertOrgAction(actor, organisationId, 'groups.manage');
  const id = await db.transaction().execute(async (trx) => {
    let inserted;
    try {
      inserted = await trx
        .insertInto('community.groups')
        .values({
          organisation_id: organisationId,
          sport_id: body.sportId ?? null,
          name: body.name,
          description: body.description ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Unknown sport', undefined, [
          { path: 'body/sportId', message: `no sport with id ${body.sportId}` },
        ]);
      }
      throw error;
    }
    await recordAudit(trx, {
      entityType: 'group',
      entityId: inserted.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, name: body.name, sportId: body.sportId ?? null },
    });
    return inserted.id;
  });
  return toGroup(await loadGroupRow(db, id));
}

export async function listGroups(db: Db, actor: Actor, organisationId: string): Promise<Group[]> {
  assertOrgMember(actor, organisationId);
  const rows = await groupQuery(db)
    .where('g.organisation_id', '=', organisationId)
    .where('g.archived_at', 'is', null)
    .orderBy('g.name')
    .execute();
  return rows.map((r) => toGroup({ ...r, member_count: r.member_count ?? 0 }));
}

export async function getGroup(db: Db, actor: Actor, groupId: string): Promise<GroupDetail> {
  const row = await loadGroupFor(db, actor, groupId);
  const members = await db
    .selectFrom('community.group_members as gm')
    .innerJoin('identity.participants as p', 'p.id', 'gm.participant_id')
    .select(['p.id', 'p.display_name', 'p.source', 'gm.status', 'gm.joined_at'])
    .where('gm.group_id', '=', groupId)
    .where('gm.status', '=', 'active')
    .orderBy('p.display_name')
    .execute();
  const memberList: GroupMember[] = members.map((m) => ({
    participantId: m.id,
    displayName: m.display_name,
    source: m.source,
    status: m.status,
    joinedAt: toIso(m.joined_at),
  }));
  return { ...toGroup(row), members: memberList };
}

export async function updateGroup(
  db: Db,
  actor: Actor,
  groupId: string,
  body: UpdateGroupBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Group> {
  const before = await loadGroupFor(db, actor, groupId, 'groups.manage');
  if (expectedVersion !== null && before.version !== expectedVersion)
    throw versionConflict('Group');
  await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable('community.groups')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        version: before.version + 1,
      })
      .where('id', '=', groupId)
      .where('version', '=', before.version)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw versionConflict('Group');
    await recordAudit(trx, {
      entityType: 'group',
      entityId: groupId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { name: before.name, description: before.description },
      after: {
        name: body.name ?? before.name,
        description: body.description ?? before.description,
      },
    });
  });
  return toGroup(await loadGroupRow(db, groupId));
}

export async function addGroupMember(
  db: Db,
  actor: Actor,
  groupId: string,
  participantId: string,
  ctx: CommandContext,
): Promise<GroupDetail> {
  const group = await loadGroupFor(db, actor, groupId, 'groups.manage');
  await db.transaction().execute(async (trx) => {
    const participant = await trx
      .selectFrom('identity.participants')
      .select(['id', 'archived_at'])
      .where('id', '=', participantId)
      .where('organisation_id', '=', group.organisation_id)
      .executeTakeFirst();
    if (!participant || participant.archived_at)
      throw notFound('Participant not found in this organisation');
    await trx
      .insertInto('community.group_members')
      .values({ group_id: groupId, participant_id: participantId })
      .onConflict((oc) =>
        oc
          .columns(['group_id', 'participant_id'])
          .doUpdateSet({ status: 'active', left_at: null, joined_at: new Date() }),
      )
      .execute();
    await recordAudit(trx, {
      entityType: 'group',
      entityId: groupId,
      operation: 'add_member',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { participantId },
    });
  });
  return getGroup(db, actor, groupId);
}

export async function removeGroupMember(
  db: Db,
  actor: Actor,
  groupId: string,
  participantId: string,
  ctx: CommandContext,
): Promise<void> {
  await loadGroupFor(db, actor, groupId, 'groups.manage');
  await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable('community.group_members')
      .set({ status: 'removed', left_at: new Date() })
      .where('group_id', '=', groupId)
      .where('participant_id', '=', participantId)
      .where('status', '=', 'active')
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Participant is not an active member of this group');
    await recordAudit(trx, {
      entityType: 'group',
      entityId: groupId,
      operation: 'remove_member',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { participantId },
    });
  });
}
