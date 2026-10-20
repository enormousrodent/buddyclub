import { createHash } from 'node:crypto';
import {
  computeProgression,
  computeStandings,
  type StandingsFixture,
  type StandingRow,
} from '@buddyclub/competition-engine';
import type { CommitProgressionBody, ProgressionPreview, Standings } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { emitEvent } from '../../platform/outbox.js';
import { toIso } from '../../platform/tokens.js';
import { AppError, notFound } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';
import {
  loadDivisions,
  loadMeet,
  loadSeason,
  MEET_COLUMNS,
  meetOrganisation,
  meetRules,
  type DbOrTrx,
} from './common.js';

interface DivisionComputation {
  divisionId: string;
  divisionName: string;
  ordinal: number;
  rows: StandingRow[];
  unresolvedTies: string[][];
  pendingFixtures: number;
  inputsHash: string;
}

export async function computeMeet(
  db: DbOrTrx,
  meetId: string,
): Promise<{ divisions: DivisionComputation[]; rulesVersion: string; criteria: string[] }> {
  const meet = await loadMeet(db, meetId);
  const { rules, version } = await meetRules(db, meet);
  const divisions = await loadDivisions(db, meet.season_id);
  const assignments = await db
    .selectFrom('competition.division_assignments')
    .select(['division_id', 'team_id'])
    .where('meet_id', '=', meetId)
    .execute();
  const fixtures = await db
    .selectFrom('competition.fixtures')
    .select(['id', 'division_id', 'home_team_id', 'away_team_id', 'status', 'outcome_json'])
    .where('meet_id', '=', meetId)
    .where('stage', '=', 'pool')
    .orderBy('created_at')
    .execute();
  const out: DivisionComputation[] = [];
  for (const d of divisions) {
    const teamIds = assignments.filter((a) => a.division_id === d.id).map((a) => a.team_id);
    const mine = fixtures.filter((f) => f.division_id === d.id);
    const decided: StandingsFixture[] = [];
    for (const f of mine) {
      const outcome = f.outcome_json as {
        outcome?: string;
        rubbersWon?: [number, number];
        pointsFor?: [number, number];
      } | null;
      if (
        f.status === 'completed' &&
        f.home_team_id &&
        f.away_team_id &&
        outcome &&
        (outcome.outcome === 'home' || outcome.outcome === 'away' || outcome.outcome === 'draw')
      ) {
        decided.push({
          fixtureId: f.id,
          home: f.home_team_id,
          away: f.away_team_id,
          outcome: outcome.outcome,
          rubbersWon: outcome.rubbersWon ?? [0, 0],
          pointsFor: outcome.pointsFor ?? [0, 0],
        });
      }
    }
    const result = computeStandings(teamIds, decided, rules.standings);
    const inputsHash = createHash('sha256')
      .update(JSON.stringify({ teamIds, decided, criteria: rules.standings.criteria, version }))
      .digest('hex');
    out.push({
      divisionId: d.id,
      divisionName: d.name,
      ordinal: d.ordinal,
      rows: result.rows,
      unresolvedTies: result.unresolvedTies,
      pendingFixtures: mine.length - decided.length,
      inputsHash,
    });
  }
  return { divisions: out, rulesVersion: version, criteria: rules.standings.criteria };
}

/** Persists a new immutable snapshot per division whenever the inputs changed. Returns revisions. */
export async function refreshStandings(
  db: DbOrTrx,
  meetId: string,
  correlationId: string,
): Promise<Record<string, number>> {
  const { divisions, rulesVersion } = await computeMeet(db, meetId);
  const revisions: Record<string, number> = {};
  for (const d of divisions) {
    const latest = await db
      .selectFrom('competition.standings_snapshots')
      .select(['revision', 'inputs_hash'])
      .where('meet_id', '=', meetId)
      .where('division_id', '=', d.divisionId)
      .orderBy('revision', 'desc')
      .executeTakeFirst();
    if (latest && latest.inputs_hash === d.inputsHash) {
      revisions[d.divisionId] = latest.revision;
      continue;
    }
    const revision = (latest?.revision ?? 0) + 1;
    await db
      .insertInto('competition.standings_snapshots')
      .values({
        meet_id: meetId,
        division_id: d.divisionId,
        revision,
        ruleset_version: rulesVersion,
        inputs_hash: d.inputsHash,
        rows_json: JSON.stringify(d.rows),
        unresolved_ties_json: JSON.stringify(d.unresolvedTies),
      })
      .execute();
    revisions[d.divisionId] = revision;
    await emitEvent(db, {
      eventType: 'meet.standings_updated',
      aggregateType: 'meet',
      aggregateId: meetId,
      payload: { meetId, divisionId: d.divisionId, revision },
      dedupeKey: `standings:${meetId}:${d.divisionId}:${revision}`,
    });
  }
  void correlationId;
  return revisions;
}

