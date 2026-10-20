/**
 * Scoring engine (spec section 9.2). Pure TypeScript. Evaluates games, rubbers and fixtures against
 * versioned rules. Never invents a winner: anything the rules cannot decide is `needs_review`.
 */
import type { FixtureOutcomePolicy, ScoringRules } from '@buddyclub/rules-schema';

export const SCORING_ENGINE_VERSION = 'scoring-engine@0.1.0';

/** Points for side 1 and side 2 of one game. */
export type GamePoints = [number, number];

export type GameOutcome =
  | { valid: true; winner: 1 | 2; points: GamePoints }
  | { valid: false; reason: string; points: GamePoints };

/**
 * A game is valid when it ended exactly as the rules say it must: a side reached the target with the
 * required margin and play stopped there, or the cap was reached.
 */
export function evaluateGame(points: GamePoints, rules: ScoringRules): GameOutcome {
  const [a, b] = points;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { valid: false, reason: 'points must be non-negative integers', points };
  }
  if (a === b) return { valid: false, reason: 'a game cannot be level', points };
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const winner: 1 | 2 = a > b ? 1 : 2;
  const { targetPoints, winBy, cap } = rules;

  if (cap !== null && hi > cap)
    return { valid: false, reason: `score exceeds the cap of ${cap}`, points };
  if (cap !== null && hi === cap) return { valid: true, winner, points };
  if (hi < targetPoints)
    return { valid: false, reason: `winner must reach ${targetPoints}`, points };
  if (hi - lo < winBy) return { valid: false, reason: `winner must lead by ${winBy}`, points };
  if (hi > targetPoints && hi - lo !== winBy) {
    return {
      valid: false,
      reason: `play stops as soon as a side leads by ${winBy} after ${targetPoints}`,
      points,
    };
  }
  return { valid: true, winner, points };
}

export type RubberStatus = 'complete' | 'draw' | 'incomplete' | 'invalid';

export interface RubberResult {
  status: RubberStatus;
  winner: 1 | 2 | null;
  games: GameOutcome[];
  gamesWon: [number, number];
  pointsFor: [number, number];
  reason?: string;
}

function gamesNeeded(setsPerRubber: number): number {
  return Math.floor(setsPerRubber / 2) + 1;
}

/** Evaluates the games of a rubber in order. */
export function evaluateRubber(games: GamePoints[], rules: ScoringRules): RubberResult {
  const outcomes = games.map((g) => evaluateGame(g, rules));
  const gamesWon: [number, number] = [0, 0];
  const pointsFor: [number, number] = [0, 0];
  const needed = gamesNeeded(rules.setsPerRubber);
  let decidedAt = -1;

  for (const [index, outcome] of outcomes.entries()) {
    if (!outcome.valid) {
      return {
        status: 'invalid',
        winner: null,
        games: outcomes,
        gamesWon,
        pointsFor,
        reason: `game ${index + 1}: ${outcome.reason}`,
      };
    }
    if (decidedAt >= 0) {
      return {
        status: 'invalid',
        winner: null,
        games: outcomes,
        gamesWon,
        pointsFor,
        reason: `game ${index + 1} played after the rubber was decided`,
      };
    }
    pointsFor[0] += outcome.points[0];
    pointsFor[1] += outcome.points[1];
    if (outcome.winner === 1) gamesWon[0] += 1;
    else gamesWon[1] += 1;
    if ((outcome.winner === 1 ? gamesWon[0] : gamesWon[1]) >= needed) decidedAt = index;
  }
  if (decidedAt >= 0) {
    return {
      status: 'complete',
      winner: gamesWon[0] > gamesWon[1] ? 1 : 2,
      games: outcomes,
      gamesWon,
      pointsFor,
    };
  }
  if (outcomes.length >= rules.setsPerRubber) {
    if (rules.allowDraw && gamesWon[0] === gamesWon[1]) {
      return { status: 'draw', winner: null, games: outcomes, gamesWon, pointsFor };
    }
    if (!rules.allowDraw && gamesWon[0] === gamesWon[1]) {
      return {
        status: 'incomplete',
        winner: null,
        games: outcomes,
        gamesWon,
        pointsFor,
        reason: 'rubber is level and draws are not allowed',
      };
    }
    return {
      status: 'complete',
      winner: gamesWon[0] > gamesWon[1] ? 1 : 2,
      games: outcomes,
      gamesWon,
      pointsFor,
    };
  }
  return {
    status: 'incomplete',
    winner: null,
    games: outcomes,
    gamesWon,
    pointsFor,
    reason: `${needed} games needed to win`,
  };
}

