/**
 * Competition engine (spec sections 9.1, 9.3). Pure TypeScript: fixture generation, standings and
 * promotion/relegation. Ties that the configured criteria cannot resolve are reported, never broken
 * by team name.
 */
import type {
  ProgressionRules,
  RubberTemplateEntry,
  StandingsRules,
} from '@buddyclub/rules-schema';

export const COMPETITION_ENGINE_VERSION = 'competition-engine@0.1.0';

function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let a = hashSeed(seed) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface RoundRobinFixture {
  round: number;
  home: string;
  away: string;
}

/**
 * Circle-method round robin: every unordered pair exactly once, n(n-1)/2 fixtures, n-1 rounds for
 * even n (n rounds with a bye for odd n). The seed only affects the initial order (home/away balance).
 */
export function buildRoundRobin(
  teamIds: readonly string[],
  seed = 'round-robin',
): RoundRobinFixture[] {
  const unique = [...new Set(teamIds)];
  if (unique.length !== teamIds.length) throw new Error('duplicate team ids');
  if (unique.length < 2) return [];
  const teams: (string | null)[] = seededShuffle(unique, seed);
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const fixtures: RoundRobinFixture[] = [];
  const rotating = teams.slice(1);
  for (let round = 1; round < n; round++) {
    const lineup = [teams[0] as string | null, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = lineup[i] as string | null;
      const b = lineup[n - 1 - i] as string | null;
      if (a === null || b === null) continue;
      // Alternate home/away so no team is always at home.
      const swap = (round + i) % 2 === 1;
      fixtures.push({ round, home: swap ? b : a, away: swap ? a : b });
    }
    rotating.unshift(rotating.pop() as string | null);
  }
  return fixtures;
}

export interface Rubber {
  rubberKey: string;
  label: string;
  format: RubberTemplateEntry['format'];
  eligibility: RubberTemplateEntry['eligibility'];
  order: number;
}

/** Expands a fixture into its named rubbers in template order. */
export function expandFixture(template: readonly RubberTemplateEntry[]): Rubber[] {
  return [...template]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      rubberKey: t.key,
      label: t.label,
      format: t.format,
      eligibility: t.eligibility,
      order: t.order,
    }));
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

/** A decided fixture as standings input. Only confirmed results belong here. */
export interface StandingsFixture {
  fixtureId: string;
  home: string;
  away: string;
  outcome: 'home' | 'away' | 'draw';
  rubbersWon: [number, number];
  pointsFor: [number, number];
}

export interface StandingRow {
  teamId: string;
  rank: number;
  played: number;
  fixtureWins: number;
  fixtureDraws: number;
  fixtureLosses: number;
  rubbersWon: number;
  rubbersLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDifference: number;
  /** Teams this row is level with after all criteria (empty when fully ranked). */
  tiedWith: string[];
}

export interface StandingsResult {
  rows: StandingRow[];
  unresolvedTies: string[][];
  criteria: StandingsRules['criteria'];
}

type Aggregate = Omit<StandingRow, 'rank' | 'tiedWith'>;

function aggregate(
  teamIds: readonly string[],
  fixtures: readonly StandingsFixture[],
): Map<string, Aggregate> {
  const table = new Map<string, Aggregate>();
  for (const id of teamIds) {
    table.set(id, {
      teamId: id,
      played: 0,
      fixtureWins: 0,
      fixtureDraws: 0,
      fixtureLosses: 0,
      rubbersWon: 0,
      rubbersLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsDifference: 0,
    });
  }
  for (const f of fixtures) {
    const h = table.get(f.home);
    const a = table.get(f.away);
    if (!h || !a) continue;
    h.played += 1;
    a.played += 1;
    h.rubbersWon += f.rubbersWon[0];
    h.rubbersLost += f.rubbersWon[1];
    a.rubbersWon += f.rubbersWon[1];
    a.rubbersLost += f.rubbersWon[0];
    h.pointsFor += f.pointsFor[0];
    h.pointsAgainst += f.pointsFor[1];
    a.pointsFor += f.pointsFor[1];
    a.pointsAgainst += f.pointsFor[0];
    if (f.outcome === 'home') {
      h.fixtureWins += 1;
      a.fixtureLosses += 1;
    } else if (f.outcome === 'away') {
      a.fixtureWins += 1;
      h.fixtureLosses += 1;
    } else {
      h.fixtureDraws += 1;
      a.fixtureDraws += 1;
    }
  }
  for (const row of table.values()) row.pointsDifference = row.pointsFor - row.pointsAgainst;
  return table;
}

