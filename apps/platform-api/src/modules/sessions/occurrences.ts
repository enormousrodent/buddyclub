import type {
  CreateOccurrenceBody,
  Occurrence,
  UpdateOccurrenceBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertManageSeries, assertOrgMember } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { emitEvent } from '../../platform/outbox.js';
import { AppError } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { DEFAULT_SOCIAL_RULES, parseSocialRules } from '../rulesets/service.js';
import {
  assertState,
  bumpOccurrenceVersion,
  loadOccurrence,
  loadSeries,
  OCCURRENCE_COLUMNS,
  toOccurrenceDto,
  type DbOrTrx,
} from './common.js';

async function venueCourtIds(db: DbOrTrx, venueId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('facilities.courts')
    .select('id')
    .where('venue_id', '=', venueId)
    .where('active', '=', true)
    .orderBy('sort_order')
    .orderBy('code')
    .execute();
  return rows.map((r) => r.id);
}

async function validateCourts(
  db: DbOrTrx,
  venueId: string | null,
  courtIds: string[],
): Promise<void> {
  if (courtIds.length === 0) return;
  if (!venueId) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Courts need a venue', undefined, [
      { path: 'body/courtIds', message: 'set a venue before choosing courts' },
    ]);
  }
  const rows = await db
    .selectFrom('facilities.courts')
    .select('id')
    .where('venue_id', '=', venueId)
    .where('id', 'in', courtIds)
    .execute();
  if (rows.length !== new Set(courtIds).size) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown court', undefined, [
      { path: 'body/courtIds', message: 'all courts must belong to the venue' },
    ]);
  }
}

async function replaceCourts(
  trx: DbOrTrx,
  occurrenceId: string,
  courtIds: string[],
): Promise<void> {
  await trx
    .deleteFrom('activities.session_courts')
    .where('occurrence_id', '=', occurrenceId)
    .execute();
  if (courtIds.length === 0) return;
  await trx
    .insertInto('activities.session_courts')
    .values(
      courtIds.map((court_id, i) => ({ occurrence_id: occurrenceId, court_id, sort_order: i })),
    )
    .execute();
}

export async function createOccurrence(
  db: Db,
  actor: Actor,
  seriesId: string,
  body: CreateOccurrenceBody,
  ctx: CommandContext,
): Promise<Occurrence> {
  const series = await loadSeries(db, seriesId);
  assertManageSeries(actor, series.organisation_id, series.id);

  const startsAt = new Date(body.startsAt);
  const endsAt = body.endsAt
    ? new Date(body.endsAt)
    : new Date(startsAt.getTime() + series.default_duration_minutes * 60_000);
  if (endsAt <= startsAt) {
    throw new AppError(400, 'VALIDATION_FAILED', 'End must be after start', undefined, [
      { path: 'body/endsAt', message: 'must be after startsAt' },
    ]);
  }
  const venueId = body.venueId ?? series.venue_id;
  if (venueId) {
    const venue = await db
      .selectFrom('facilities.venues')
      .select('id')
      .where('id', '=', venueId)
      .where('organisation_id', '=', series.organisation_id)
      .executeTakeFirst();
    if (!venue)
      throw new AppError(400, 'VALIDATION_FAILED', 'Unknown venue', undefined, [
        { path: 'body/venueId', message: 'not a venue of this organisation' },
      ]);
  }
  const courtIds = body.courtIds ?? (venueId ? await venueCourtIds(db, venueId) : []);
  await validateCourts(db, venueId, courtIds);

  let rules = DEFAULT_SOCIAL_RULES;
  let rulesetId: string | null = null;
  if (body.rules) rules = parseSocialRules(body.rules);
  else if (series.default_rules_json) rules = parseSocialRules(series.default_rules_json);
  else if (series.default_ruleset_id) {
    const rs = await db
      .selectFrom('platform.rulesets')
      .select(['id', 'definition_json'])
      .where('id', '=', series.default_ruleset_id)
      .executeTakeFirst();
    if (rs) {
      rules = parseSocialRules(rs.definition_json);
      rulesetId = rs.id;
    }
  }
  if (body.mode) rules = { ...rules, rotation: { ...rules.rotation, mode: body.mode } };
  if (body.format) rules = { ...rules, rotation: { ...rules.rotation, format: body.format } };

  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto('activities.session_occurrences')
      .values({
        series_id: seriesId,
        organisation_id: series.organisation_id,
        venue_id: venueId,
        starts_at: startsAt,
        ends_at: endsAt,
        rules_json: JSON.stringify(rules),
        rules_schema_version: rules.schemaVersion,
        ruleset_id: rulesetId,
        round_duration_seconds: (body.roundMinutes ?? series.default_round_minutes) * 60,
        notes: body.notes ?? null,
        created_by_profile_id: actor.profileId,
      })
      .returning(OCCURRENCE_COLUMNS)
      .executeTakeFirstOrThrow();
    await replaceCourts(trx, row.id, courtIds);
    if (rulesetId) {
      await trx
        .updateTable('platform.rulesets')
        .set({ used_at: new Date() })
        .where('id', '=', rulesetId)
        .where('used_at', 'is', null)
        .execute();
    }
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: row.id,
      operation: 'create',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { seriesId, startsAt: startsAt.toISOString(), courts: courtIds.length },
    });
    return toOccurrenceDto(trx, row);
  });
}

