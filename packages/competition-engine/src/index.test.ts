import { REFERENCE_FOUR_RUBBER_TEMPLATE, StandingsRulesSchema } from '@buddyclub/rules-schema';
import { describe, expect, it } from 'vitest';
import {
  buildRoundRobin,
  computeProgression,
  computeStandings,
  expandFixture,
  type StandingsFixture,
} from './index';

describe('buildRoundRobin', () => {
  it('gives n(n-1)/2 unique fixtures for 2..12 teams and every team plays every other once', () => {
    for (let n = 2; n <= 12; n++) {
      const teams = Array.from({ length: n }, (_, i) => `t${i}`);
      const fixtures = buildRoundRobin(teams, `seed-${n}`);
      expect(fixtures).toHaveLength((n * (n - 1)) / 2);
      const pairs = new Set(fixtures.map((f) => [f.home, f.away].sort().join('|')));
      expect(pairs.size).toBe(fixtures.length);
      for (const t of teams) {
        expect(fixtures.filter((f) => f.home === t || f.away === t)).toHaveLength(n - 1);
      }
      // No team plays twice in a round.
      const rounds = new Map<number, string[]>();
      for (const f of fixtures)
        rounds.set(f.round, [...(rounds.get(f.round) ?? []), f.home, f.away]);
      for (const members of rounds.values()) expect(new Set(members).size).toBe(members.length);
    }
  });

  it('four teams: 6 fixtures in 3 rounds, deterministic per seed', () => {
    const a = buildRoundRobin(['NF', 'NTA', 'WIN', 'SOT'], 'meet-1');
    expect(a).toHaveLength(6);
    expect(new Set(a.map((f) => f.round))).toEqual(new Set([1, 2, 3]));
    expect(buildRoundRobin(['NF', 'NTA', 'WIN', 'SOT'], 'meet-1')).toEqual(a);
    expect(buildRoundRobin(['NF', 'NTA', 'WIN', 'SOT'], 'meet-2')).not.toEqual(a);
  });

  it('rejects duplicates and handles odd counts with a bye', () => {
    expect(() => buildRoundRobin(['a', 'a'])).toThrow();
    const five = buildRoundRobin(['a', 'b', 'c', 'd', 'e']);
    expect(five).toHaveLength(10);
  });
});

describe('expandFixture', () => {
  it('produces the four reference rubbers in order', () => {
    const rubbers = expandFixture(REFERENCE_FOUR_RUBBER_TEMPLATE);
    expect(rubbers.map((r) => r.rubberKey)).toEqual(['wd', 'md', 'xd1', 'xd2']);
    expect(rubbers[0]).toMatchObject({ format: 'doubles', eligibility: 'women' });
  });
});

const rules = StandingsRulesSchema.parse({});

function fx(
  id: string,
  home: string,
  away: string,
  rubbers: [number, number],
  pts: [number, number],
): StandingsFixture {
  return {
    fixtureId: id,
    home,
    away,
    outcome: rubbers[0] > rubbers[1] ? 'home' : rubbers[1] > rubbers[0] ? 'away' : 'draw',
    rubbersWon: rubbers,
    pointsFor: pts,
  };
}

