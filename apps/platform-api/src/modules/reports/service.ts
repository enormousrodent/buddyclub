import type { ImportResult } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { assertOrgAction, assertOrgMember } from '../../platform/authz.js';
import { AppError } from '../../problems.js';
import { loadDivisions, loadMeet, loadSeason, meetOrganisation } from '../competitions/common.js';
import { listFixtures } from '../competitions/meets.js';
import { computeMeet } from '../competitions/standings.js';
import type { CommandContext } from '../organisations/service.js';
import { loadOccurrence, loadSeries, ROUND_COLUMNS, toRoundDto } from '../sessions/common.js';

/** Minimal RFC 4180 CSV: quotes fields with commas, quotes or newlines. */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Imports teams and rosters from `team,player[,captain]` rows. Existing teams and players (by
 * name within the club) are reused; everything runs in one transaction and is audited once.
 */
export async function importTeams(
  db: Db,
  actor: Actor,
  organisationId: string,
  csv: string,
  ctx: CommandContext,
): Promise<ImportResult> {
  assertOrgAction(actor, organisationId, 'competition.manage');
  const rows = parseCsv(csv);
  if (rows.length < 2)
    throw new AppError(400, 'VALIDATION_FAILED', 'CSV needs a header row and at least one row');
  const header = (rows[0] as string[]).map((h) => h.trim().toLowerCase());
  const teamCol = header.indexOf('team');
  const playerCol = header.indexOf('player');
  const captainCol = header.indexOf('captain');
  if (teamCol < 0 || playerCol < 0)
    throw new AppError(400, 'VALIDATION_FAILED', 'Header must contain "team" and "player"');
  const result: ImportResult = {
    teamsCreated: 0,
    teamsReused: 0,
    playersCreated: 0,
    rosterAdded: 0,
    errors: [],
  };
  return db.transaction().execute(async (trx) => {
    const teamIds = new Map<string, string>();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as string[];
      const teamName = (r[teamCol] ?? '').trim();
      const playerName = (r[playerCol] ?? '').trim();
      const captain =
        captainCol >= 0 && /^(y|yes|true|1|captain)$/i.test((r[captainCol] ?? '').trim());
      if (!teamName || !playerName) {
        result.errors.push(`row ${i + 1}: team and player are required`);
        continue;
      }
      if (teamName.length > 120 || playerName.length > 120) {
        result.errors.push(`row ${i + 1}: name too long`);
        continue;
      }
      let teamId = teamIds.get(teamName.toLowerCase());
      if (!teamId) {
        const existing = await trx
          .selectFrom('competition.teams')
          .select('id')
          .where('organisation_id', '=', organisationId)
          .where((eb) => eb(eb.fn('lower', ['name']), '=', teamName.toLowerCase()))
          .where('archived_at', 'is', null)
          .executeTakeFirst();
        if (existing) {
          teamId = existing.id;
          result.teamsReused += 1;
        } else {
          const created = await trx
            .insertInto('competition.teams')
            .values({
              organisation_id: organisationId,
              name: teamName,
              created_by_profile_id: actor.profileId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          teamId = created.id;
          result.teamsCreated += 1;
        }
        teamIds.set(teamName.toLowerCase(), teamId);
      }
      let participant = await trx
        .selectFrom('identity.participants')
        .select('id')
        .where('organisation_id', '=', organisationId)
        .where('display_name', '=', playerName)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (!participant) {
        participant = await trx
          .insertInto('identity.participants')
          .values({
            organisation_id: organisationId,
            user_profile_id: null,
            display_name: playerName,
            source: 'imported',
            declared_attributes: '{}',
            created_by_profile_id: actor.profileId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        result.playersCreated += 1;
      }
      const onRoster = await trx
        .selectFrom('competition.team_roster')
        .select('id')
        .where('team_id', '=', teamId)
        .where('participant_id', '=', participant.id)
        .where('valid_to', 'is', null)
        .executeTakeFirst();
      if (!onRoster) {
        await trx
          .insertInto('competition.team_roster')
          .values({
            team_id: teamId,
            participant_id: participant.id,
            created_by_profile_id: actor.profileId,
          })
          .execute();
        result.rosterAdded += 1;
      }
      if (captain) {
        await trx
          .updateTable('competition.teams')
          .set({ captain_participant_id: participant.id })
          .where('id', '=', teamId)
          .where('captain_participant_id', 'is', null)
          .execute();
      }
    }
    await recordAudit(trx, {
      entityType: 'organisation',
      entityId: organisationId,
      operation: 'teams_import',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      after: { ...result, errors: result.errors.length },
    });
    return result;
  });
}

export async function meetCsv(db: Db, actor: Actor, meetId: string): Promise<string> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgMember(actor, organisationId);
  const fixtures = await listFixtures(db, meetId);
  const rows: Array<Array<string | number | null>> = [
    [
      'stage',
      'division',
      'round',
      'label',
      'home',
      'away',
      'fixture_status',
      'rubber',
      'rubber_label',
      'court',
      'rubber_state',
      'result_status',
      'games',
      'forfeited_by',
      'winner',
    ],
  ];
  for (const f of fixtures) {
    const winner = f.winnerTeamId
      ? f.winnerTeamId === f.home?.teamId
        ? f.home.name
        : (f.away?.name ?? '')
      : f.outcome?.outcome === 'home'
        ? (f.home?.name ?? '')
        : f.outcome?.outcome === 'away'
          ? (f.away?.name ?? '')
          : '';
    for (const r of f.rubbers) {
      rows.push([
        f.stage,
        f.divisionName ?? '',
        f.roundNo,
        f.bracket?.label ?? '',
        f.home?.name ?? 'TBC',
        f.away?.name ?? 'TBC',
        f.status,
        r.rubberKey,
        r.label,
        r.courtCode ?? '',
        r.state,
        r.result?.status ?? '',
        r.result ? r.result.games.map((g) => g.join('-')).join(' ') : '',
        r.result?.forfeitedBy ?? '',
        winner,
      ]);
    }
  }
  return toCsv(rows);
}

export async function standingsCsv(db: Db, actor: Actor, meetId: string): Promise<string> {
  const { organisationId } = await meetOrganisation(db, meetId);
  assertOrgMember(actor, organisationId);
  const meet = await loadMeet(db, meetId);
  const season = await loadSeason(db, meet.season_id);
  const { divisions } = await computeMeet(db, meetId);
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
  const rows: Array<Array<string | number | null>> = [
    [
      'competition',
      'season',
      'meet',
      'division',
      'rank',
      'team',
      'played',
      'won',
      'drawn',
      'lost',
      'rubbers_won',
      'rubbers_lost',
      'points_for',
      'points_against',
      'points_difference',
      'tied',
    ],
  ];
  for (const d of divisions)
    for (const r of d.rows)
      rows.push([
        season.competition_name,
        season.name,
        meet.name,
        d.divisionName,
        r.rank,
        names.get(r.teamId) ?? '',
        r.played,
        r.fixtureWins,
        r.fixtureDraws,
        r.fixtureLosses,
        r.rubbersWon,
        r.rubbersLost,
        r.pointsFor,
        r.pointsAgainst,
        r.pointsDifference,
        r.tiedWith.length ? 'yes' : '',
      ]);
  void loadDivisions;
  return toCsv(rows);
}

export async function occurrenceCsv(db: Db, actor: Actor, occurrenceId: string): Promise<string> {
  const occ = await loadOccurrence(db, occurrenceId);
  assertOrgMember(actor, occ.organisation_id);
  const series = await loadSeries(db, occ.series_id);
  const rounds = await db
    .selectFrom('activities.social_rounds')
    .select(ROUND_COLUMNS)
    .where('occurrence_id', '=', occurrenceId)
    .orderBy('sequence_no')
    .execute();
  const now = new Date();
  const rows: Array<Array<string | number | null>> = [
    ['session', 'starts_at', 'round', 'status', 'court', 'side_1', 'side_2', 'resting'],
  ];
  for (const r of rounds) {
    const dto = await toRoundDto(db, r, now);
    const resting = dto.resting.map((p) => p.displayName).join('; ');
    if (!dto.assignments.length)
      rows.push([
        series.name,
        occ.starts_at.toISOString(),
        dto.sequenceNo,
        dto.status,
        '',
        '',
        '',
        resting,
      ]);
    for (const a of dto.assignments)
      rows.push([
        series.name,
        occ.starts_at.toISOString(),
        dto.sequenceNo,
        dto.status,
        a.courtCode,
        (a.teams[0] ?? []).map((p) => p.displayName).join(' & '),
        (a.teams[1] ?? []).map((p) => p.displayName).join(' & '),
        resting,
      ]);
  }
  return toCsv(rows);
}
