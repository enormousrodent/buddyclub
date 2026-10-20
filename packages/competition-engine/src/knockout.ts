/**
 * Pools and knockout brackets (spec section 14, Phase 4). Pure: seeding into pools, qualifier
 * seeding, bracket construction with pruned byes, and source resolution. Nothing here knows about
 * the database; the API feeds it team ids and pool results.
 */

export interface PoolSpec {
  divisionId: string;
  capacity: number;
}

export interface Entrant {
  teamId: string;
  /** 1 = strongest. Unseeded entrants keep their input order after the seeded ones. */
  seed?: number | undefined;
}

export interface PoolDraw {
  divisionId: string;
  teamIds: string[];
}

/**
 * Snake seeding: seed 1 to pool A, 2 to B, ... P to the last pool, then P+1 back to the last pool
 * and so on, so every pool gets one strong, one weak. `sequential` fills pool by pool instead.
 */
export function seedPools(
  entrants: readonly Entrant[],
  pools: readonly PoolSpec[],
  mode: 'snake' | 'sequential' = 'snake',
): PoolDraw[] {
  if (pools.length === 0) throw new Error('at least one pool is required');
  const ids = entrants.map((e) => e.teamId);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate team ids');
  const capacity = pools.reduce((n, p) => n + p.capacity, 0);
  if (entrants.length > capacity)
    throw new Error(`${entrants.length} entrants exceed the pool capacity of ${capacity}`);
  const ordered = [...entrants]
    .map((e, index) => ({ ...e, index }))
    .sort((a, b) => {
      const sa = a.seed ?? Number.POSITIVE_INFINITY;
      const sb = b.seed ?? Number.POSITIVE_INFINITY;
      return sa === sb ? a.index - b.index : sa - sb;
    });
  const draw: PoolDraw[] = pools.map((p) => ({ divisionId: p.divisionId, teamIds: [] }));
  if (mode === 'sequential') {
    let pool = 0;
    for (const e of ordered) {
      while ((draw[pool] as PoolDraw).teamIds.length >= (pools[pool] as PoolSpec).capacity) pool++;
      (draw[pool] as PoolDraw).teamIds.push(e.teamId);
    }
    return draw;
  }
  const P = pools.length;
  let i = 0;
  let forward = true;
  for (const e of ordered) {
    // Find the next pool with room along the snake.
    let placed = false;
    for (let tries = 0; tries < P * 2 && !placed; tries++) {
      const pool = draw[i] as PoolDraw;
      const spec = pools[i] as PoolSpec;
      if (pool.teamIds.length < spec.capacity) {
        pool.teamIds.push(e.teamId);
        placed = true;
      }
      if (forward) {
        if (i === P - 1) forward = false;
        else i++;
      } else {
        if (i === 0) forward = true;
        else i--;
      }
    }
    if (!placed) throw new Error('no pool with capacity left');
  }
  return draw;
}

export interface Qualifier {
  divisionId: string;
  /** Finishing position in the pool, 1 = winner. */
  position: number;
}

export interface SeededQualifier extends Qualifier {
  seed: number;
}

/**
 * Seeds pool qualifiers for a standard bracket. Winners take 1..P in pool order. Runners-up are
 * placed so that seed s meets seed N+1-s and that opponent is the winner of the *next* pool, so a
 * pool's own winner and runner-up never meet in round 1 (for `advancePerPool` 2). Deeper
 * qualifiers follow the same rotation; `warnings` lists any same-pool round-1 pairing left.
 */
export function qualifierSeeds(
  pools: readonly string[],
  advancePerPool: number,
): { seeds: SeededQualifier[]; warnings: string[] } {
  const P = pools.length;
  const seeds: SeededQualifier[] = [];
  for (let position = 1; position <= advancePerPool; position++) {
    for (let j = 0; j < P; j++) {
      const divisionId = pools[j] as string;
      let seed: number;
      if (position === 1) seed = j + 1;
      else {
        // Pair with the winner of pool (j + position - 1) mod P, via seed = (position * P) - k.
        const partner = (j + position - 1) % P;
        seed = position * P - partner;
      }
      seeds.push({ divisionId, position, seed });
    }
  }
  seeds.sort((a, b) => a.seed - b.seed);
  const N = seeds.length;
  const warnings: string[] = [];
  const size = bracketSize(N);
  for (let s = 1; s <= size / 2; s++) {
    const a = seeds[s - 1];
    const b = seeds[size - s];
    if (a && b && a.divisionId === b.divisionId)
      warnings.push(`seeds ${a.seed} and ${b.seed} come from the same pool`);
  }
  return { seeds, warnings };
}

