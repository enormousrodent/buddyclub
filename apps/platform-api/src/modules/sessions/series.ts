import {
  usualFormatForSport,
  type CreateSessionSeriesBody,
  type SessionSeries,
  type UpdateSessionSeriesBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { isPgCode, PG_FOREIGN_KEY_VIOLATION } from '../../platform/pg-errors.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { parseSocialRules } from '../rulesets/service.js';
import { loadSeries, SERIES_COLUMNS, toSeries } from './common.js';
import { timeToDb } from './schedule.js';

async function assertVenueInOrg(db: Db, organisationId: string, venueId: string): Promise<void> {
  const v = await db
    .selectFrom('facilities.venues')
    .select('id')
    .where('id', '=', venueId)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!v)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown venue', undefined, [
      { path: 'body/venueId', message: 'not a venue of this organisation' },
    ]);
}

export async function createSeries(
  db: Db,
  actor: Actor,
  organisationId: string,
  body: CreateSessionSeriesBody,
  ctx: CommandContext,
): Promise<SessionSeries> {
  assertOrgAction(actor, organisationId, 'session.manage');
  if (body.venueId) await assertVenueInOrg(db, organisationId, body.venueId);
  const format = body.format ?? usualFormatForSport(body.sportId);
  const base = parseSocialRules(body.rules ?? {});
  // Always store default rules so the usual format is explicit on the session.
  const rules = { ...base, rotation: { ...base.rotation, format } };
  if (body.rulesetId) {
    const rs = await db
      .selectFrom('platform.rulesets')
      .select(['id', 'kind'])
      .where('id', '=', body.rulesetId)
      .where('organisation_id', '=', organisationId)
      .executeTakeFirst();
    if (!rs || rs.kind !== 'social_session') {
      throw new AppError(400, 'VALIDATION_FAILED', 'Unknown ruleset', undefined, [
        { path: 'body/rulesetId', message: 'not a social-session ruleset of this organisation' },
      ]);
    }
  }
  const org = await db
    .selectFrom('community.organisations')
    .select('kind')
    .where('id', '=', organisationId)
    .executeTakeFirst();
  const ownerScope =
    org?.kind === 'personal'
      ? 'personal'
      : body.groupId
        ? 'buddy_group'
        : (body.ownerScope ?? 'organisation');
  return db.transaction().execute(async (trx) => {
    let row;
    try {
      row = await trx
        .insertInto('activities.session_series')
        .values({
          organisation_id: organisationId,
          group_id: body.groupId ?? null,
          owner_scope: ownerScope,
          buddy_group_id: body.groupId ?? null,
          venue_id: body.venueId ?? null,
          sport_id: body.sportId,
          name: body.name,
          description: body.description ?? null,
          recurrence_rrule: null,
          default_ruleset_id: body.rulesetId ?? null,
          default_rules_json: JSON.stringify(rules),
          default_duration_minutes: body.defaultDurationMinutes,
          default_round_minutes: body.defaultRoundMinutes,
          schedule_weekday: body.schedule?.weekday ?? null,
          schedule_time: body.schedule ? timeToDb(body.schedule.time) : null,
          schedule_timezone: body.schedule?.timezone ?? null,
          check_in_window_minutes: body.checkInWindowMinutes ?? 10,
          created_by_profile_id: actor.profileId,
        })
        .returning(SERIES_COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isPgCode(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Unknown sport or group', undefined, [
          { path: 'body/sportId', message: 'check sportId and groupId' },
        ]);
      }
      throw error;
    }
    await recordAudit(trx, {
      entityType: 'session_series',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { organisationId, name: body.name, sportId: body.sportId },
    });
    return toSeries(row, actor);
  });
}

export async function listSeries(
  db: Db,
  actor: Actor,
  organisationId: string,
): Promise<SessionSeries[]> {
  assertOrgMember(actor, organisationId);
  const rows = await db
    .selectFrom('activities.session_series')
    .select(SERIES_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .where('archived_at', 'is', null)
    .orderBy('name')
    .execute();
  return rows.map((row) => toSeries(row, actor));
}

export async function getSeries(db: Db, actor: Actor, seriesId: string): Promise<SessionSeries> {
  const row = await loadSeries(db, seriesId);
  assertOrgMember(actor, row.organisation_id);
  return toSeries(row, actor);
}

export async function updateSeries(
  db: Db,
  actor: Actor,
  seriesId: string,
  body: UpdateSessionSeriesBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<SessionSeries> {
  const before = await loadSeries(db, seriesId);
  assertOrgAction(actor, before.organisation_id, 'session.manage');
  if (expectedVersion !== null && before.version !== expectedVersion)
    throw versionConflict('Session');
  if (body.venueId) await assertVenueInOrg(db, before.organisation_id, body.venueId);
  const rules = body.rules ? parseSocialRules(body.rules) : undefined;
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('activities.session_series')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.venueId !== undefined ? { venue_id: body.venueId } : {}),
        ...(body.groupId !== undefined ? { group_id: body.groupId } : {}),
        ...(rules ? { default_rules_json: JSON.stringify(rules) } : {}),
        ...(body.defaultDurationMinutes !== undefined
          ? { default_duration_minutes: body.defaultDurationMinutes }
          : {}),
        ...(body.defaultRoundMinutes !== undefined
          ? { default_round_minutes: body.defaultRoundMinutes }
          : {}),
        ...(body.schedule !== undefined
          ? {
              schedule_weekday: body.schedule?.weekday ?? null,
              schedule_time: body.schedule ? timeToDb(body.schedule.time) : null,
              schedule_timezone: body.schedule?.timezone ?? null,
            }
          : {}),
        ...(body.checkInWindowMinutes !== undefined
          ? { check_in_window_minutes: body.checkInWindowMinutes }
          : {}),
        ...(body.hostsEnabled !== undefined ? { hosts_enabled: body.hostsEnabled } : {}),
        version: before.version + 1,
      })
      .where('id', '=', seriesId)
      .where('version', '=', before.version)
      .returning(SERIES_COLUMNS)
      .executeTakeFirst();
    if (!row) throw versionConflict('Session');
    await recordAudit(trx, {
      entityType: 'session_series',
      entityId: seriesId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { name: before.name },
      after: { name: row.name },
    });
    return toSeries(row, actor);
  });
}

export async function requireSeriesForActor(db: Db, actor: Actor, seriesId: string) {
  const row = await loadSeries(db, seriesId);
  if (!row) throw notFound('Session not found');
  return row;
}
