import { randomUUID } from 'node:crypto';
import {
  ALGORITHM_VERSION,
  generateRotation,
  participantsFromHistory,
  type PlayedRound,
  type RotationInput,
  type RotationResult,
} from '@buddyclub/rotation-engine';
import type { Round, RotationPreview, RotationPreviewRequest } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction } from '../../platform/authz.js';
import { versionConflict } from '../../platform/if-match.js';
import { emitEvent } from '../../platform/outbox.js';
import { toIso } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import { parseSocialRules } from '../rulesets/service.js';
import {
  assertState,
  loadOccurrence,
  loadPlacement,
  loadSessionCourts,
  ROUND_COLUMNS,
  toRoundDto,
  type DbOrTrx,
  type OccurrenceRow,
} from './common.js';

const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface RosterPlayer {
  id: string;
  displayName: string;
  skill: number | undefined;
  gender: string | undefined;
}

async function availablePlayers(db: DbOrTrx, occurrenceId: string): Promise<RosterPlayer[]> {
  const rows = await db
    .selectFrom('activities.session_entries as e')
    .innerJoin('identity.participants as p', 'p.id', 'e.participant_id')
    .select(['p.id', 'p.display_name', 'p.skill_rating', 'p.declared_attributes'])
    .where('e.occurrence_id', '=', occurrenceId)
    .where('e.attendance_status', '=', 'checked_in')
    .orderBy('p.display_name')
    .execute();
  return rows.map((r) => {
    const gender = (r.declared_attributes as { gender?: unknown })?.gender;
    return {
      id: r.id,
      displayName: r.display_name,
      skill: r.skill_rating === null ? undefined : Number(r.skill_rating),
      gender: typeof gender === 'string' ? gender : undefined,
    };
  });
}

/** Committed rounds as engine history. Only rounds that actually ran (or are running) count. */
async function playedRounds(
  db: DbOrTrx,
  occurrenceId: string,
): Promise<{ rounds: PlayedRound[]; nextSequence: number }> {
  const rounds = await db
    .selectFrom('activities.social_rounds')
    .select(ROUND_COLUMNS)
    .where('occurrence_id', '=', occurrenceId)
    .where('status', '!=', 'cancelled')
    .orderBy('sequence_no')
    .execute();
  const history: PlayedRound[] = [];
  for (const r of rounds) {
    const placement = await loadPlacement(db, r.id);
    const started = r.started_at?.getTime();
    const ended = r.completed_at?.getTime() ?? Date.now();
    const minutes =
      started !== undefined
        ? Math.max(1, Math.round((ended - started) / 60_000 - r.paused_total_seconds / 60))
        : Math.round(r.duration_seconds / 60);
    history.push({
      assignments: placement.assignments.map((a) => ({
        courtId: a.courtId,
        teams: a.teams.map((t) => t.map((p) => p.participantId)),
      })),
      rests: placement.resting.map((p) => p.participantId),
      present: [
        ...placement.assignments.flatMap((a) => a.teams.flat().map((p) => p.participantId)),
        ...placement.resting.map((p) => p.participantId),
      ],
      minutesPlayed: minutes,
    });
  }
  // Cancelled rounds keep their sequence number (unique per occurrence), so count every round.
  const last = await db
    .selectFrom('activities.social_rounds')
    .select((eb) => eb.fn.max('sequence_no').as('n'))
    .where('occurrence_id', '=', occurrenceId)
    .executeTakeFirst();
  return { rounds: history, nextSequence: Number(last?.n ?? 0) + 1 };
}

function buildInput(
  occ: OccurrenceRow,
  seed: string,
  sequence: number,
  courts: { id: string }[],
  players: RosterPlayer[],
  excluded: Set<string>,
  history: PlayedRound[],
  locks: { a: string; b: string; kind: 'hard' | 'soft'; untilRound?: number }[],
): RotationInput {
  const rules = parseSocialRules(occ.rules_json).rotation;
  const participants = participantsFromHistory(
    players.map((p) => ({
      id: p.id,
      available: !excluded.has(p.id),
      skill: p.skill,
      gender: p.gender,
    })),
    history,
  );
  const engineRules: RotationInput['rules'] = {
    genderMode: rules.genderMode,
    weights: rules.weights,
    candidates: rules.candidates,
  };
  if (rules.maxConsecutiveRests !== undefined)
    engineRules.maxConsecutiveRests = rules.maxConsecutiveRests;
  return {
    occurrenceId: occ.id,
    sequence,
    seed,
    format: rules.format,
    courts: courts.map((c) => ({ id: c.id, available: true })),
    participants,
    pairLocks: locks,
    rules: engineRules,
  };
}