/** The non-cancelled night of a series at exactly this start, for the "set up" race. */
export async function findOccurrenceAt(
  db: Db,
  actor: Actor,
  seriesId: string,
  startsAt: string,
): Promise<Occurrence> {
  const row = await db
    .selectFrom('activities.session_occurrences')
    .select(OCCURRENCE_COLUMNS)
    .where('series_id', '=', seriesId)
    .where('starts_at', '=', new Date(startsAt))
    .where('cancelled_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Session occurrence not found');
  assertOrgMember(actor, row.organisation_id);
  return toOccurrenceDto(db, row);
}

export async function listOccurrences(
  db: Db,
  actor: Actor,
  organisationId: string,
  query: {
    from?: string | undefined;
    to?: string | undefined;
    state?: Occurrence['state'] | undefined;
  },
): Promise<Occurrence[]> {
  assertOrgMember(actor, organisationId);
  let q = db
    .selectFrom('activities.session_occurrences')
    .select(OCCURRENCE_COLUMNS)
    .where('organisation_id', '=', organisationId)
    .orderBy('starts_at', 'desc')
    .limit(100);
  if (query.from) q = q.where('starts_at', '>=', new Date(query.from));
  if (query.to) q = q.where('starts_at', '<=', new Date(query.to));
  if (query.state) q = q.where('state', '=', query.state);
  const rows = await q.execute();
  return Promise.all(rows.map((r) => toOccurrenceDto(db, r)));
}

export async function getOccurrence(
  db: Db,
  actor: Actor,
  occurrenceId: string,
): Promise<Occurrence> {
  const row = await loadOccurrence(db, occurrenceId);
  assertOrgMember(actor, row.organisation_id);
  return toOccurrenceDto(db, row);
}

