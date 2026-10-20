import { describe, expect, it } from 'vitest';
import {
  bracketSize,
  buildKnockout,
  qualifierSeeds,
  resolveSource,
  seedOrder,
  seedPools,
} from './knockout';

describe('seedPools', () => {
  const pools = Array.from({ length: 8 }, (_, i) => ({ divisionId: `P${i}`, capacity: 4 }));

  it('snakes 32 seeded teams into 8 pools of 4 with one of each strength band per pool', () => {
    const entrants = Array.from({ length: 32 }, (_, i) => ({ teamId: `t${i + 1}`, seed: i + 1 }));
    const draw = seedPools(entrants, pools);
    expect(draw.every((d) => d.teamIds.length === 4)).toBe(true);
    expect(new Set(draw.flatMap((d) => d.teamIds)).size).toBe(32);
    // Pool A: seeds 1, 16, 17, 32. Pool H: 8, 9, 24, 25.
    expect(draw[0]!.teamIds).toEqual(['t1', 't16', 't17', 't32']);
    expect(draw[7]!.teamIds).toEqual(['t8', 't9', 't24', 't25']);
  });

  it('keeps unseeded entrants in input order after the seeded ones and respects capacity', () => {
    const entrants = [
      { teamId: 'x' },
      { teamId: 'y', seed: 2 },
      { teamId: 'z' },
      { teamId: 'w', seed: 1 },
    ];
    const draw = seedPools(entrants, [
      { divisionId: 'A', capacity: 2 },
      { divisionId: 'B', capacity: 2 },
    ]);
    expect(draw).toEqual([
      { divisionId: 'A', teamIds: ['w', 'z'] },
      { divisionId: 'B', teamIds: ['y', 'x'] },
    ]);
    expect(() => seedPools(entrants, [{ divisionId: 'A', capacity: 3 }])).toThrow(/capacity/);
    expect(() => seedPools([{ teamId: 'a' }, { teamId: 'a' }], pools)).toThrow(/duplicate/);
  });

  it('sequential mode fills pool by pool', () => {
    const draw = seedPools(
      [{ teamId: 'a' }, { teamId: 'b' }, { teamId: 'c' }],
      [
        { divisionId: 'A', capacity: 2 },
        { divisionId: 'B', capacity: 2 },
      ],
      'sequential',
    );
    expect(draw).toEqual([
      { divisionId: 'A', teamIds: ['a', 'b'] },
      { divisionId: 'B', teamIds: ['c'] },
    ]);
  });
});

describe('qualifierSeeds', () => {
  it('seeds 8 pool winners 1..8 and runners-up so no pool meets itself in round 1', () => {
    const poolsIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const { seeds, warnings } = qualifierSeeds(poolsIds, 2);
    expect(seeds).toHaveLength(16);
    expect(seeds.slice(0, 8).map((s) => s.divisionId)).toEqual(poolsIds);
    expect(new Set(seeds.map((s) => s.seed)).size).toBe(16);
    expect(warnings).toEqual([]);
    // Seed 1 (A1) meets seed 16: must be the runner-up of pool H? No: of the next pool, B.
    const sixteen = seeds.find((s) => s.seed === 16)!;
    expect(sixteen.position).toBe(2);
    expect(sixteen.divisionId).not.toBe('A');
    for (let s = 1; s <= 8; s++) {
      const a = seeds.find((q) => q.seed === s)!;
      const b = seeds.find((q) => q.seed === 17 - s)!;
      expect(a.divisionId).not.toBe(b.divisionId);
    }
  });

  it('works for two pools (A1 v B2, B1 v A2)', () => {
    const { seeds, warnings } = qualifierSeeds(['A', 'B'], 2);
    expect(warnings).toEqual([]);
    const bySeed = Object.fromEntries(seeds.map((s) => [s.seed, `${s.divisionId}${s.position}`]));
    expect(bySeed).toEqual({ 1: 'A1', 2: 'B1', 3: 'A2', 4: 'B2' });
  });
});