async function previewDto(
  db: DbOrTrx,
  row: {
    id: string;
    occurrence_id: string;
    sequence_no: number;
    source_version: number;
    algorithm_version: string;
    expires_at: Date;
  },
  result: RotationResult,
): Promise<RotationPreview> {
  const ids = [...result.assignments.flatMap((a) => a.teams.flat()), ...result.rests];
  const names = new Map<string, string>();
  if (ids.length) {
    const rows = await db
      .selectFrom('identity.participants')
      .select(['id', 'display_name'])
      .where('id', 'in', ids)
      .execute();
    for (const r of rows) names.set(r.id, r.display_name);
  }
  const courtRows = result.assignments.length
    ? await db
        .selectFrom('facilities.courts')
        .select(['id', 'code'])
        .where(
          'id',
          'in',
          result.assignments.map((a) => a.courtId),
        )
        .execute()
    : [];
  const codes = new Map(courtRows.map((c) => [c.id, c.code]));
  const named = (id: string) => ({ participantId: id, displayName: names.get(id) ?? '?' });
  return {
    previewId: row.id,
    occurrenceId: row.occurrence_id,
    sequenceNo: row.sequence_no,
    sourceVersion: row.source_version,
    algorithmVersion: row.algorithm_version,
    assignments: result.assignments.map((a) => ({
      courtId: a.courtId,
      courtCode: codes.get(a.courtId) ?? '?',
      matchId: null,
      teams: a.teams.map((t) => t.map(named)),
    })),
    resting: result.rests.map(named),
    warnings: result.warnings,
    metrics: result.metrics,
    expiresAt: toIso(row.expires_at),
  };
}

export async function previewRotation(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  body: RotationPreviewRequest,
  ctx: CommandContext,
): Promise<RotationPreview> {
  const occ = await loadOccurrence(db, occurrenceId);
  assertOrgAction(actor, occ.organisation_id, 'session.manage');
  assertState(occ, ['open', 'live'], 'generate a round');

  const [courts, players, locks, { rounds, nextSequence }] = await Promise.all([
    loadSessionCourts(db, occurrenceId),
    availablePlayers(db, occurrenceId),
    db
      .selectFrom('activities.pair_locks')
      .select(['participant_a', 'participant_b', 'kind', 'until_round'])
      .where('occurrence_id', '=', occurrenceId)
      .where('released_at', 'is', null)
      .execute(),
    playedRounds(db, occurrenceId),
  ]);
  const seed = body.seed ?? randomUUID();
  const input = buildInput(
    occ,
    seed,
    nextSequence,
    courts.filter((c) => c.active).map((c) => ({ id: c.courtId })),
    players,
    new Set(body.excludeParticipantIds ?? []),
    rounds,
    locks.map((l) => ({
      a: l.participant_a,
      b: l.participant_b,
      kind: l.kind,
      ...(l.until_round !== null ? { untilRound: l.until_round } : {}),
    })),
  );
  const result = generateRotation(input);

  const row = await db
    .insertInto('activities.rotation_previews')
    .values({
      occurrence_id: occurrenceId,
      sequence_no: nextSequence,
      source_version: occ.version,
      algorithm_version: result.algorithmVersion,
      seed,
      input_json: JSON.stringify(input),
      result_json: JSON.stringify(result),
      expires_at: new Date(Date.now() + PREVIEW_TTL_MS),
      created_by_profile_id: actor.profileId,
    })
    .returning([
      'id',
      'occurrence_id',
      'sequence_no',
      'source_version',
      'algorithm_version',
      'expires_at',
    ])
    .executeTakeFirstOrThrow();
  await recordAudit(db, {
    entityType: 'rotation_preview',
    entityId: row.id,
    operation: 'create',
    actor: { type: 'user', id: actor.profileId },
    correlationId: ctx.correlationId,
    after: {
      occurrenceId,
      sequenceNo: nextSequence,
      sourceVersion: occ.version,
      warnings: result.warnings.map((w) => w.code),
    },
  });
  return previewDto(db, row, result);
}