export async function getStandings(db: Db, actor: Actor, meetId: string): Promise<Standings> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgMember(actor, organisationId);
  const revisions = await refreshStandings(db, meetId, 'read');
  const { divisions, rulesVersion, criteria } = await computeMeet(db, meetId);
  const teamIds = [...new Set(divisions.flatMap((d) => d.rows.map((r) => r.teamId)))];
  const names = new Map(
    teamIds.length
      ? (
          await db
            .selectFrom('competition.teams')
            .select(['id', 'name'])
            .where('id', 'in', teamIds)
            .execute()
        ).map((t) => [t.id, t.name])
      : [],
  );
  const snapshots = await db
    .selectFrom('competition.standings_snapshots')
    .select(['division_id', 'revision', 'computed_at'])
    .where('meet_id', '=', meetId)
    .execute();
  return {
    meetId,
    rulesetVersion: rulesVersion,
    criteria,
    divisions: divisions.map((d) => {
      const snap = snapshots.find(
        (s) => s.division_id === d.divisionId && s.revision === revisions[d.divisionId],
      );
      return {
        divisionId: d.divisionId,
        divisionName: d.divisionName,
        ordinal: d.ordinal,
        revision: revisions[d.divisionId] ?? 0,
        computedAt: toIso(snap?.computed_at ?? new Date()),
        rows: d.rows.map((r) => ({ ...r, teamName: names.get(r.teamId) ?? '?' })),
        unresolvedTies: d.unresolvedTies,
        pendingFixtures: d.pendingFixtures,
      };
    }),
  };
}

async function progressionDto(
  db: DbOrTrx,
  row: {
    id: string;
    meet_id: string;
    status: ProgressionPreview['status'];
    standings_revision_json: Record<string, number>;
    preview_json: unknown;
    created_at: Date;
  },
): Promise<ProgressionPreview> {
  const preview = row.preview_json as Omit<
    ProgressionPreview,
    'progressionId' | 'meetId' | 'status' | 'standingsRevisions' | 'createdAt'
  >;
  return {
    progressionId: row.id,
    meetId: row.meet_id,
    status: row.status,
    standingsRevisions: row.standings_revision_json,
    ...preview,
    createdAt: toIso(row.created_at),
  };
}

/** Computes the promotion/relegation matrix for the director to review (spec section 9.3). */
export async function previewProgression(
  db: Db,
  actor: Actor,
  meetId: string,
  ctx: CommandContext,
): Promise<ProgressionPreview> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgAction(actor, organisationId, 'progression.approve');
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const { rules, version } = await meetRules(trx, meet);
    const revisions = await refreshStandings(trx, meetId, ctx.correlationId);
    const { divisions } = await computeMeet(trx, meetId);
    const blockers: string[] = [];
    for (const d of divisions) {
      if (d.pendingFixtures > 0)
        blockers.push(`${d.divisionName}: ${d.pendingFixtures} fixture(s) not yet completed`);
      if (d.unresolvedTies.length)
        blockers.push(
          `${d.divisionName}: unresolved tie between ${d.unresolvedTies.map((t) => t.join(' / ')).join('; ')} (director decision required)`,
        );
    }
    const ranking = divisions.map((d) => ({
      divisionId: d.divisionId,
      ordinal: d.ordinal,
      rankedTeamIds: d.rows.map((r) => r.teamId),
    }));
    const result = computeProgression(ranking, rules.progression);
    const teamIds = ranking.flatMap((r) => r.rankedTeamIds);
    const names = new Map(
      teamIds.length
        ? (
            await trx
              .selectFrom('competition.teams')
              .select(['id', 'name'])
              .where('id', 'in', teamIds)
              .execute()
          ).map((t) => [t.id, t.name])
        : [],
    );
    const preview = {
      moves: result.moves.map((m) => ({ ...m, teamName: names.get(m.teamId) ?? '?' })),
      nextAssignments: divisions.map((d) => ({
        divisionId: d.divisionId,
        divisionName: d.divisionName,
        teamIds: result.nextAssignments[d.divisionId] ?? [],
      })),
      blockers,
      warnings: result.warnings,
    };
    const row = await trx
      .insertInto('competition.progressions')
      .values({
        meet_id: meetId,
        standings_revision_json: JSON.stringify(revisions),
        preview_json: JSON.stringify(preview),
        ruleset_version: version,
        created_by_profile_id: actor.profileId,
      })
      .returning([
        'id',
        'meet_id',
        'status',
        'standings_revision_json',
        'preview_json',
        'created_at',
      ])
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      entityType: 'progression',
      entityId: row.id,
      operation: 'preview',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      rulesetVersion: version,
      after: { meetId, revisions, blockers: blockers.length, moves: preview.moves.length },
    });
    return progressionDto(trx, row);
  });
}

