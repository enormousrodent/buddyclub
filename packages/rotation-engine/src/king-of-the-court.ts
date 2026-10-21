import type { RotationAssignment, RotationResult, RotationWarning } from './types';

/**
 * King of the court (Addendum 1.2 step 4). Courts are ranked; after each round the winners
 * move up a court and the losers move down. Teams stay together. On the top court the winners
 * stay; on the bottom court the losers step off when someone is waiting, and the waiting
 * players come on at the bottom. A match without a result counts side 1 as the winner, with a
 * warning, so the night keeps moving.
 *
 * Pure and deterministic: the same inputs always give the same round.
 */

export interface PlayedMatch {
  courtId: string;
  /** Two teams of participant ids, side 1 then side 2. */
  teams: string[][];
  /** 1 or 2; null when nobody recorded it. */
  winnerSide: 1 | 2 | null;
}

export interface KingOfTheCourtInput {
  /** Courts in rank order, top court first. Only available courts. */
  courts: string[];
  /** Everyone who may play this round, in rest-priority order (longest wait first). */
  available: string[];
  /** The round just played. */
  previous: PlayedMatch[];
  /** 1 for singles, 2 for doubles. */
  teamSize: number;
}

const ALGORITHM = 'king-of-the-court@1';

export function kingOfTheCourt(input: KingOfTheCourtInput): RotationResult {
  const warnings: RotationWarning[] = [];
  const availableSet = new Set(input.available);
  const placed = new Set<string>();

  // Rank the previous round's matches by court order; matches on courts no longer in play are
  // treated as the lowest courts.
  const rank = new Map(input.courts.map((id, i) => [id, i]));
  const previous = [...input.previous].sort(
    (a, b) => (rank.get(a.courtId) ?? 999) - (rank.get(b.courtId) ?? 999),
  );

  const keep = (team: string[]): string[] => team.filter((p) => availableSet.has(p));
  const winners: string[][] = [];
  const losers: string[][] = [];
  for (const m of previous) {
    const side = m.winnerSide ?? 1;
    if (m.winnerSide === null)
      warnings.push({
        code: 'RESULT_MISSING',
        detail: `No result recorded on court ${m.courtId}; side 1 counted as winners`,
      });
    winners.push(keep(m.teams[side - 1] ?? []));
    losers.push(keep(m.teams[2 - side] ?? []));
  }

  // Everyone available who was not placed by the previous round waits at the bottom, in the
  // order given (rest priority).
  const inPrevious = new Set(previous.flatMap((m) => m.teams.flat()));
  const waiting = input.available.filter((p) => !inPrevious.has(p));

  // Build each court's two teams from the movement rule, then fill gaps from the waiting list.
  const courts = input.courts;
  const teamsByCourt: string[][][] = courts.map(() => [[], []]);
  for (let i = 0; i < courts.length; i++) {
    const fromAbove = i === 0 ? winners[0] : losers[i - 1];
    const fromBelow = i === courts.length - 1 ? undefined : winners[i + 1];
    const stayers = i === 0 ? winners[0] : undefined;
    const teamA = (i === 0 ? stayers : fromAbove) ?? [];
    let teamB: string[] | undefined = fromBelow;
    if (i === courts.length - 1) {
      // Bottom court: the losers stay only when nobody is waiting to come on.
      teamB = waiting.length >= input.teamSize ? [] : (losers[i] ?? []);
    }
    teamsByCourt[i] = [[...teamA], [...(teamB ?? [])]];
  }
  // The bottom court's displaced losers (and anyone pushed off) rest.
  const bottomLosers =
    courts.length && waiting.length >= input.teamSize ? (losers[courts.length - 1] ?? []) : [];

  const queue = [...waiting, ...bottomLosers];
  const take = (): string | undefined => {
    while (queue.length) {
      const p = queue.shift() as string;
      if (!placed.has(p)) return p;
    }
    return undefined;
  };

  const assignments: RotationAssignment[] = [];
  const rests: string[] = [];
  for (let i = 0; i < courts.length; i++) {
    const teams = teamsByCourt[i] as string[][];
    for (const team of teams) {
      for (const p of [...team]) {
        if (placed.has(p)) team.splice(team.indexOf(p), 1);
        else placed.add(p);
      }
      while (team.length < input.teamSize) {
        const p = take();
        if (!p) break;
        team.push(p);
        placed.add(p);
      }
    }
    if (teams.every((t) => t.length === input.teamSize)) {
      assignments.push({ courtId: courts[i] as string, teams });
    } else {
      // Not enough players for this court: release its players to rest.
      for (const p of teams.flat()) placed.delete(p);
      warnings.push({
        code: 'COURT_LEFT_IDLE',
        detail: `Not enough players for court ${courts[i]}`,
      });
    }
  }
  for (const p of input.available) if (!placed.has(p)) rests.push(p);

  return {
    assignments,
    rests,
    warnings,
    metrics: { courtsInPlay: assignments.length, resting: rests.length },
    algorithmVersion: ALGORITHM,
  };
}
