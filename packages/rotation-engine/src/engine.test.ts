import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_VERSION,
  generateRotation,
  participantsFromHistory,
  type PlayedRound,
  type RotationInput,
  type RotationParticipant,
  type RotationResult,
} from './index';

const weights = { rest: 1, minutes: 1, partners: 1, opponents: 0.5, skill: 0.5 };

function players(n: number, extra: Partial<RotationParticipant> = {}): RotationParticipant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    available: true,
    minutesPlayed: 0,
    restCount: 0,
    consecutiveRests: 0,
    roundsPresent: 0,
    partnerHistory: {},
    opponentHistory: {},
    ...extra,
  }));
}

function courts(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, available: true }));
}

function input(overrides: Partial<RotationInput> = {}): RotationInput {
  return {
    occurrenceId: 'occ',
    sequence: 1,
    seed: 'seed',
    format: 'doubles',
    courts: courts(2),
    participants: players(11),
    pairLocks: [],
    rules: { genderMode: 'off', weights, candidates: 150 },
    ...overrides,
  };
}

function assertWellFormed(result: RotationResult, inp: RotationInput) {
  const eligible = new Set(inp.participants.filter((p) => p.available).map((p) => p.id));
  const ppc = inp.format === 'doubles' ? 4 : 2;
  const seen = new Set<string>();
  const courtsSeen = new Set<string>();
  for (const a of result.assignments) {
    expect(courtsSeen.has(a.courtId)).toBe(false);
    courtsSeen.add(a.courtId);
    expect(a.teams).toHaveLength(2);
    for (const team of a.teams) {
      expect(team).toHaveLength(ppc / 2);
      for (const id of team) {
        expect(eligible.has(id)).toBe(true);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  }
  for (const id of result.rests) {
    expect(eligible.has(id)).toBe(true);
    expect(seen.has(id)).toBe(false);
    seen.add(id);
  }
  if (!result.warnings.some((w) => w.code === 'UNSATISFIABLE')) {
    expect(seen.size).toBe(eligible.size);
  }
}

/** Plays N rounds, feeding history back each time. */
function simulate(
  base: RotationInput,
  rounds: number,
  arrivals: Record<number, string[]> = {},
): { results: RotationResult[]; history: PlayedRound[] } {
  const results: RotationResult[] = [];
  const history: PlayedRound[] = [];
  const roster = base.participants.map((p) => ({
    id: p.id,
    available: p.available,
    skill: p.skill,
    gender: p.gender,
  }));
  const presentIds = new Set(roster.filter((r) => r.available).map((r) => r.id));
  for (let seq = 1; seq <= rounds; seq++) {
    for (const id of arrivals[seq] ?? []) {
      presentIds.add(id);
      const r = roster.find((x) => x.id === id);
      if (r) r.available = true;
    }
    const participants = participantsFromHistory(
      roster.map((r) => ({ ...r, available: presentIds.has(r.id) })),
      history,
    );
    const inp = { ...base, sequence: seq, participants };
    const result = generateRotation(inp);
    assertWellFormed(result, inp);
    results.push(result);
    history.push({
      assignments: result.assignments,
      rests: result.rests,
      present: [...presentIds],
      minutesPlayed: 12,
    });
  }
  return { results, history };
}

describe('generateRotation', () => {
  it('is deterministic for the same seed and input', () => {
    const a = generateRotation(input());
    const b = generateRotation(input());
    expect(b).toEqual(a);
    expect(a.algorithmVersion).toBe(ALGORITHM_VERSION);
    const c = generateRotation(input({ seed: 'other' }));
    expect(JSON.stringify(c.assignments)).not.toBe(JSON.stringify(a.assignments));
  });

  it('fills 2 courts from 11 players and rests 3', () => {
    const result = generateRotation(input());
    assertWellFormed(result, input());
    expect(result.assignments).toHaveLength(2);
    expect(result.rests).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('distributes rests fairly over 6 rounds (11 players, 2 courts)', () => {
    const { history } = simulate(input(), 6);
    const final = participantsFromHistory(players(11), history);
    const rests = final.map((p) => p.restCount);
    expect(Math.max(...rests) - Math.min(...rests)).toBeLessThanOrEqual(1);
    expect(rests.reduce((a, b) => a + b, 0)).toBe(18);
    expect(Math.max(...final.map((p) => p.consecutiveRests))).toBeLessThanOrEqual(1);
  });

  it('avoids repeat partners when it can', () => {
    const { history } = simulate(input({ participants: players(8) }), 4);
    const final = participantsFromHistory(players(8), history);
    const maxRepeat = Math.max(...final.flatMap((p) => Object.values(p.partnerHistory)));
    // 8 players, 4 rounds: 7 possible partners each, so no partner twice.
    expect(maxRepeat).toBe(1);
  });

  it('never splits a hard-locked pair and never penalises them for being locked', () => {
    const base = input({ pairLocks: [{ a: 'p01', b: 'p02', kind: 'hard' }] });
    const { results } = simulate(base, 5);
    for (const r of results) {
      const together = r.assignments.some((a) =>
        a.teams.some((t) => t.includes('p01') && t.includes('p02')),
      );
      const bothRest = r.rests.includes('p01') && r.rests.includes('p02');
      expect(together || bothRest).toBe(true);
    }
  });

  it('reports a lock whose partner is unavailable instead of silently dropping it', () => {
    const ps = players(9);
    (ps[1] as RotationParticipant).available = false;
    const result = generateRotation(
      input({ participants: ps, pairLocks: [{ a: 'p01', b: 'p02', kind: 'hard' }] }),
    );
    expect(result.warnings.map((w) => w.code)).toContain('LOCK_PARTNER_UNAVAILABLE');
    assertWellFormed(result, input({ participants: ps }));
  });

  it('respects untilRound on locks', () => {
    const base = input({
      participants: players(8),
      pairLocks: [{ a: 'p01', b: 'p02', kind: 'hard', untilRound: 2 }],
    });
    const r1 = generateRotation({ ...base, sequence: 2 });
    expect(
      r1.assignments.some((a) => a.teams.some((t) => t.includes('p01') && t.includes('p02'))),
    ).toBe(true);
    // After the lock expires, 8 players over many seeds will eventually separate them.
    const separated = Array.from({ length: 20 }, (_, i) =>
      generateRotation({ ...base, sequence: 3, seed: `s${i}` }),
    ).some(
      (r) =>
        !r.assignments.some((a) => a.teams.some((t) => t.includes('p01') && t.includes('p02'))),
    );
    expect(separated).toBe(true);
  });

  it('reports strict gender rules that cannot be met rather than relaxing them', () => {
    const ps = players(4, { gender: 'F' });
    const result = generateRotation(
      input({
        participants: ps,
        courts: courts(1),
        rules: { genderMode: 'strict_mixed', weights },
      }),
    );
    expect(result.assignments).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain('UNSATISFIABLE');
  });

  it('honours strict_mixed when data allows and ignores undeclared players', () => {
    const ps = players(8);
    ps.forEach((p, i) => {
      if (i < 3) p.gender = 'F';
      else if (i < 6) p.gender = 'M';
      // two undeclared
    });
    const result = generateRotation(
      input({ participants: ps, rules: { genderMode: 'strict_mixed', weights, candidates: 400 } }),
    );
    expect(result.warnings).toEqual([]);
    for (const a of result.assignments) {
      for (const team of a.teams) {
        const g = team.map((id) => ps.find((p) => p.id === id)?.gender).filter(Boolean);
        if (g.length === 2) expect(g[0]).not.toBe(g[1]);
      }
    }
  });

  it('does not force a late arrival to rest in their first round', () => {
    const ps = players(12);
    (ps[11] as RotationParticipant).available = false; // p12 arrives at round 3
    const base = input({ participants: ps });
    const { results } = simulate(base, 3, { 3: ['p12'] });
    expect(results[2]?.rests).not.toContain('p12');
  });

  it('protects players at the consecutive rest limit', () => {
    const ps = players(11);
    (ps[0] as RotationParticipant).consecutiveRests = 2;
    (ps[0] as RotationParticipant).restCount = 2;
    (ps[0] as RotationParticipant).roundsPresent = 2;
    for (const p of ps.slice(1)) {
      p.roundsPresent = 2;
      p.minutesPlayed = 24;
    }
    const result = generateRotation(
      input({ participants: ps, rules: { genderMode: 'off', weights, maxConsecutiveRests: 2 } }),
    );
    expect(result.rests).not.toContain('p01');
  });

  it('handles singles and reports when there are not enough players', () => {
    const singles = generateRotation(
      input({ format: 'singles', participants: players(5), courts: courts(3) }),
    );
    assertWellFormed(
      singles,
      input({ format: 'singles', participants: players(5), courts: courts(3) }),
    );
    expect(singles.assignments).toHaveLength(2);
    expect(singles.rests).toHaveLength(1);

    const few = generateRotation(input({ participants: players(3) }));
    expect(few.assignments).toEqual([]);
    expect(few.warnings[0]?.code).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('balances skill when weights ask for it', () => {
    const ps = players(8);
    ps.forEach((p, i) => (p.skill = i < 4 ? 90 : 20));
    const result = generateRotation(
      input({
        participants: ps,
        rules: { genderMode: 'off', weights: { ...weights, skill: 5 }, candidates: 400 },
      }),
    );
    expect(result.metrics['skillImbalance']).toBe(0);
  });
});

describe('generateRotation (property)', () => {
  it('always produces well-formed rounds for random pools and courts', () => {
    let seedNo = 0;
    for (let trial = 0; trial < 150; trial++) {
      const n = 4 + ((trial * 7) % 37); // 4..40
      const c = 1 + (trial % 10); // 1..10
      const ps = players(n);
      for (let i = 0; i < n; i++) {
        if ((trial + i) % 6 === 0) (ps[i] as RotationParticipant).available = false;
        if ((trial + i) % 4 === 0)
          (ps[i] as RotationParticipant).gender = (trial + i) % 8 === 0 ? 'F' : 'M';
      }
      const locks = trial % 3 === 0 ? [{ a: 'p01', b: 'p02', kind: 'hard' as const }] : [];
      const inp = input({
        participants: ps,
        courts: courts(c),
        pairLocks: locks,
        format: trial % 5 === 0 ? 'singles' : 'doubles',
        seed: `trial-${seedNo++}`,
        rules: { genderMode: trial % 4 === 0 ? 'prefer_mixed' : 'off', weights, candidates: 40 },
      });
      const result = generateRotation(inp);
      assertWellFormed(result, inp);
      const eligible = inp.participants.filter((p) => p.available).length;
      const ppc = inp.format === 'doubles' ? 4 : 2;
      if (result.assignments.length > 0) {
        expect(result.assignments.length * ppc + result.rests.length).toBe(eligible);
        expect(result.assignments.length).toBeLessThanOrEqual(c);
      }
    }
  });
});