describe('buildKnockout', () => {
  it('16 entrants: 15 fixtures over 4 rounds, standard seed placement, labels', () => {
    const { fixtures, rounds, size } = buildKnockout(16);
    expect(size).toBe(16);
    expect(rounds).toBe(4);
    expect(fixtures).toHaveLength(15);
    const r1 = fixtures.filter((f) => f.round === 1);
    expect(r1).toHaveLength(8);
    expect(r1[0]).toMatchObject({
      home: { type: 'seed', seed: 1 },
      away: { type: 'seed', seed: 16 },
    });
    expect(r1[1]).toMatchObject({
      home: { type: 'seed', seed: 8 },
      away: { type: 'seed', seed: 9 },
    });
    expect(fixtures.find((f) => f.round === 4)!.label).toBe('Final');
    expect(fixtures.find((f) => f.round === 3)!.label).toBe('Semi-final');
    expect(fixtures.find((f) => f.round === 2)!.label).toBe('Quarter-final');
    expect(fixtures.find((f) => f.round === 1)!.label).toBe('Round of 16');
    const final = fixtures.find((f) => f.round === 4)!;
    expect(final.home).toEqual({ type: 'winner', round: 3, slot: 1 });
    expect(final.away).toEqual({ type: 'winner', round: 3, slot: 2 });
  });

  it('prunes byes: 6 entrants give an 8-bracket with 2 round-1 fixtures and seeds 1 and 2 waiting in round 2', () => {
    const { fixtures } = buildKnockout(6);
    expect(fixtures.filter((f) => f.round === 1)).toHaveLength(2);
    expect(fixtures).toHaveLength(5);
    const semis = fixtures.filter((f) => f.round === 2);
    expect(semis[0]!.home).toEqual({ type: 'seed', seed: 1 });
    expect(semis[0]!.away).toEqual({ type: 'winner', round: 1, slot: 2 });
    expect(semis[1]!.home).toEqual({ type: 'seed', seed: 2 });
    expect(semis[1]!.away).toEqual({ type: 'winner', round: 1, slot: 4 });
  });

  it('adds a third-place playoff fed by the semi-final losers', () => {
    const { fixtures } = buildKnockout(4, { thirdPlace: true });
    expect(fixtures).toHaveLength(4);
    const third = fixtures.find((f) => f.thirdPlace)!;
    expect(third).toMatchObject({
      round: 2,
      slot: 2,
      label: 'Third place',
      home: { type: 'loser', round: 1, slot: 1 },
      away: { type: 'loser', round: 1, slot: 2 },
    });
  });

  it('is deterministic and never pairs a seed with itself; every seed appears once in round 1 or a bye', () => {
    for (let n = 2; n <= 40; n++) {
      const a = buildKnockout(n);
      const b = buildKnockout(n);
      expect(a).toEqual(b);
      const seeds = a.fixtures.flatMap((f) =>
        [f.home, f.away].filter((s) => s.type === 'seed').map((s) => (s as { seed: number }).seed),
      );
      expect(new Set(seeds).size).toBe(n);
      expect(a.fixtures.filter((f) => !f.thirdPlace)).toHaveLength(n - 1);
      for (const f of a.fixtures) expect(f.home).not.toEqual(f.away);
    }
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSize(17)).toBe(32);
  });
});

describe('resolveSource', () => {
  it('resolves seeds immediately and winners/losers once the feeder is decided', () => {
    const seedTeams = new Map([
      [1, 'A'],
      [2, 'B'],
    ]);
    expect(resolveSource({ type: 'seed', seed: 1 }, seedTeams, [])).toBe('A');
    expect(resolveSource({ type: 'winner', round: 1, slot: 1 }, seedTeams, [])).toBeNull();
    const decided = [{ round: 1, slot: 1, winner: 'B', loser: 'A' }];
    expect(resolveSource({ type: 'winner', round: 1, slot: 1 }, seedTeams, decided)).toBe('B');
    expect(resolveSource({ type: 'loser', round: 1, slot: 1 }, seedTeams, decided)).toBe('A');
  });
});
