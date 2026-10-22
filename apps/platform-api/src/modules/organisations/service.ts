import { GRANTABLE_ROLES } from '@buddyclub/auth';
import type {
  CreateInvitationBody,
  CreateOrganisationBody,
  Invitation,
  InvitationCreated,
  InvitationPreview,
  Member,
  Organisation,
  RedeemInvitationResponse,
  Role,
  UpdateMemberBody,
  UpdateOrganisationBody,
} from '@buddyclub/shared-types';
import type { Transaction } from 'kysely';
import type { Database, Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { isPgCode, PG_UNIQUE_VIOLATION } from '../../platform/pg-errors.js';
import {
  generateOpaqueToken,
  hashToken,
  slugify,
  toIso,
  toIsoOrNull,
} from '../../platform/tokens.js';
import { AppError, forbidden, notFound } from '../../problems.js';

export interface CommandContext {
  correlationId: string;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  kind: 'club' | 'personal';
  version: number;
  created_at: Date;
}

function toOrganisation(row: OrgRow, myRole: Role | null): Organisation {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    version: row.version,
    createdAt: toIso(row.created_at),
    myRole,
  };
}

const ORG_COLUMNS = ['id', 'name', 'slug', 'kind', 'version', 'created_at'] as const;

async function countActiveAdmins(db: Db | Transaction<Database>, organisationId: string) {
  const row = await db
    .selectFrom('community.memberships')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('organisation_id', '=', organisationId)
    .where('role', '=', 'org_admin')
    .where('status', '=', 'active')
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/** Ensures the account has a participant record in the organisation (one per org, ADR-003). */
export async function ensureOwnParticipant(
  db: Db | Transaction<Database>,
  organisationId: string,
  profileId: string,
  displayName: string,
): Promise<void> {
  const inserted = await db
    .insertInto('identity.participants')
    .values({
      organisation_id: organisationId,
      user_profile_id: profileId,
      display_name: displayName,
      source: 'registered',
      declared_attributes: '{}',
      created_by_profile_id: profileId,
    })
    .onConflict((oc) => oc.doNothing())
    .returning('id')
    .executeTakeFirst();
  if (inserted) {
    const seed = await seedRatingFor(db, profileId);
    if (seed !== null)
      await db
        .updateTable('identity.participants')
        .set({ skill_rating: seed })
        .where('id', '=', inserted.id)
        .execute();
  }
}

/**
 * Addendum 1.3 step 4: a new club record starts from the person's own view of their level, so
 * an organiser has something to balance with before they have watched anyone play. The
 * organiser's 0 to 100 scale; the strongest racket-sport level wins when there are several.
 * Nothing is overwritten later: the organiser's edits are theirs.
 */
const SKILL_SEED: Record<string, number> = {
  just_starting: 20,
  getting_going: 35,
  comfortable: 50,
  strong: 65,
  expert: 80,
};

async function seedRatingFor(
  db: Db | Transaction<Database>,
  profileId: string,
): Promise<number | null> {
  const rows = await db
    .selectFrom('identity.profile_activities')
    .select('level')
    .where('profile_id', '=', profileId)
    .where('interest_id', '=', 'racket_sports')
    .where('level', 'is not', null)
    .execute();
  const seeds = rows
    .map((r) => SKILL_SEED[r.level ?? ''])
    .filter((n): n is number => n !== undefined);
  return seeds.length ? Math.max(...seeds) : null;
}

export async function createOrganisation(
  db: Db,
  actor: Actor,
  body: CreateOrganisationBody,
  ctx: CommandContext,
): Promise<Organisation> {
  const slug = body.slug ?? slugify(body.name);
  if (slug.length < 3) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Slug too short',
      'Provide a slug of at least 3 characters',
      [{ path: 'body/slug', message: 'at least 3 characters' }],
    );
  }
  return db.transaction().execute(async (trx) => {
    let row: OrgRow;
    try {
      row = await trx
        .insertInto('community.organisations')
        .values({ name: body.name, slug, owner_profile_id: actor.profileId })
        .returning(ORG_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_UNIQUE_VIOLATION)) {
        throw new AppError(
          409,
          'CONFLICT',
          'Slug already taken',
          `"${slug}" is used by another organisation`,
        );
      }
      throw error;
    }
    await trx
      .insertInto('community.memberships')
      .values({ organisation_id: row.id, user_profile_id: actor.profileId, role: 'org_admin' })
      .execute();
    await ensureOwnParticipant(trx, row.id, actor.profileId, actor.displayName);
    await recordAudit(trx, {
      entityType: 'organisation',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { name: row.name, slug: row.slug },
    });
    return toOrganisation(row, 'org_admin');
  });
}