/** Result credited when a side forfeits, according to the configured forfeit policy. */
export function forfeitRubber(winner: 1 | 2, rules: ScoringRules): RubberResult | null {
  const needed = gamesNeeded(rules.setsPerRubber);
  if (rules.forfeitPolicy === 'void') return null;
  const gamesWon: [number, number] = winner === 1 ? [needed, 0] : [0, needed];
  const pointsFor: [number, number] =
    rules.forfeitPolicy === 'award_target_to_zero'
      ? winner === 1
        ? [rules.targetPoints * needed, 0]
        : [0, rules.targetPoints * needed]
      : [0, 0];
  return { status: 'complete', winner, games: [], gamesWon, pointsFor, reason: 'forfeit' };
}

export type FixtureOutcome = 'home' | 'away' | 'draw' | 'needs_review' | 'incomplete';

export interface FixtureEvaluation {
  outcome: FixtureOutcome;
  rubbersWon: [number, number];
  rubbersDrawn: number;
  pointsFor: [number, number];
  /** Rubbers that were evaluated (null entries, e.g. voided forfeits, are skipped). */
  rubbersCounted: number;
  reason?: string;
}

/**
 * Decides a fixture from its rubbers. Side 1 is home. Level rubbers are resolved by the configured
 * tie-break; `needs_review` when the policy cannot decide (ADR-009).
 */
export function evaluateFixture(
  rubbers: Array<RubberResult | null>,
  policy: FixtureOutcomePolicy,
  options: { expectedRubbers?: number } = {},
): FixtureEvaluation {
  const rubbersWon: [number, number] = [0, 0];
  const pointsFor: [number, number] = [0, 0];
  let rubbersDrawn = 0;
  let counted = 0;
  for (const r of rubbers) {
    if (r === null) continue;
    if (r.status === 'incomplete' || r.status === 'invalid') {
      return {
        outcome: 'incomplete',
        rubbersWon,
        rubbersDrawn,
        pointsFor,
        rubbersCounted: counted,
        reason: r.reason ?? r.status,
      };
    }
    counted += 1;
    pointsFor[0] += r.pointsFor[0];
    pointsFor[1] += r.pointsFor[1];
    if (r.status === 'draw') rubbersDrawn += 1;
    else if (r.winner === 1) rubbersWon[0] += 1;
    else if (r.winner === 2) rubbersWon[1] += 1;
  }
  const expected = options.expectedRubbers ?? rubbers.length;
  if (rubbers.filter((r) => r !== null).length < expected) {
    return {
      outcome: 'incomplete',
      rubbersWon,
      rubbersDrawn,
      pointsFor,
      rubbersCounted: counted,
      reason: 'not all rubbers have results',
    };
  }
  const base = { rubbersWon, rubbersDrawn, pointsFor, rubbersCounted: counted };
  if (rubbersWon[0] > rubbersWon[1]) return { outcome: 'home', ...base };
  if (rubbersWon[1] > rubbersWon[0]) return { outcome: 'away', ...base };

  switch (policy.tieBreak) {
    case 'aggregate_points':
      if (pointsFor[0] > pointsFor[1])
        return { outcome: 'home', ...base, reason: 'decided on aggregate points' };
      if (pointsFor[1] > pointsFor[0])
        return { outcome: 'away', ...base, reason: 'decided on aggregate points' };
      return { outcome: 'needs_review', ...base, reason: 'rubbers and aggregate points are level' };
    case 'draw_allowed':
      return { outcome: 'draw', ...base };
    case 'decider':
      return { outcome: 'needs_review', ...base, reason: 'a decider rubber is required' };
    case 'needs_review':
    default:
      return {
        outcome: 'needs_review',
        ...base,
        reason: 'rubbers are level and no tie-break is configured',
      };
  }
}