describe('computeStandings', () => {
  it('ranks the spec example: New Forest +71 above NTA +15 on equal fixture wins', () => {
    const fixtures = [
      fx('1', 'NF', 'WIN', [4, 0], [168, 100]), // NF +68
      fx('2', 'NTA', 'SOT', [3, 1], [150, 130]), // NTA +20
      fx('3', 'NF', 'NTA', [1, 3], [120, 125]), // NF -5, NTA +5
      fx('4', 'WIN', 'SOT', [2, 2], [140, 140]), // draw-ish (not 2-2 policy here; given as draw)
      fx('5', 'NF', 'SOT', [3, 1], [138, 130]), // NF +8  => NF total +71
      fx('6', 'NTA', 'WIN', [1, 3], [120, 130]), // NTA -10 => NTA total +15
    ];
    const result = computeStandings(['NF', 'NTA', 'WIN', 'SOT'], fixtures, rules);
    const nf = result.rows.find((r) => r.teamId === 'NF')!;
    const nta = result.rows.find((r) => r.teamId === 'NTA')!;
    expect(nf.fixtureWins).toBe(2);
    expect(nta.fixtureWins).toBe(2);
    expect(nf.pointsDifference).toBe(71);
    expect(nta.pointsDifference).toBe(15);
    expect(nf.rank).toBe(1);
    expect(nta.rank).toBe(2);
    expect(result.unresolvedTies).toEqual([]);
  });

  it('reports ties the criteria cannot resolve instead of guessing', () => {
    const fixtures = [fx('1', 'A', 'B', [2, 2], [100, 100]), fx('2', 'C', 'D', [2, 2], [90, 90])];
    const result = computeStandings(['A', 'B', 'C', 'D'], fixtures, rules);
    expect(result.unresolvedTies).toEqual([['A', 'B', 'C', 'D']]);
    expect(result.rows.every((r) => r.rank === 1)).toBe(true);
    const shared = computeStandings(['A', 'B', 'C', 'D'], fixtures, {
      ...rules,
      finalTieResolution: 'shared_rank',
    });
    expect(shared.unresolvedTies).toEqual([]);
  });

  it('uses head-to-head as a mini-table among the tied group only', () => {
    // A, B, C all beat D; A beat B, B beat C, C beat A; points difference identical so h2h decides nothing
    // except when combined with a direct result between two teams.
    const fixtures = [
      fx('1', 'A', 'D', [4, 0], [84, 40]),
      fx('2', 'B', 'D', [4, 0], [84, 40]),
      fx('3', 'C', 'D', [4, 0], [84, 40]),
      fx('4', 'A', 'B', [3, 1], [80, 70]),
      fx('5', 'B', 'C', [3, 1], [80, 70]),
      fx('6', 'C', 'A', [3, 1], [80, 70]),
    ];
    const h2hRules = StandingsRulesSchema.parse({
      criteria: ['fixture_wins', 'head_to_head', 'points_difference'],
    });
    const result = computeStandings(['A', 'B', 'C', 'D'], fixtures, h2hRules);
    // A, B, C: 2 wins each, h2h mini-table 1 win each, +10 each: still level => unresolved tie of three.
    expect(result.unresolvedTies).toEqual([expect.arrayContaining(['A', 'B', 'C'])]);
    expect(result.rows.find((r) => r.teamId === 'D')!.rank).toBe(4);

    // Give A the better h2h points difference and the tie breaks within the group.
    const tweaked = fixtures.map((f) =>
      f.fixtureId === '4' ? fx('4', 'A', 'B', [3, 1], [90, 60]) : f,
    );
    const r2 = computeStandings(['A', 'B', 'C', 'D'], tweaked, h2hRules);
    expect(r2.rows.map((r) => r.teamId)).toEqual(['A', 'C', 'B', 'D']);
    expect(r2.unresolvedTies).toEqual([]);
  });
});

describe('computeProgression', () => {
  const divisions = [
    { divisionId: 'd1', ordinal: 1, rankedTeamIds: ['a1', 'a2', 'a3', 'a4'] },
    { divisionId: 'd2', ordinal: 2, rankedTeamIds: ['b1', 'b2', 'b3', 'b4'] },
    { divisionId: 'd3', ordinal: 3, rankedTeamIds: ['c1', 'c2', 'c3', 'c4'] },
  ];
  const rules = { promoteCount: 1, relegateCount: 1, highestOrdinal: 1 };

  it('moves one up and one down per division with boundary handling', () => {
    const result = computeProgression(divisions, rules);
    expect(result.warnings).toEqual([]);
    expect(result.nextAssignments['d1']!.sort()).toEqual(['a1', 'a2', 'a3', 'b1']);
    expect(result.nextAssignments['d2']!.sort()).toEqual(['a4', 'b2', 'b3', 'c1']);
    expect(result.nextAssignments['d3']!.sort()).toEqual(['b4', 'c2', 'c3', 'c4']);
    expect(result.moves.find((m) => m.teamId === 'a1')!.direction).toBe('stay');
    expect(result.moves.find((m) => m.teamId === 'c4')!.direction).toBe('stay');
    expect(result.moves.find((m) => m.teamId === 'b1')!.direction).toBe('up');
    expect(result.moves.find((m) => m.teamId === 'a4')!.direction).toBe('down');
  });

  it('respects a reversed ordinal convention', () => {
    const reversed = computeProgression(divisions, { ...rules, highestOrdinal: 3 });
    expect(reversed.nextAssignments['d3']!.sort()).toEqual(['b1', 'c1', 'c2', 'c3']);
  });
});
