import type {
  Court,
  CreateCourtBody,
  CreateVenueBody,
  UpdateCourtBody,
  UpdateVenueBody,
  Venue,
  VenueDetail,
} from '@buddyclub/shared-types';
import { AddressSchema } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { isPgCode, PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION } from '../../platform/pg-errors.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';

interface VenueRow {
  id: string;
  organisation_id: string;
  name: string;
  timezone: string;
  address_json: Record<string, unknown>;
  notes: string | null;
  archived_at: Date | null;
  version: number;
  created_at: Date;
}

const VENUE_COLUMNS = [
  'id',
  'organisation_id',
  'name',
  'timezone',
  'address_json',
  'notes',
  'archived_at',
  'version',
  'created_at',
] as const;

function toVenue(row: VenueRow): Venue {
  const address = AddressSchema.safeParse(row.address_json);
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    timezone: row.timezone,
    address: address.success ? address.data : {},
    notes: row.notes,
    archivedAt: toIsoOrNull(row.archived_at),
    version: row.version,
    createdAt: toIso(row.created_at),
  };
}

interface CourtRow {
  id: string;
  venue_id: string;
  code: string;
  label: string | null;
  sport_ids: string[];
  zone: string | null;
  active: boolean;
  sort_order: number;
}

const COURT_COLUMNS = [
  'id',
  'venue_id',
  'code',
  'label',
  'sport_ids',
  'zone',
  'active',
  'sort_order',
] as const;

function toCourt(row: CourtRow): Court {
  return {
    id: row.id,
    venueId: row.venue_id,
    code: row.code,
    label: row.label,
    sportIds: row.sport_ids,
    zone: row.zone,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

function invalidTimezone(timezone: string): AppError {
  return new AppError(400, 'VALIDATION_FAILED', 'Unknown timezone', undefined, [
    { path: 'body/timezone', message: `"${timezone}" is not an IANA timezone name` },
  ]);
}

async function loadVenue(db: Db, venueId: string): Promise<VenueRow> {
  const row = await db
    .selectFrom('facilities.venues')
    .select(VENUE_COLUMNS)
    .where('id', '=', venueId)
    .executeTakeFirst();
  if (!row) throw notFound('Venue not found');
  return row;
}

export async function createVenue(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateVenueBody,
  ctx: CommandContext,
): Promise<Venue> {
  assertOrgAction(actor, organisationId, 'facilities.manage');
  return db.transaction().execute(async (trx) => {
    let row: VenueRow;
    try {
      row = await trx
        .insertInto('facilities.venues')
        .values({
          organisation_id: organisationId,
          name: body.name,
          timezone: body.timezone,
          address_json: JSON.stringify(body.address ?? {}),
          notes: body.notes ?? null,
        })
        .returning(VENUE_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_CHECK_VIOLATION)) throw invalidTimezone(body.timezone);
      throw error;
    }
    await recordAudit(trx, {
      entityType: 'venue',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, name: row.name, timezone: row.timezone },
    });
    return toVenue(row);
  });
}

export async function listVenues(db: Db, actor: Actor, organisationId: string): Promise<Venue[]> {
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('facilities.venues')
    .select(VENUE_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .orderBy('name')
    .execute();
  return rows.map(toVenue);
}

export async function getVenue(db: Db, actor: Actor, venueId: string): Promise<VenueDetail> {
  const row = await loadVenue(db, venueId);
  assertOrgMember(actor, row.organisation_id);
  const courts = await db
    .selectFrom('facilities.courts')
    .select(COURT_COLUMNS)
    .where('venue_id', '=', venueId)
    .orderBy('sort_order')
    .orderBy('code')
    .execute();
  return { ...toVenue(row), courts: courts.map(toCourt) };
}

export async function updateVenue(
  db: Db,
  actor: Actor,
  venueId: string,
  body: UpdateVenueBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Venue> {
  const before = await loadVenue(db, venueId);
  assertOrgAction(actor, before.organisation_id, 'facilities.manage');
  if (expectedVersion !== null && before.version !== expectedVersion)
    throw versionConflict('Venue');
  return db.transaction().execute(async (trx) => {
    let row: VenueRow | undefined;
    try {
      row = await trx
        .updateTable('facilities.venues')
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
          ...(body.address !== undefined ? { address_json: JSON.stringify(body.address) } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          version: before.version + 1,
        })
        .where('id', '=', venueId)
        .where('version', '=', before.version)
        .returning(VENUE_COLUMNS)
        .executeTakeFirst();
    } catch (error) {
      if (isPgCode(error, PG_CHECK_VIOLATION) && body.timezone)
        throw invalidTimezone(body.timezone);
      throw error;
    }
    if (!row) throw versionConflict('Venue');
    await recordAudit(trx, {
      entityType: 'venue',
      entityId: venueId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { name: before.name, timezone: before.timezone },
      after: { name: row.name, timezone: row.timezone },
    });
    return toVenue(row);
  });
}

export async function createCourt(
  db: Db,
  actor: Actor,
  venueId: string,
  body: CreateCourtBody,
  ctx: CommandContext,
): Promise<Court> {
  const venue = await loadVenue(db, venueId);
  assertOrgAction(actor, venue.organisation_id, 'facilities.manage');
  return db.transaction().execute(async (trx) => {
    let row: CourtRow;
    try {
      row = await trx
        .insertInto('facilities.courts')
        .values({
          venue_id: venueId,
          code: body.code,
          label: body.label ?? null,
          sport_ids: body.sportIds,
          zone: body.zone ?? null,
          ...(body.sortOrder !== undefined ? { sort_order: body.sortOrder } : {}),
        })
        .returning(COURT_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_UNIQUE_VIOLATION)) {
        throw new AppError(
          409,
          'CONFLICT',
          'Court code already exists at this venue',
          `Code "${body.code}" is in use`,
        );
      }
      throw error;
    }
    await recordAudit(trx, {
      entityType: 'court',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { venueId, code: row.code },
    });
    return toCourt(row);
  });
}

export async function updateCourt(
  db: Db,
  actor: Actor,
  courtId: string,
  body: UpdateCourtBody,
  ctx: CommandContext,
): Promise<Court> {
  const current = await db
    .selectFrom('facilities.courts as c')
    .innerJoin('facilities.venues as v', 'v.id', 'c.venue_id')
    .select(['c.id', 'c.code', 'c.active', 'v.organisation_id'])
    .where('c.id', '=', courtId)
    .executeTakeFirst();
  if (!current) throw notFound('Court not found');
  assertOrgAction(actor, current.organisation_id, 'facilities.manage');
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('facilities.courts')
      .set({
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.sportIds !== undefined ? { sport_ids: body.sportIds } : {}),
        ...(body.zone !== undefined ? { zone: body.zone } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.sortOrder !== undefined ? { sort_order: body.sortOrder } : {}),
      })
      .where('id', '=', courtId)
      .returning(COURT_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'court',
      entityId: courtId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { active: current.active },
      after: { active: row.active, label: row.label, zone: row.zone },
    });
    return toCourt(row);
  });
}