export async function getOrganisation(
  db: Db,
  actor: Actor,
  organisationId: string,
): Promise<Organisation> {
  const role = assertOrgMember(actor, organisationId);
  const row = await db
    .selectFrom('community.organisations')
    .select(ORG_COLUMNS)
    .where('id', '=', organisationId)
    .executeTakeFirst();
  if (!row) throw notFound('Organisation not found');
  return toOrganisation(row, role);
}

export async function updateOrganisation(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: UpdateOrganisationBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Organisation> {
  const role = assertOrgAction(actor, organisationId, 'organisation.manage');
  return db.transaction().execute(async (trx) => {
    const before = await trx
      .selectFrom('community.organisations')
      .select(ORG_COLUMNS)
      .where('id', '=', organisationId)
      .forUpdate()
      .executeTakeFirst();
    if (!before) throw notFound('Organisation not found');
    if (expectedVersion !== null && before.version !== expectedVersion)
      throw versionConflict('Organisation');

    const row = await trx
      .updateTable('community.organisations')
      .set({ ...(body.name !== undefined ? { name: body.name } : {}), version: before.version + 1 })
      .where('id', '=', organisationId)
      .returning(ORG_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'organisation',
      entityId: row.id,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { name: before.name },
      after: { name: row.name },
    });
    return toOrganisation(row, role);
  });
}

export async function listMembers(db: Db, actor: Actor, organisationId: string): Promise<Member[]> {
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('community.memberships as m')
    .innerJoin('identity.user_profiles as p', 'p.id', 'm.user_profile_id')
    .select(['p.id', 'p.display_name', 'p.avatar_url', 'm.role', 'm.status', 'm.created_at'])
    .where('m.organisation_id', '=', organisationId)
    .where('m.status', '!=', 'left')
    .orderBy('p.display_name')
    .execute();
  return rows.map((r) => ({
    profileId: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    status: r.status,
    joinedAt: toIso(r.created_at),
  }));
}

export async function updateMember(
  db: Db,
  actor: Actor,
  organisationId: string,
  profileId: string,
  body: UpdateMemberBody,
  ctx: CommandContext,
): Promise<Member> {
  assertOrgAction(actor, organisationId, 'members.manage');
  if (body.role && !GRANTABLE_ROLES.includes(body.role)) {
    throw forbidden(`Role ${body.role} cannot be granted`);
  }
  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('community.memberships')
      .select(['id', 'role', 'status'])
      .where('organisation_id', '=', organisationId)
      .where('user_profile_id', '=', profileId)
      .forUpdate()
      .executeTakeFirst();
    if (!current || current.status === 'left') throw notFound('Member not found');

    const nextRole = body.role ?? current.role;
    const nextStatus = body.status ?? current.status;
    const demotesAdmin =
      current.role === 'org_admin' &&
      current.status === 'active' &&
      (nextRole !== 'org_admin' || nextStatus !== 'active');
    if (demotesAdmin && (await countActiveAdmins(trx, organisationId)) <= 1) {
      throw new AppError(
        409,
        'CONFLICT',
        'Cannot remove the last admin',
        'Promote another member first',
      );
    }

    await trx
      .updateTable('community.memberships')
      .set({ role: nextRole, status: nextStatus })
      .where('id', '=', current.id)
      .execute();
    await recordAudit(trx, {
      entityType: 'membership',
      entityId: current.id,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { role: current.role, status: current.status },
      after: { role: nextRole, status: nextStatus },
    });
  });
  const members = await listMembers(db, actor, organisationId);
  const member = members.find((m) => m.profileId === profileId);
  if (!member) throw notFound('Member not found');
  return member;
}

export async function removeMember(
  db: Db,
  actor: Actor,
  organisationId: string,
  profileId: string,
  ctx: CommandContext,
): Promise<void> {
  if (profileId !== actor.profileId) assertOrgAction(actor, organisationId, 'members.manage');
  else assertOrgMember(actor, organisationId);
  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('community.memberships')
      .select(['id', 'role', 'status'])
      .where('organisation_id', '=', organisationId)
      .where('user_profile_id', '=', profileId)
      .forUpdate()
      .executeTakeFirst();
    if (!current || current.status === 'left') throw notFound('Member not found');
    if (
      current.role === 'org_admin' &&
      current.status === 'active' &&
      (await countActiveAdmins(trx, organisationId)) <= 1
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        'Cannot remove the last admin',
        'Promote another member first',
      );
    }
    await trx
      .updateTable('community.memberships')
      .set({ status: 'left' })
      .where('id', '=', current.id)
      .execute();
    await recordAudit(trx, {
      entityType: 'membership',
      entityId: current.id,
      operation: 'leave',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { role: current.role, status: current.status },
      after: { status: 'left' },
    });
  });
}

