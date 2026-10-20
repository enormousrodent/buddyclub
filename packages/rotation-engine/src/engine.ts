import { createRng, type Rng } from './prng';
import type {
  PairLock,
  RotationAssignment,
  RotationInput,
  RotationParticipant,
  RotationResult,
  RotationWarning,
} from './types';

export const ALGORITHM_VERSION = 'social_doubles_v1';

const GENDER_WEIGHT = 1.5;
const SOFT_LOCK_BONUS = 2;

type Unit = string[]; // 1 or 2 participant ids that must stay together

interface Ctx {
  byId: Map<string, RotationParticipant>;
  input: RotationInput;
  rng: Rng;
  warnings: RotationWarning[];
  teamSize: number;
  playersPerCourt: number;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function history(table: Record<string, number> | undefined, other: string): number {
  return table?.[other] ?? 0;
}

function mutualHistory(
  byId: Map<string, RotationParticipant>,
  a: string,
  b: string,
  kind: 'partnerHistory' | 'opponentHistory',
): number {
  return Math.max(history(byId.get(a)?.[kind], b), history(byId.get(b)?.[kind], a));
}

/** Resolves hard locks into units and reports any that cannot apply. */
function buildUnits(
  ctx: Ctx,
  eligible: RotationParticipant[],
): { units: Unit[]; softLocks: PairLock[] } {
  const { input, warnings } = ctx;
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const locked = new Set<string>();
  const units: Unit[] = [];
  const softLocks: PairLock[] = [];

  const active = input.pairLocks.filter(
    (lock) => lock.untilRound === undefined || input.sequence <= lock.untilRound,
  );
  for (const lock of active) {
    if (lock.a === lock.b) continue;
    if (lock.kind === 'soft') {
      if (eligibleIds.has(lock.a) && eligibleIds.has(lock.b)) softLocks.push(lock);
      continue;
    }
    if (input.format === 'singles') {
      warnings.push({
        code: 'LOCK_IGNORED_SINGLES',
        detail: `Partner lock ${lock.a}/${lock.b} does not apply to singles`,
      });
      continue;
    }
    const aIn = eligibleIds.has(lock.a);
    const bIn = eligibleIds.has(lock.b);
    if (!aIn || !bIn) {
      if (aIn || bIn) {
        warnings.push({
          code: 'LOCK_PARTNER_UNAVAILABLE',
          detail: `Partner lock ${lock.a}/${lock.b}: ${aIn ? lock.b : lock.a} is not available this round`,
        });
      }
      continue;
    }
    if (locked.has(lock.a) || locked.has(lock.b)) {
      warnings.push({
        code: 'LOCK_CONFLICT',
        detail: `Partner lock ${lock.a}/${lock.b} conflicts with an earlier lock; ignored`,
      });
      continue;
    }
    locked.add(lock.a);
    locked.add(lock.b);
    units.push([lock.a, lock.b]);
  }
  for (const p of eligible) if (!locked.has(p.id)) units.push([p.id]);
  return { units, softLocks };
}

/**
 * Lower score = should rest sooner. Uses shares (per round present) so a late arrival sits in the
 * middle of the order rather than being forced to rest first or never.
 */
function restPriority(ctx: Ctx, eligible: RotationParticipant[]): Map<string, number> {
  const { weights } = ctx.input.rules;
  const present = eligible.filter((p) => p.roundsPresent > 0);
  const meanRestShare = present.length
    ? present.reduce((s, p) => s + p.restCount / p.roundsPresent, 0) / present.length
    : 0;
  const meanMinutesPerRound = present.length
    ? present.reduce((s, p) => s + p.minutesPlayed / p.roundsPresent, 0) / present.length
    : 0;
  const maxMinutesPerRound = Math.max(
    1,
    ...present.map((p) => p.minutesPlayed / p.roundsPresent),
    meanMinutesPerRound,
  );
  const scores = new Map<string, number>();
  for (const p of eligible) {
    const restShare = p.roundsPresent > 0 ? p.restCount / p.roundsPresent : meanRestShare;
    const minutesShare =
      (p.roundsPresent > 0 ? p.minutesPlayed / p.roundsPresent : meanMinutesPerRound) /
      maxMinutesPerRound;
    const score =
      weights.rest * restShare +
      weights.rest * 0.5 * p.consecutiveRests -
      weights.minutes * minutesShare +
      ctx.rng.next() * 1e-6; // deterministic tie-break
    scores.set(p.id, score);
  }
  return scores;
}

/** Chooses which units rest so that exactly `restNeeded` players sit out, honouring unit sizes. */
function chooseResting(
  ctx: Ctx,
  units: Unit[],
  priority: Map<string, number>,
  restNeeded: number,
): { resting: Set<string>; playingUnits: Unit[] } {
  const { maxConsecutiveRests } = ctx.input.rules;
  const protectedIds = new Set(
    [...ctx.byId.values()]
      .filter((p) => maxConsecutiveRests !== undefined && p.consecutiveRests >= maxConsecutiveRests)
      .map((p) => p.id),
  );
  const unitScore = (u: Unit) => u.reduce((s, id) => s + (priority.get(id) ?? 0), 0) / u.length;
  const ordered = [...units].sort((a, b) => {
    const pa = a.some((id) => protectedIds.has(id)) ? 1 : 0;
    const pb = b.some((id) => protectedIds.has(id)) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return unitScore(a) - unitScore(b);
  });

  const resting = new Set<string>();
  let remaining = restNeeded;
  for (const unit of ordered) {
    if (remaining <= 0) break;
    if (unit.length > remaining) continue;
    for (const id of unit) resting.add(id);
    remaining -= unit.length;
  }
  for (const id of resting) {
    if (protectedIds.has(id)) {
      ctx.warnings.push({
        code: 'MAX_CONSECUTIVE_RESTS_EXCEEDED',
        detail: `${id} rests again despite reaching the consecutive rest limit`,
      });
    }
  }
  const playingUnits = units.filter((u) => !u.some((id) => resting.has(id)));
  return { resting, playingUnits };
}

function genderViolation(ctx: Ctx, team: string[]): boolean {
  const mode = ctx.input.rules.genderMode;
  if (mode === 'off' || team.length < 2) return false;
  const labels = team.map((id) => ctx.byId.get(id)?.gender).filter((g): g is string => !!g);
  if (labels.length < team.length) return false; // missing data is never a violation
  const same = labels.every((g) => g === labels[0]);
  if (mode === 'prefer_same' || mode === 'strict_same') return !same;
  return same; // prefer_mixed / strict_mixed
}

interface Candidate {
  assignments: RotationAssignment[];
  score: number;
  partnerPenalty: number;
  opponentPenalty: number;
  skillImbalance: number;
  genderPenalty: number;
  valid: boolean;
}

function scoreCandidate(
  ctx: Ctx,
  teams: string[][],
  softLocks: PairLock[],
  courtIds: string[],
): Candidate {
  const { weights, genderMode } = ctx.input.rules;
  const strict = genderMode.startsWith('strict');
  let partnerPenalty = 0;
  let genderPenalty = 0;
  let valid = true;
  const softSet = new Set(softLocks.map((l) => pairKey(l.a, l.b)));

  for (const team of teams) {
    if (team.length === 2) {
      const [a, b] = team as [string, string];
      partnerPenalty += mutualHistory(ctx.byId, a, b, 'partnerHistory');
      if (softSet.has(pairKey(a, b))) partnerPenalty -= SOFT_LOCK_BONUS;
      if (genderViolation(ctx, team)) {
        if (strict) valid = false;
        genderPenalty += 1;
      }
    }
  }

  const knownSkills = [...ctx.byId.values()]
    .map((p) => p.skill)
    .filter((s): s is number => typeof s === 'number');
  const defaultSkill = knownSkills.length
    ? knownSkills.reduce((a, b) => a + b, 0) / knownSkills.length
    : 0;
  const skillOf = (id: string) => ctx.byId.get(id)?.skill ?? defaultSkill;

  const assignments: RotationAssignment[] = [];
  let opponentPenalty = 0;
  let skillImbalance = 0;
  for (let i = 0; i + 1 < teams.length; i += 2) {
    const t1 = teams[i] as string[];
    const t2 = teams[i + 1] as string[];
    for (const a of t1)
      for (const b of t2) opponentPenalty += mutualHistory(ctx.byId, a, b, 'opponentHistory');
    const s1 = t1.reduce((s, id) => s + skillOf(id), 0);
    const s2 = t2.reduce((s, id) => s + skillOf(id), 0);
    skillImbalance += Math.abs(s1 - s2) / ctx.teamSize;
    assignments.push({ courtId: courtIds[assignments.length] as string, teams: [t1, t2] });
  }

  const score =
    weights.partners * partnerPenalty +
    weights.opponents * opponentPenalty +
    weights.skill * skillImbalance +
    GENDER_WEIGHT * genderPenalty;
  return {
    assignments,
    score,
    partnerPenalty,
    opponentPenalty,
    skillImbalance,
    genderPenalty,
    valid,
  };
}

/** Builds one random arrangement of the playing units into teams, keeping locked units intact. */
function randomTeams(ctx: Ctx, playingUnits: Unit[]): string[][] {
  if (ctx.teamSize === 1) {
    return ctx.rng.shuffle(playingUnits.flat()).map((id) => [id]);
  }
  const fixed = playingUnits.filter((u) => u.length === 2);
  const singles = ctx.rng.shuffle(playingUnits.filter((u) => u.length === 1).flat());
  const teams: string[][] = fixed.map((u) => [...u]);
  for (let i = 0; i + 1 < singles.length; i += 2)
    teams.push([singles[i] as string, singles[i + 1] as string]);
  return ctx.rng.shuffle(teams);
}

export function generateRotation(input: RotationInput): RotationResult {
  const rng = createRng(
    `${input.seed}:${input.occurrenceId}:${input.sequence}:${ALGORITHM_VERSION}`,
  );
  const playersPerCourt = input.format === 'doubles' ? 4 : 2;
  const ctx: Ctx = {
    byId: new Map(input.participants.map((p) => [p.id, p])),
    input,
    rng,
    warnings: [],
    teamSize: playersPerCourt / 2,
    playersPerCourt,
  };
  const eligible = input.participants.filter((p) => p.available);
  const courts = input.courts.filter((c) => c.available);
  const finish = (
    assignments: RotationAssignment[],
    rests: string[],
    extra: Record<string, number> = {},
  ): RotationResult => ({
    assignments,
    rests,
    warnings: ctx.warnings,
    metrics: { eligible: eligible.length, courts: courts.length, ...extra },
    algorithmVersion: ALGORITHM_VERSION,
  });

  if (courts.length === 0) {
    ctx.warnings.push({ code: 'NO_COURTS', detail: 'No available courts' });
    return finish(
      [],
      eligible.map((p) => p.id),
    );
  }
  if (eligible.length < playersPerCourt) {
    ctx.warnings.push({
      code: 'NOT_ENOUGH_PLAYERS',
      detail: `${eligible.length} available; ${playersPerCourt} needed for one ${input.format} court`,
    });
    return finish(
      [],
      eligible.map((p) => p.id),
    );
  }

  const { units, softLocks } = buildUnits(ctx, eligible);
  const priority = restPriority(ctx, eligible);

  let capacity = Math.min(
    courts.length * playersPerCourt,
    Math.floor(eligible.length / playersPerCourt) * playersPerCourt,
  );
  let chosen: { resting: Set<string>; playingUnits: Unit[] } | null = null;
  while (capacity >= playersPerCourt) {
    const attempt = chooseResting(ctx, units, priority, eligible.length - capacity);
    if (attempt.resting.size === eligible.length - capacity) {
      chosen = attempt;
      break;
    }
    ctx.warnings.push({
      code: 'COURT_LEFT_IDLE',
      detail: 'Partner locks made an exact fill impossible; one court is left idle this round',
    });
    capacity -= playersPerCourt;
  }
  if (!chosen) {
    ctx.warnings.push({
      code: 'UNSATISFIABLE',
      detail: 'Could not fill any court with the active partner locks',
    });
    return finish(
      [],
      eligible.map((p) => p.id),
    );
  }

  const courtsUsed = capacity / playersPerCourt;
  const courtIds = courts.slice(0, courtsUsed).map((c) => c.id);
  const budget = Math.max(10, input.rules.candidates ?? 300);
  let best: Candidate | null = null;
  for (let i = 0; i < budget; i++) {
    const teams = randomTeams(ctx, chosen.playingUnits);
    const candidate = scoreCandidate(ctx, teams, softLocks, courtIds);
    if (!candidate.valid) continue;
    if (!best || candidate.score < best.score) best = candidate;
    if (best.score <= 0 && best.genderPenalty === 0) break;
  }
  if (!best) {
    ctx.warnings.push({
      code: 'UNSATISFIABLE',
      detail: `No pairing satisfies genderMode=${input.rules.genderMode} for the players available`,
    });
    return finish([], [], { candidatesEvaluated: budget });
  }

  const rests = [...chosen.resting].sort();
  const restCounts = eligible.map((p) => p.restCount + (chosen.resting.has(p.id) ? 1 : 0));
  const mean = restCounts.reduce((a, b) => a + b, 0) / restCounts.length;
  const restVariance = restCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / restCounts.length;

  return finish(best.assignments, rests, {
    candidatesEvaluated: budget,
    score: best.score,
    repeatPartnerPenalty: Math.max(0, best.partnerPenalty),
    repeatOpponentPenalty: best.opponentPenalty,
    skillImbalance: best.skillImbalance,
    genderPenalty: best.genderPenalty,
    restVariance,
    courtsUsed,
  });
}

/** Round history as stored by the API: who played with/against whom and who rested. */
export interface PlayedRound {
  assignments: RotationAssignment[];
  rests: string[];
  /** Participants present for the round (playing or resting). */
  present: string[];
  minutesPlayed: number;
}

/** Folds past rounds into per-participant history for the next rotation input. */
export function participantsFromHistory(
  base: Array<{
    id: string;
    available: boolean;
    skill?: number | undefined;
    gender?: string | undefined;
  }>,
  rounds: PlayedRound[],
): RotationParticipant[] {
  const out = new Map<string, RotationParticipant>();
  for (const b of base) {
    const p: RotationParticipant = {
      id: b.id,
      available: b.available,
      minutesPlayed: 0,
      restCount: 0,
      consecutiveRests: 0,
      roundsPresent: 0,
      partnerHistory: {},
      opponentHistory: {},
    };
    if (b.skill !== undefined) p.skill = b.skill;
    if (b.gender !== undefined) p.gender = b.gender;
    out.set(b.id, p);
  }
  const bump = (table: Record<string, number>, id: string) => {
    table[id] = (table[id] ?? 0) + 1;
  };
  for (const round of rounds) {
    const playing = new Set<string>();
    for (const a of round.assignments) {
      const [t1 = [], t2 = []] = a.teams;
      for (const team of a.teams) {
        for (const id of team) {
          playing.add(id);
          const p = out.get(id);
          if (!p) continue;
          p.minutesPlayed += round.minutesPlayed;
          p.consecutiveRests = 0;
          for (const mate of team) if (mate !== id) bump(p.partnerHistory, mate);
        }
      }
      for (const a1 of t1)
        for (const b1 of t2) {
          const pa = out.get(a1);
          const pb = out.get(b1);
          if (pa) bump(pa.opponentHistory, b1);
          if (pb) bump(pb.opponentHistory, a1);
        }
    }
    for (const id of round.rests) {
      const p = out.get(id);
      if (!p) continue;
      p.restCount += 1;
      p.consecutiveRests += 1;
    }
    for (const id of round.present) {
      const p = out.get(id);
      if (p) p.roundsPresent += 1;
    }
  }
  return [...out.values()];
}