export async function updateOccurrence(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  body: UpdateOccurrenceBody,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Occurrence> {
  return db.transaction().execute(async (trx) => {
    const before = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, before.organisation_id, before.series_id);
    if (expectedVersion !== null && before.version !== expectedVersion)
      throw versionConflict('Session occurrence');
    assertState(before, ['draft', 'open', 'live'], 'update the session');

    const venueId = body.venueId ?? before.venue_id;
    if (body.courtIds) await validateCourts(trx, venueId, body.courtIds);
    let rulesPatch: Record<string, unknown> = {};
    if (body.mode !== undefined || body.format !== undefined) {
      const round = await trx
        .selectFrom('activities.social_rounds')
        .select('id')
        .where('occurrence_id', '=', occurrenceId)
        .where('status', '!=', 'cancelled')
        .executeTakeFirst();
      if (round)
        throw new AppError(
          409,
          'CONFLICT',
          'The format cannot change once a round has been called',
        );
      const rules = parseSocialRules(before.rules_json);
      rulesPatch = {
        rules_json: JSON.stringify({
          ...rules,
          rotation: {
            ...rules.rotation,
            ...(body.mode !== undefined ? { mode: body.mode } : {}),
            ...(body.format !== undefined ? { format: body.format } : {}),
          },
        }),
      };
    }
    const startsAt = body.startsAt ? new Date(body.startsAt) : before.starts_at;
    const endsAt = body.endsAt ? new Date(body.endsAt) : before.ends_at;
    if (endsAt <= startsAt) {
      throw new AppError(400, 'VALIDATION_FAILED', 'End must be after start', undefined, [
        { path: 'body/endsAt', message: 'must be after startsAt' },
      ]);
    }

    const row = await trx
      .updateTable('activities.session_occurrences')
      .set({
        starts_at: startsAt,
        ends_at: endsAt,
        venue_id: venueId,
        ...(body.roundMinutes !== undefined
          ? { round_duration_seconds: body.roundMinutes * 60 }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...rulesPatch,
        version: before.version + 1,
      })
      .where('id', '=', occurrenceId)
      .returning(OCCURRENCE_COLUMNS)
      .executeTakeFirstOrThrow();
    if (body.courtIds) await replaceCourts(trx, occurrenceId, body.courtIds);
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: 'update',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: {
        startsAt: before.starts_at.toISOString(),
        roundDurationSeconds: before.round_duration_seconds,
      },
      after: {
        startsAt: row.starts_at.toISOString(),
        roundDurationSeconds: row.round_duration_seconds,
      },
    });
    return toOccurrenceDto(trx, row);
  });
}

export async function transitionOccurrence(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  action: 'open' | 'complete' | 'cancel',
  ctx: CommandContext,
): Promise<Occurrence> {
  return db.transaction().execute(async (trx) => {
    const before = await loadOccurrence(trx, occurrenceId, true);
    assertManageSeries(actor, before.organisation_id, before.series_id);
    const now = new Date();
    let patch: Record<string, unknown>;
    if (action === 'open') {
      assertState(before, ['draft'], 'open the session');
      patch = { state: 'open', opened_at: now };
    } else if (action === 'complete') {
      assertState(before, ['open', 'live'], 'complete the session');
      const active = await trx
        .selectFrom('activities.social_rounds')
        .select('id')
        .where('occurrence_id', '=', occurrenceId)
        .where('status', 'in', ['in_progress', 'paused'])
        .executeTakeFirst();
      if (active)
        throw new AppError(
          409,
          'CONFLICT',
          'A round is still in progress',
          'Complete or cancel it first',
        );
      await trx
        .updateTable('activities.social_rounds')
        .set({ status: 'cancelled', cancelled_at: now })
        .where('occurrence_id', '=', occurrenceId)
        .where('status', '=', 'published')
        .execute();
      patch = { state: 'completed', completed_at: now };
    } else {
      assertState(before, ['draft', 'open'], 'cancel the session');
      patch = { state: 'cancelled', cancelled_at: now };
    }
    const row = await trx
      .updateTable('activities.session_occurrences')
      .set({ ...patch, version: before.version + 1 })
      .where('id', '=', occurrenceId)
      .returning(OCCURRENCE_COLUMNS)
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'session_occurrence',
      entityId: occurrenceId,
      operation: action,
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      before: { state: before.state },
      after: { state: row.state },
    });
    if (action === 'open') {
      await emitEvent(trx, {
        eventType: 'session.occurrence_opened',
        aggregateType: 'session_occurrence',
        aggregateId: occurrenceId,
        payload: { occurrenceId, version: row.version },
        dedupeKey: `occurrence_opened:${occurrenceId}`,
      });
    }
    return toOccurrenceDto(trx, row);
  });
}

export { bumpOccurrenceVersion };