/** Key for one criterion; higher sorts first. Head-to-head uses a mini-table over the group only. */
function criterionKey(
  criterion: StandingsRules['criteria'][number],
  teamId: string,
  group: readonly string[],
  table: Map<string, Aggregate>,
  fixtures: readonly StandingsFixture[],
): number[] {
  const row = table.get(teamId) as Aggregate;
  switch (criterion) {
    case 'fixture_wins':
      return [row.fixtureWins];
    case 'points_difference':
      return [row.pointsDifference];
    case 'rubbers_won':
      return [row.rubbersWon];
    case 'points_scored':
      return [row.pointsFor];
    case 'fixture_draws':
      return [row.fixtureDraws];
    case 'disciplinary_points':
      return [0]; // future: lower is better; not modelled yet
    case 'head_to_head': {
      const members = new Set(group);
      const mini = aggregate(
        group,
        fixtures.filter((f) => members.has(f.home) && members.has(f.away)),
      );
      const m = mini.get(teamId) as Aggregate;
      return [m.fixtureWins, m.pointsDifference, m.rubbersWon];
    }
  }
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Applies the ordered criteria lexicographically with group refinement: each criterion only
 * separates teams still level after the previous ones. Remaining groups are reported as
 * unresolved ties (or share a rank when the rules say so).
 */
export function computeStandings(
  teamIds: readonly string[],
  fixtures: readonly StandingsFixture[],
  rules: StandingsRules,
): StandingsResult {
  const table = aggregate(teamIds, fixtures);
  let groups: string[][] = [[...teamIds]];
  for (const criterion of rules.criteria) {
    const next: string[][] = [];
    for (const group of groups) {
      if (group.length === 1) {
        next.push(group);
        continue;
      }
      const keyed = group.map((id) => ({
        id,
        key: criterionKey(criterion, id, group, table, fixtures),
      }));
      keyed.sort((x, y) => compareKeys(x.key, y.key));
      let current: string[] = [];
      let currentKey: number[] | null = null;
      for (const k of keyed) {
        if (currentKey && compareKeys(currentKey, k.key) === 0) current.push(k.id);
        else {
          if (current.length) next.push(current);
          current = [k.id];
          currentKey = k.key;
        }
      }
      if (current.length) next.push(current);
    }
    groups = next;
  }

  const rows: StandingRow[] = [];
  const unresolvedTies: string[][] = [];
  let position = 1;
  for (const group of groups) {
    const tied = group.length > 1;
    if (tied) unresolvedTies.push([...group]);
    for (const id of group) {
      const base = table.get(id) as Aggregate;
      rows.push({ ...base, rank: position, tiedWith: tied ? group.filter((g) => g !== id) : [] });
    }
    position += group.length;
  }
  return {
    rows,
    unresolvedTies: rules.finalTieResolution === 'shared_rank' ? [] : unresolvedTies,
    criteria: rules.criteria,
  };
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export interface DivisionRanking {
  divisionId: string;
  ordinal: number;
  /** Fully ranked team ids, best first. Must not contain unresolved ties. */
  rankedTeamIds: string[];
}

export interface ProgressionMove {
  teamId: string;
  fromDivisionId: string;
  toDivisionId: string;
  direction: 'up' | 'down' | 'stay';
}

export interface ProgressionResult {
  moves: ProgressionMove[];
  /** Next meet's assignment: division id -> team ids (unordered). */
  nextAssignments: Record<string, string[]>;
  warnings: string[];
}

/**
 * Top `promoteCount` of each division move to the division above, bottom `relegateCount` move
 * below; the highest and lowest divisions keep their boundary teams (spec section 9.3).
 */
export function computeProgression(
  divisions: readonly DivisionRanking[],
  rules: ProgressionRules,
): ProgressionResult {
  const ordered = [...divisions].sort((a, b) => a.ordinal - b.ordinal);
  const highestFirst = rules.highestOrdinal === 1;
  const ladder = highestFirst ? ordered : ordered.reverse(); // index 0 = highest division
  const moves: ProgressionMove[] = [];
  const next: Record<string, string[]> = Object.fromEntries(
    ladder.map((d) => [d.divisionId, [] as string[]]),
  );
  const warnings: string[] = [];

  ladder.forEach((division, index) => {
    const above = ladder[index - 1];
    const below = ladder[index + 1];
    const ids = division.rankedTeamIds;
    if (ids.length < rules.promoteCount + rules.relegateCount) {
      warnings.push(`${division.divisionId}: fewer teams than promotion plus relegation slots`);
    }
    ids.forEach((teamId, pos) => {
      let to = division.divisionId;
      let direction: ProgressionMove['direction'] = 'stay';
      if (above && pos < rules.promoteCount) {
        to = above.divisionId;
        direction = 'up';
      } else if (below && pos >= ids.length - rules.relegateCount) {
        to = below.divisionId;
        direction = 'down';
      }
      (next[to] as string[]).push(teamId);
      moves.push({ teamId, fromDivisionId: division.divisionId, toDivisionId: to, direction });
    });
  });

  const seen = new Set<string>();
  for (const ids of Object.values(next)) {
    for (const id of ids) {
      if (seen.has(id)) warnings.push(`${id} assigned twice`);
      seen.add(id);
    }
  }
  return { moves, nextAssignments: next, warnings };
}

export * from './knockout';