/** Approves a preview and writes the next meet's division assignments, with before/after snapshots. */
export async function commitProgression(
  db: Db,
  actor: Actor,
  meetId: string,
  body: CommitProgressionBody,
  ctx: CommandContext,
): Promise<ProgressionPreview> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgAction(actor, organisationId, 'progression.approve');
  return db.transaction().execute(async (trx) => {
    const meet = await loadMeet(trx, meetId, true);
    const season = await loadSeason(trx, meet.season_id);
    const row = await trx
      .selectFrom('competition.progressions')
      .select([
        'id',
        'meet_id',
        'status',
        'standings_revision_json',
        'preview_json',
        'created_at',
        'ruleset_version',
      ])
      .where('id', '=', body.progressionId)
      .where('meet_id', '=', meetId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound('Progression preview not found');
    if (row.status !== 'preview')
      throw new AppError(409, 'CONFLICT', `Progression is already ${row.status}`);
    const preview = row.preview_json as {
      blockers: string[];
      nextAssignments: { divisionId: string; teamIds: string[] }[];
      moves: unknown[];
    };
    if (preview.blockers.length)
      throw new AppError(
        409,
        'UNRESOLVED_TIE',
        'Progression cannot be committed',
        preview.blockers.join('; '),
      );

    const current = await refreshStandings(trx, meetId, ctx.correlationId);
    for (const [divisionId, revision] of Object.entries(row.standings_revision_json)) {
      if (current[divisionId] !== revision)
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'Standings changed since this preview',
          'Generate a new preview',
        );
    }

    let nextMeetId = body.nextMeetId ?? null;
    if (nextMeetId) {
      const next = await loadMeet(trx, nextMeetId, true);
      if (
        next.season_id !== meet.season_id ||
        next.state !== 'draft' ||
        next.sequence_no <= meet.sequence_no
      )
        throw new AppError(
          409,
          'CONFLICT',
          'Next meet must be a later draft meet in the same season',
        );
      const existing = await trx
        .selectFrom('competition.division_assignments')
        .select('id')
        .where('meet_id', '=', nextMeetId)
        .executeTakeFirst();
      if (existing)
        throw new AppError(409, 'CONFLICT', 'Next meet already has division assignments');
    } else {
      const spec = body.nextMeet;
      if (!spec)
        throw new AppError(400, 'VALIDATION_FAILED', 'Provide nextMeetId or nextMeet', undefined, [
          { path: 'body/nextMeet', message: 'required when nextMeetId is absent' },
        ]);
      const startsAt = new Date(spec.startsAt);
      const created = await trx
        .insertInto('competition.meets')
        .values({
          season_id: meet.season_id,
          venue_id: spec.venueId ?? meet.venue_id,
          name: spec.name,
          sequence_no: meet.sequence_no + 1,
          starts_at: startsAt,
          ends_at: new Date(startsAt.getTime() + 4 * 3600 * 1000),
          created_by_profile_id: actor.profileId,
        })
        .returning(MEET_COLUMNS)
        .executeTakeFirstOrThrow();
      nextMeetId = created.id;
    }
    const before = await trx
      .selectFrom('competition.division_assignments')
      .select(['division_id', 'team_id'])
      .where('meet_id', '=', meetId)
      .execute();
    for (const d of preview.nextAssignments) {
      if (d.teamIds.length) {
        await trx
          .insertInto('competition.division_assignments')
          .values(
            d.teamIds.map((team_id, i) => ({
              meet_id: nextMeetId as string,
              division_id: d.divisionId,
              team_id,
              seed: i + 1,
            })),
          )
          .execute();
      }
    }
    await trx
      .updateTable('competition.progressions')
      .set({
        status: 'committed',
        next_meet_id: nextMeetId,
        approved_by_profile_id: actor.profileId,
        approved_at: new Date(),
        reason: body.reason ?? null,
      })
      .where('id', '=', row.id)
      .execute();
    await trx
      .updateTable('competition.meets')
      .set({ state: 'completed', completed_at: new Date(), version: meet.version + 1 })
      .where('id', '=', meetId)
      .where('state', 'in', ['published', 'live'])
      .execute();
    await recordAudit(trx, {
      entityType: 'progression',
      entityId: row.id,
      operation: 'commit',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      rulesetVersion: row.ruleset_version,
      ...(body.reason ? { reason: body.reason } : {}),
      before: { meetId, assignments: before },
      after: { nextMeetId, assignments: preview.nextAssignments, standingsRevisions: current },
    });
    await emitEvent(trx, {
      eventType: 'meet.progression_published',
      aggregateType: 'meet',
      aggregateId: meetId,
      payload: { meetId, nextMeetId, organisationId: season.organisation_id },
      dedupeKey: `progression:${row.id}`,
    });
    const updated = await trx
      .selectFrom('competition.progressions')
      .select(['id', 'meet_id', 'status', 'standings_revision_json', 'preview_json', 'created_at'])
      .where('id', '=', row.id)
      .executeTakeFirstOrThrow();
    return progressionDto(trx, updated);
  });
}