/** Persists a previewed round. Only a preview made against the current occurrence version is accepted. */
export async function commitRotation(
  db: Db,
  actor: Actor,
  occurrenceId: string,
  previewId: string,
  expectedVersion: number | null,
  ctx: CommandContext,
): Promise<Round> {
  return db.transaction().execute(async (trx) => {
    const occ = await loadOccurrence(trx, occurrenceId, true);
    assertOrgAction(actor, occ.organisation_id, 'session.manage');
    assertState(occ, ['open', 'live'], 'commit a round');
    if (expectedVersion !== null && occ.version !== expectedVersion)
      throw versionConflict('Session occurrence');

    const preview = await trx
      .selectFrom('activities.rotation_previews')
      .select([
        'id',
        'sequence_no',
        'source_version',
        'algorithm_version',
        'seed',
        'result_json',
        'expires_at',
        'committed_round_id',
      ])
      .where('id', '=', previewId)
      .where('occurrence_id', '=', occurrenceId)
      .executeTakeFirst();
    if (!preview) throw notFound('Preview not found for this session');
    if (preview.committed_round_id)
      throw new AppError(409, 'CONFLICT', 'This preview was already committed');
    if (preview.expires_at.getTime() < Date.now())
      throw new AppError(409, 'CONFLICT', 'Preview has expired', 'Generate a new preview');
    if (preview.source_version !== occ.version) {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'The roster changed since this preview was generated',
        'Generate a new preview and commit that',
      );
    }
    const result = preview.result_json as RotationResult;
    if (result.assignments.length === 0) {
      throw new AppError(
        409,
        'RULE_UNSATISFIABLE',
        'Preview has no playable round',
        result.warnings.map((w) => w.detail).join('; '),
      );
    }
    const pending = await trx
      .selectFrom('activities.social_rounds')
      .select('id')
      .where('occurrence_id', '=', occurrenceId)
      .where('status', '=', 'published')
      .executeTakeFirst();
    if (pending)
      throw new AppError(
        409,
        'CONFLICT',
        'A round is already published and not started',
        'Start or cancel it first',
      );

    const rulesVersion = `social_session@${occ.rules_schema_version}`;
    const round = await trx
      .insertInto('activities.social_rounds')
      .values({
        occurrence_id: occurrenceId,
        sequence_no: preview.sequence_no,
        duration_seconds: occ.round_duration_seconds,
        algorithm_version: preview.algorithm_version,
        seed: preview.seed,
        metrics_json: JSON.stringify(result.metrics),
        warnings_json: JSON.stringify(result.warnings),
        preview_id: preview.id,
        created_by_profile_id: actor.profileId,
      })
      .returning(ROUND_COLUMNS)
      .executeTakeFirstOrThrow();

    const format = result.assignments[0]?.teams[0]?.length === 1 ? 'singles' : 'doubles';
    for (const assignment of result.assignments) {
      const match = await trx
        .insertInto('matches.matches')
        .values({
          social_round_id: round.id,
          court_id: assignment.courtId,
          format,
          ruleset_version: rulesVersion,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      for (const [index, team] of assignment.teams.entries()) {
        const sideNo = index + 1;
        const side = await trx
          .insertInto('matches.match_sides')
          .values({ match_id: match.id, side_no: sideNo })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (team.length) {
          await trx
            .insertInto('matches.match_side_players')
            .values(team.map((participant_id) => ({ match_side_id: side.id, participant_id })))
            .execute();
          await trx
            .insertInto('activities.round_assignments')
            .values(
              team.map((participant_id) => ({
                round_id: round.id,
                participant_id,
                role: 'playing' as const,
                match_id: match.id,
                side_no: sideNo,
              })),
            )
            .execute();
        }
      }
    }
    if (result.rests.length) {
      await trx
        .insertInto('activities.round_assignments')
        .values(
          result.rests.map((participant_id) => ({
            round_id: round.id,
            participant_id,
            role: 'resting' as const,
          })),
        )
        .execute();
    }
    await trx
      .updateTable('activities.rotation_previews')
      .set({ committed_round_id: round.id })
      .where('id', '=', preview.id)
      .execute();
    await trx
      .updateTable('activities.session_occurrences')
      .set({ version: occ.version + 1 })
      .where('id', '=', occurrenceId)
      .execute();
    await recordAudit(trx, {
      entityType: 'social_round',
      entityId: round.id,
      operation: 'publish',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      rulesetVersion: rulesVersion,
      after: {
        occurrenceId,
        sequenceNo: round.sequence_no,
        previewId,
        algorithm: ALGORITHM_VERSION,
        courts: result.assignments.length,
        resting: result.rests.length,
      },
    });
    await emitEvent(trx, {
      eventType: 'session.round_published',
      aggregateType: 'social_round',
      aggregateId: round.id,
      payload: { occurrenceId, roundId: round.id, sequenceNo: round.sequence_no },
      dedupeKey: `round_published:${round.id}`,
    });
    return toRoundDto(trx, round, new Date());
  });
}