interface InvitationRow {
  id: string;
  scope_id: string;
  grants_role: Role | null;
  expires_at: Date;
  max_uses: number;
  use_count: number;
  revoked_at: Date | null;
  created_at: Date;
}

const INVITATION_COLUMNS = [
  'id',
  'scope_id',
  'grants_role',
  'expires_at',
  'max_uses',
  'use_count',
  'revoked_at',
  'created_at',
] as const;

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    organisationId: row.scope_id,
    role: row.grants_role ?? 'participant',
    expiresAt: toIso(row.expires_at),
    maxUses: row.max_uses,
    useCount: row.use_count,
    revokedAt: toIsoOrNull(row.revoked_at),
    createdAt: toIso(row.created_at),
  };
}

function invitationRedeemable(row: InvitationRow): boolean {
  return !row.revoked_at && row.expires_at.getTime() > Date.now() && row.use_count < row.max_uses;
}

export async function createInvitation(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateInvitationBody,
  ctx: CommandContext,
): Promise<InvitationCreated> {
  const role = assertOrgAction(actor, organisationId, 'members.invite');
  if (!GRANTABLE_ROLES.includes(body.role)) throw forbidden(`Role ${body.role} cannot be granted`);
  const kind = await db
    .selectFrom('community.organisations')
    .select('kind')
    .where('id', '=', organisationId)
    .executeTakeFirst();
  if (kind?.kind === 'personal')
    throw forbidden('A personal workspace has no members to invite; create a club instead');
  if (body.role === 'org_admin' && role !== 'org_admin' && role !== 'platform_admin') {
    throw forbidden('Only an org admin can invite another org admin');
  }
  const token = generateOpaqueToken();
  const row = await db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('platform.invitation_links')
      .values({
        scope_type: 'organisation',
        scope_id: organisationId,
        token_hash: hashToken(token),
        permissions: '[]',
        grants_role: body.role,
        expires_at: new Date(Date.now() + body.expiresInHours * 3600 * 1000),
        max_uses: body.maxUses,
        created_by_profile_id: actor.profileId,
      })
      .returning(INVITATION_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'invitation',
      entityId: inserted.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, role: body.role, maxUses: body.maxUses },
    });
    return inserted;
  });
  return { ...toInvitation(row), token };
}

export async function listInvitations(
  db: Db,
  actor: Actor,
  organisationId: string,
): Promise<Invitation[]> {
  assertOrgAction(actor, organisationId, 'members.invite');
  const rows = await db
    .selectFrom('platform.invitation_links')
    .select(INVITATION_COLUMNS)
    .where('scope_type', '=', 'organisation')
    .where('scope_id', '=', organisationId)
    .orderBy('created_at', 'desc')
    .execute();
  return rows.map(toInvitation);
}

export async function revokeInvitation(
  db: Db,
  actor: Actor,
  organisationId: string,
  invitationId: string,
  ctx: CommandContext,
): Promise<void> {
  assertOrgAction(actor, organisationId, 'members.invite');
  await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable('platform.invitation_links')
      .set({ revoked_at: new Date() })
      .where('id', '=', invitationId)
      .where('scope_type', '=', 'organisation')
      .where('scope_id', '=', organisationId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Invitation not found or already revoked');
    await recordAudit(trx, {
      entityType: 'invitation',
      entityId: invitationId,
      operation: 'revoke',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
    });
  });
}

export async function previewInvitation(db: Db, token: string): Promise<InvitationPreview> {
  const row = await db
    .selectFrom('platform.invitation_links as i')
    .innerJoin('community.organisations as o', 'o.id', 'i.scope_id')
    .select([
      'i.id',
      'i.scope_id',
      'i.grants_role',
      'i.expires_at',
      'i.max_uses',
      'i.use_count',
      'i.revoked_at',
      'i.created_at',
      'o.name as organisation_name',
    ])
    .where('i.token_hash', '=', hashToken(token))
    .where('i.scope_type', '=', 'organisation')
    .executeTakeFirst();
  if (!row) throw notFound('Invitation not found');
  return {
    organisationName: row.organisation_name,
    role: row.grants_role ?? 'participant',
    expiresAt: toIso(row.expires_at),
    redeemable: invitationRedeemable(row),
  };
}

