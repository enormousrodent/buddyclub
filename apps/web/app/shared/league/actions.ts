'use server';

import type { FixturePreview, ProgressionPreview } from '@buddyclub/shared-types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../../../components/action-form';
import { apiForUser, describeError } from '../../../lib/api';

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();
const optional = (fd: FormData, key: string) => {
  const v = text(fd, key);
  return v.length ? v : undefined;
};
const num = (fd: FormData, key: string, fallback: number) => {
  const v = Number(fd.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

async function run(work: () => Promise<unknown>, revalidate: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    throw new Error(describeError(error), { cause: error });
  }
  revalidatePath(revalidate);
}

export async function createCompetition(
  orgId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  let id: string;
  try {
    id = (
      await apiForUser().competitions.create(orgId, {
        name: text(fd, 'name'),
        type: 'league',
        sportId: text(fd, 'sportId') || 'badminton',
      })
    ).id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/league/competitions/${id}`);
}

export async function createSeason(
  competitionId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  let id: string;
  try {
    const divisions = Math.min(16, Math.max(1, num(fd, 'divisions', 1)));
    const cap = optional(fd, 'cap');
    const season = await apiForUser().competitions.createSeason(competitionId, {
      name: text(fd, 'name'),
      startsAt: new Date(text(fd, 'startsAt')).toISOString(),
      endsAt: new Date(text(fd, 'endsAt')).toISOString(),
      divisions: Array.from({ length: divisions }, (_, i) => ({
        name: `Division ${i + 1}`,
        capacity: 4,
      })),
      rules: {
        scoring: {
          targetPoints: num(fd, 'targetPoints', 21),
          winBy: num(fd, 'winBy', 1),
          cap: cap ? Number(cap) : null,
          setsPerRubber: num(fd, 'setsPerRubber', 1),
        },
        fixtureOutcome: { tieBreak: text(fd, 'tieBreak') || 'needs_review' },
        progression: {
          promoteCount: num(fd, 'promoteCount', 1),
          relegateCount: num(fd, 'relegateCount', 1),
        },
      },
    });
    id = season.id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/league/seasons/${id}`);
}

export async function createTeam(
  orgId: string,
  seasonId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const captain = optional(fd, 'captainParticipantId');
    await apiForUser().teams.create(orgId, {
      name: text(fd, 'name'),
      ...(captain ? { captainParticipantId: captain } : {}),
    });
    revalidatePath(`/league/seasons/${seasonId}`);
    return { ok: true, message: 'Team created' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function addToRoster(
  teamId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().teams.addToRoster(teamId, text(fd, 'participantId'));
    revalidatePath(`/league/teams/${teamId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function removeFromRoster(teamId: string, participantId: string): Promise<void> {
  await run(
    () => apiForUser().teams.removeFromRoster(teamId, participantId),
    `/league/teams/${teamId}`,
  );
}

export async function createMeet(
  seasonId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  let id: string;
  try {
    const venueId = optional(fd, 'venueId');
    id = (
      await apiForUser().meets.create(seasonId, {
        name: text(fd, 'name'),
        startsAt: new Date(text(fd, 'startsAt')).toISOString(),
        ...(venueId ? { venueId } : {}),
      })
    ).id;
  } catch (error) {
    return { error: describeError(error) };
  }
  redirect(`/league/meets/${id}`);
}

export async function setDivisionTeams(
  meetId: string,
  divisionId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const teamIds = fd.getAll('teamIds').map(String);
    await apiForUser().meets.setDivisionTeams(meetId, divisionId, teamIds);
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: `${teamIds.length} team(s) set` };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function setDivisionCourts(
  meetId: string,
  divisionId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const courtIds = fd.getAll('courtIds').map(String);
    await apiForUser().meets.setDivisionCourts(meetId, divisionId, courtIds, true);
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: `${courtIds.length} court(s) dedicated` };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function previewFixtures(
  meetId: string,
): Promise<{ preview?: FixturePreview; error?: string }> {
  try {
    return { preview: await apiForUser().meets.previewFixtures(meetId) };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function publishFixtures(meetId: string): Promise<void> {
  await run(() => apiForUser().meets.commitFixtures(meetId), `/league/meets/${meetId}`);
}

export async function submitLineup(
  fixtureId: string,
  teamId: string,
  meetId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const rubbers: Record<string, string[]> = {};
    for (const [key, value] of fd.entries()) {
      const m = /^rubber:(.+):(\d)$/.exec(key);
      if (!m || !value) continue;
      (rubbers[m[1] as string] ??= []).push(String(value));
    }
    await apiForUser().fixtures.submitLineup(fixtureId, teamId, { rubbers });
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: 'Lineup saved' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function callToCourt(
  meetId: string,
  matchId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const override = optional(fd, 'overrideReason');
    await apiForUser().fixtures.call(matchId, text(fd, 'courtId'), override);
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function startRubber(meetId: string, matchId: string): Promise<void> {
  await run(() => apiForUser().fixtures.start(matchId), `/league/meets/${meetId}`);
}

export async function submitResult(
  meetId: string,
  matchId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const games: [number, number][] = [];
    for (let i = 1; i <= 3; i++) {
      const a = text(fd, `g${i}a`);
      const b = text(fd, `g${i}b`);
      if (a === '' && b === '') continue;
      games.push([Number(a), Number(b)]);
    }
    const forfeited = optional(fd, 'forfeitedBy') as 'home' | 'away' | undefined;
    await apiForUser().fixtures.submitResult(matchId, {
      games,
      ...(forfeited ? { forfeitedBy: forfeited } : {}),
    });
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: 'Score recorded' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function confirmResult(
  meetId: string,
  matchId: string,
  revision: number,
): Promise<void> {
  await run(
    () => apiForUser().fixtures.confirmResult(matchId, revision),
    `/league/meets/${meetId}`,
  );
}

export async function previewProgression(
  meetId: string,
): Promise<{ preview?: ProgressionPreview; error?: string }> {
  try {
    return { preview: await apiForUser().meets.previewProgression(meetId) };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function commitProgression(
  meetId: string,
  progressionId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().meets.commitProgression(meetId, {
      progressionId,
      nextMeet: {
        name: text(fd, 'name') || 'Next meet',
        startsAt: new Date(text(fd, 'startsAt')).toISOString(),
      },
      ...(optional(fd, 'reason') ? { reason: text(fd, 'reason') } : {}),
    });
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: 'Progression approved. The next meet is ready as a draft.' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

// Phase 4: tournaments, disputes, public boards, imports -------------------------------------

export async function setEntries(
  meetId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const teamIds = fd.getAll('teamIds').map(String);
    const teams = teamIds.map((teamId) => {
      const seed = Number(fd.get(`seed:${teamId}`));
      return Number.isInteger(seed) && seed > 0 ? { teamId, seed } : { teamId };
    });
    await apiForUser().meets.setEntries(meetId, { teams });
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: `${teams.length} entrants drawn into the pools` };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function advanceKnockout(
  meetId: string,
): Promise<{ resolved?: number; pending?: string[]; error?: string }> {
  try {
    const r = await apiForUser().meets.advanceKnockout(meetId);
    revalidatePath(`/league/meets/${meetId}`);
    return { resolved: r.resolved, pending: r.pending };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function disputeResult(
  meetId: string,
  matchId: string,
  revision: number,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    await apiForUser().fixtures.disputeResult(matchId, revision, text(fd, 'reason'));
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: 'Dispute raised. A director will resolve it.' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function resolveDispute(
  meetId: string,
  matchId: string,
  revision: number,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const decision = text(fd, 'decision') === 'void' ? 'void' : 'uphold';
    await apiForUser().fixtures.resolveDispute(matchId, revision, {
      decision,
      reason: text(fd, 'reason'),
    });
    revalidatePath(`/league/meets/${meetId}`);
    return {
      ok: true,
      message: decision === 'uphold' ? 'Score upheld.' : 'Score voided; enter a new one.',
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function setMeetPublicAccess(
  meetId: string,
  enabled: boolean,
  _p: ActionResult,
): Promise<ActionResult> {
  try {
    await apiForUser().meets.setPublicAccess(meetId, enabled);
    revalidatePath(`/league/meets/${meetId}`);
    return { ok: true, message: enabled ? 'Public board is on.' : 'Public board is off.' };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export async function importTeams(
  orgId: string,
  seasonId: string,
  _p: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const r = await apiForUser().teams.importCsv(orgId, text(fd, 'csv'));
    revalidatePath(`/league/seasons/${seasonId}`);
    const summary = `${r.teamsCreated} teams created, ${r.teamsReused} reused, ${r.playersCreated} players created, ${r.rosterAdded} roster places`;
    return r.errors.length
      ? { error: `${summary}. Problems: ${r.errors.slice(0, 5).join('; ')}` }
      : { ok: true, message: summary };
  } catch (error) {
    return { error: describeError(error) };
  }
}
