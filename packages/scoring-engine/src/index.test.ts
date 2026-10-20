import { ScoringRulesSchema, type FixtureOutcomePolicy } from '@buddyclub/rules-schema';
import { describe, expect, it } from 'vitest';
import {
  evaluateFixture,
  evaluateGame,
  evaluateRubber,
  forfeitRubber,
  type RubberResult,
} from './index';

const straight21 = ScoringRulesSchema.parse({ targetPoints: 21 });
const winByTwo = ScoringRulesSchema.parse({ targetPoints: 21, winBy: 2, cap: 30 });
const bestOfThree = ScoringRulesSchema.parse({
  targetPoints: 21,
  winBy: 2,
  cap: 30,
  setsPerRubber: 3,
});

describe('evaluateGame', () => {
  it('21 straight: first to 21 wins, nothing beyond', () => {
    expect(evaluateGame([21, 19], straight21)).toMatchObject({ valid: true, winner: 1 });
    expect(evaluateGame([20, 21], straight21)).toMatchObject({ valid: true, winner: 2 });
    expect(evaluateGame([22, 20], straight21).valid).toBe(false);
    expect(evaluateGame([21, 21], straight21).valid).toBe(false);
    expect(evaluateGame([18, 15], straight21).valid).toBe(false);
  });

  it('win by two with a cap of 30', () => {
    expect(evaluateGame([21, 19], winByTwo)).toMatchObject({ valid: true, winner: 1 });
    expect(evaluateGame([21, 20], winByTwo).valid).toBe(false);
    expect(evaluateGame([22, 20], winByTwo)).toMatchObject({ valid: true, winner: 1 });
    expect(evaluateGame([23, 21], winByTwo)).toMatchObject({ valid: true, winner: 1 });
    expect(evaluateGame([23, 20], winByTwo).valid).toBe(false);
    expect(evaluateGame([30, 29], winByTwo)).toMatchObject({ valid: true, winner: 1 });
    expect(evaluateGame([31, 29], winByTwo).valid).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(evaluateGame([-1, 21], straight21).valid).toBe(false);
    expect(evaluateGame([21.5, 3], straight21).valid).toBe(false);
  });
});

describe('evaluateRubber', () => {
  it('single game rubber', () => {
    const r = evaluateRubber([[21, 15]], straight21);
    expect(r).toMatchObject({
      status: 'complete',
      winner: 1,
      gamesWon: [1, 0],
      pointsFor: [21, 15],
    });
  });

  it('best of three stops when decided and rejects extra games', () => {
    expect(
      evaluateRubber(
        [
          [21, 15],
          [19, 21],
          [21, 23],
        ],
        bestOfThree,
      ),
    ).toMatchObject({ status: 'complete', winner: 2, gamesWon: [1, 2] });
    expect(
      evaluateRubber(
        [
          [21, 15],
          [21, 17],
        ],
        bestOfThree,
      ),
    ).toMatchObject({ status: 'complete', winner: 1 });
    expect(
      evaluateRubber(
        [
          [21, 15],
          [21, 17],
          [21, 10],
        ],
        bestOfThree,
      ).status,
    ).toBe('invalid');
    expect(evaluateRubber([[21, 15]], bestOfThree).status).toBe('incomplete');
  });

  it('propagates an invalid game', () => {
    const r = evaluateRubber([[21, 20]], winByTwo);
    expect(r.status).toBe('invalid');
    expect(r.reason).toMatch(/game 1/);
  });

  it('two-set rubbers can draw only when allowed', () => {
    const twoSets = ScoringRulesSchema.parse({
      targetPoints: 21,
      setsPerRubber: 2,
      allowDraw: true,
    });
    expect(
      evaluateRubber(
        [
          [21, 15],
          [10, 21],
        ],
        twoSets,
      ),
    ).toMatchObject({ status: 'draw', winner: null });
    const noDraw = ScoringRulesSchema.parse({ targetPoints: 21, setsPerRubber: 2 });
    expect(
      evaluateRubber(
        [
          [21, 15],
          [10, 21],
        ],
        noDraw,
      ).status,
    ).toBe('incomplete');
  });

  it('forfeits follow the policy', () => {
    expect(forfeitRubber(2, straight21)).toMatchObject({
      status: 'complete',
      winner: 2,
      pointsFor: [0, 21],
    });
    const voided = ScoringRulesSchema.parse({ targetPoints: 21, forfeitPolicy: 'void' });
    expect(forfeitRubber(1, voided)).toBeNull();
    const only = ScoringRulesSchema.parse({ targetPoints: 21, forfeitPolicy: 'award_target_only' });
    expect(forfeitRubber(1, only)).toMatchObject({ winner: 1, pointsFor: [0, 0] });
  });
});

function rubber(winner: 1 | 2, pts: [number, number]): RubberResult {
  return {
    status: 'complete',
    winner,
    games: [],
    gamesWon: winner === 1 ? [1, 0] : [0, 1],
    pointsFor: pts,
  };
}

describe('evaluateFixture', () => {
  const policy = (tieBreak: FixtureOutcomePolicy['tieBreak']): FixtureOutcomePolicy => ({
    primary: 'most_rubbers',
    tieBreak,
  });

  it('most rubbers wins and points aggregate', () => {
    const f = evaluateFixture(
      [rubber(1, [21, 10]), rubber(1, [21, 12]), rubber(2, [15, 21]), rubber(1, [21, 19])],
      policy('needs_review'),
    );
    expect(f).toMatchObject({ outcome: 'home', rubbersWon: [3, 1], pointsFor: [78, 62] });
  });

  it('2-2 branches by policy and never invents a winner', () => {
    const level = [
      rubber(1, [21, 10]),
      rubber(1, [21, 19]),
      rubber(2, [15, 21]),
      rubber(2, [18, 21]),
    ];
    expect(evaluateFixture(level, policy('needs_review')).outcome).toBe('needs_review');
    expect(evaluateFixture(level, policy('draw_allowed')).outcome).toBe('draw');
    expect(evaluateFixture(level, policy('decider')).outcome).toBe('needs_review');
    expect(evaluateFixture(level, policy('aggregate_points'))).toMatchObject({
      outcome: 'home',
      pointsFor: [75, 71],
    });
    const dead = [rubber(1, [21, 10]), rubber(2, [10, 21])];
    expect(evaluateFixture(dead, policy('aggregate_points')).outcome).toBe('needs_review');
  });

  it('is incomplete until every rubber has a result', () => {
    expect(
      evaluateFixture([rubber(1, [21, 10]), null, null, null], policy('needs_review'), {
        expectedRubbers: 4,
      }).outcome,
    ).toBe('incomplete');
    expect(
      evaluateFixture(
        [rubber(1, [21, 10]), { ...rubber(2, [0, 0]), status: 'incomplete' }],
        policy('needs_review'),
      ).outcome,
    ).toBe('incomplete');
  });
});