export function bracketSize(entrants: number): number {
  let size = 1;
  while (size < entrants) size *= 2;
  return Math.max(2, size);
}

/** Standard seed order for a bracket of `size`: [1, size, ...] such that 1 meets size last. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next: number[] = [];
    const n = order.length * 2;
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }
  return order;
}

export type BracketSource =
  | { type: 'seed'; seed: number }
  | { type: 'winner'; round: number; slot: number }
  | { type: 'loser'; round: number; slot: number };

export interface BracketFixture {
  round: number;
  slot: number;
  label: string;
  home: BracketSource;
  away: BracketSource;
  /** Third-place playoff: fed by the semi-final losers, played alongside the final. */
  thirdPlace: boolean;
}

export function roundLabel(round: number, rounds: number, thirdPlace = false): string {
  if (thirdPlace) return 'Third place';
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-final';
  if (fromEnd === 2) return 'Quarter-final';
  return `Round of ${2 ** (fromEnd + 1)}`;
}

/**
 * Builds a single-elimination bracket for `entrants` seeds (1..N). Byes are pruned: a round-1
 * fixture against a bye is dropped and the seed feeds the next round directly. Returns
 * 2^k - 1 fixtures minus pruned byes, plus the optional third-place playoff.
 */
export function buildKnockout(
  entrants: number,
  options: { thirdPlace?: boolean } = {},
): { fixtures: BracketFixture[]; rounds: number; size: number } {
  if (entrants < 2) throw new Error('a knockout needs at least two entrants');
  const size = bracketSize(entrants);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const fixtures: BracketFixture[] = [];
  // Round 1 from seed order; seeds above `entrants` are byes.
  const round1: Array<BracketFixture | { bye: BracketSource; slot: number }> = [];
  for (let slot = 1; slot <= size / 2; slot++) {
    const a = order[(slot - 1) * 2] as number;
    const b = order[(slot - 1) * 2 + 1] as number;
    const aBye = a > entrants;
    const bBye = b > entrants;
    if (aBye && bBye) throw new Error('bracket size too large for entrants');
    if (aBye || bBye) round1.push({ bye: { type: 'seed', seed: aBye ? b : a }, slot });
    else
      round1.push({
        round: 1,
        slot,
        label: roundLabel(1, rounds),
        home: { type: 'seed', seed: a },
        away: { type: 'seed', seed: b },
        thirdPlace: false,
      });
  }
  const sourceFor = (round: number, slot: number): BracketSource => {
    if (round === 1) {
      const r = round1[slot - 1] as (typeof round1)[number];
      return 'bye' in r ? r.bye : { type: 'winner', round: 1, slot };
    }
    return { type: 'winner', round, slot };
  };
  for (const r of round1) if (!('bye' in r)) fixtures.push(r);
  for (let round = 2; round <= rounds; round++) {
    const slots = size / 2 ** round;
    for (let slot = 1; slot <= slots; slot++) {
      fixtures.push({
        round,
        slot,
        label: roundLabel(round, rounds),
        home: sourceFor(round - 1, slot * 2 - 1),
        away: sourceFor(round - 1, slot * 2),
        thirdPlace: false,
      });
    }
  }
  if (options.thirdPlace && rounds >= 2) {
    fixtures.push({
      round: rounds,
      slot: 2,
      label: roundLabel(rounds, rounds, true),
      home: { type: 'loser', round: rounds - 1, slot: 1 },
      away: { type: 'loser', round: rounds - 1, slot: 2 },
      thirdPlace: true,
    });
  }
  return { fixtures, rounds, size };
}

export interface ResolvedFixture {
  round: number;
  slot: number;
  winner: string | null;
  loser: string | null;
}

/**
 * Resolves a source to a team id given the seed table and decided fixtures; null while unknown.
 */
export function resolveSource(
  source: BracketSource,
  seedTeams: ReadonlyMap<number, string>,
  decided: readonly ResolvedFixture[],
): string | null {
  if (source.type === 'seed') return seedTeams.get(source.seed) ?? null;
  const f = decided.find((d) => d.round === source.round && d.slot === source.slot);
  if (!f) return null;
  return source.type === 'winner' ? f.winner : f.loser;
}