export async function redeemInvitation(
  db: Db,
  actor: Actor,
  token: string,
  ctx: CommandContext,
): Promise<RedeemInvitationResponse> {
  return db.transaction().execute(async (trx) => {
    const invitation = await trx
      .selectFrom('platform.invitation_links')
      .select(INVITATION_COLUMNS)
      .where('token_hash', '=', hashToken(token))
      .where('scope_type', '=', 'organisation')
      .forUpdate()
      .executeTakeFirst();
    if (!invitation) throw notFound('Invitation not found');
    const organisation = await trx
      .selectFrom('community.organisations')
      .select(['id', 'name'])
      .where('id', '=', invitation.scope_id)
      .executeTakeFirstOrThrow();
    const role = invitation.grants_role ?? 'participant';

    const priorRedemption = await trx
      .selectFrom('platform.invitation_redemptions')
      .select('id')
      .where('invitation_id', '=', invitation.id)
      .where('user_profile_id', '=', actor.profileId)
      .executeTakeFirst();
    const membership = await trx
      .selectFrom('community.memberships')
      .select(['id', 'role', 'status'])
      .where('organisation_id', '=', organisation.id)
      .where('user_profile_id', '=', actor.profileId)
      .forUpdate()
      .executeTakeFirst();

    if (priorRedemption || (membership && membership.status === 'active')) {
      return {
        organisationId: organisation.id,
        organisationName: organisation.name,
        role: membership?.role ?? role,
        alreadyMember: true,
      };
    }
    if (!invitationRedeemable(invitation)) {
      throw new AppError(
        409,
        'CONFLICT',
        'Invitation cannot be redeemed',
        'It has expired, been revoked or is fully used',
      );
    }

    if (membership) {
      await trx
        .updateTable('community.memberships')
        .set({ role, status: 'active' })
        .where('id', '=', membership.id)
        .execute();
    } else {
      await trx
        .insertInto('community.memberships')
        .values({ organisation_id: organisation.id, user_profile_id: actor.profileId, role })
        .execute();
    }
    await trx
      .insertInto('platform.invitation_redemptions')
      .values({ invitation_id: invitation.id, user_profile_id: actor.profileId })
      .execute();
    await trx
      .updateTable('platform.invitation_links')
      .set((eb) => ({ use_count: eb('use_count', '+', 1) }))
      .where('id', '=', invitation.id)
      .execute();
    await ensureOwnParticipant(trx, organisation.id, actor.profileId, actor.displayName);
    await recordAudit(trx, {
      entityType: 'membership',
      entityId: organisation.id,
      operation: 'join_via_invitation',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { invitationId: invitation.id, role },
    });
    return {
      organisationId: organisation.id,
      organisationName: organisation.name,
      role,
      alreadyMember: false,
    };
  });
}

/**
 * The caller's personal Rally workspace: an organisation of kind `personal`, created on first use
 * so sessions can be run with no club (ADR-017). Idempotent.
 */
export async function ensurePersonalWorkspace(
  db: Db,
  actor: Actor,
  ctx: CommandContext,
): Promise<Organisation> {
  const existing = await db
    .selectFrom('community.organisations')
    .select(ORG_COLUMNS)
    .where('owner_profile_id', '=', actor.profileId)
    .where('kind', '=', 'personal')
    .executeTakeFirst();
  if (existing) {
    await db
      .insertInto('community.memberships')
      .values({ organisation_id: existing.id, user_profile_id: actor.profileId, role: 'org_admin' })
      .onConflict((oc) => oc.doNothing())
      .execute();
    return toOrganisation(existing, 'org_admin');
  }
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('community.organisations')
      .values({
        name: `${actor.displayName}'s sessions`,
        slug: `me-${actor.profileId.replace(/-/g, '').slice(0, 12)}`,
        owner_profile_id: actor.profileId,
        kind: 'personal',
      })
      .returning(ORG_COLUMNS)
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('community.memberships')
      .values({ organisation_id: row.id, user_profile_id: actor.profileId, role: 'org_admin' })
      .execute();
    await ensureOwnParticipant(trx, row.id, actor.profileId, actor.displayName);
    await recordAudit(trx, {
      entityType: 'organisation',
      entityId: row.id,
      operation: 'create_personal_workspace',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { kind: 'personal' },
    });
    return toOrganisation(row, 'org_admin');
  });
}
