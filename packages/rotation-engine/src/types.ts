import type { GenderMode, MatchFormat } from '@buddyclub/rules-schema';

/** Spec section 8 interface, with two additions: `gender` label and `roundsPresent`. */
export interface RotationParticipant {
  id: string;
  available: boolean;
  skill?: number;
  /** Self-declared label, opt-in (spec section 8). Absent means "do not consider". */
  gender?: string;
  minutesPlayed: number;
  restCount: number;
  consecutiveRests: number;
  /** Rounds this participant was present for. Pre-arrival rounds never count against anyone. */
  roundsPresent: number;
  partnerHistory: Record<string, number>;
  opponentHistory: Record<string, number>;
}

export interface RotationCourt {
  id: string;
  available: boolean;
}

export interface PairLock {
  a: string;
  b: string;
  /** hard: always partners. soft: partners when it costs little. avoid: never on the same court. */
  kind: 'hard' | 'soft' | 'avoid';
  /** Inclusive: the lock applies to rounds with sequence <= untilRound. */
  untilRound?: number;
}

export interface RotationWeights {
  rest: number;
  minutes: number;
  partners: number;
  opponents: number;
  skill: number;
}

export interface RotationRules {
  genderMode: GenderMode;
  maxConsecutiveRests?: number;
  weights: RotationWeights;
  /** Candidate rotations to evaluate (bounded search). */
  candidates?: number;
}

export interface RotationInput {
  occurrenceId: string;
  sequence: number;
  seed: string;
  format: MatchFormat;
  courts: RotationCourt[];
  participants: RotationParticipant[];
  pairLocks: PairLock[];
  rules: RotationRules;
}

export interface RotationAssignment {
  courtId: string;
  /** Two teams; each team is a list of participant ids (1 for singles, 2 for doubles). */
  teams: string[][];
}

export interface RotationWarning {
  code:
    | 'NOT_ENOUGH_PLAYERS'
    | 'NO_COURTS'
    | 'LOCK_PARTNER_UNAVAILABLE'
    | 'LOCK_CONFLICT'
    | 'LOCK_IGNORED_SINGLES'
    | 'MAX_CONSECUTIVE_RESTS_EXCEEDED'
    | 'COURT_LEFT_IDLE'
    | 'UNSATISFIABLE'
    | 'AVOID_CONFLICT'
    | 'AVOID_VIOLATED';
  detail: string;
}

export interface RotationResult {
  assignments: RotationAssignment[];
  rests: string[];
  warnings: RotationWarning[];
  metrics: Record<string, number>;
  algorithmVersion: string;
}
