/**
 * Fairness controls as people see them (Addendum 1.2): each factor is Off, Low, Medium or High.
 * The engine takes numeric weights; these are the numbers behind the words.
 */
export const FAIRNESS_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type FairnessLevel = (typeof FAIRNESS_LEVELS)[number];

export const FAIRNESS_FACTORS = [
  ['rest', 'Sharing the sitting out'],
  ['minutes', 'Equal minutes played'],
  ['partners', 'New partners'],
  ['opponents', 'New opponents'],
  ['skill', 'Even skill on a court'],
] as const;
export type FairnessFactor = (typeof FAIRNESS_FACTORS)[number][0];

const WEIGHT_FOR: Record<FairnessLevel, number> = { off: 0, low: 0.5, medium: 1, high: 2 };

/** The engine defaults, as levels. */
export const DEFAULT_LEVELS: Record<FairnessFactor, FairnessLevel> = {
  rest: 'medium',
  minutes: 'medium',
  partners: 'medium',
  opponents: 'low',
  skill: 'low',
};

export function weightForLevel(level: FairnessLevel): number {
  return WEIGHT_FOR[level];
}

/** Nearest level for a stored weight, so older numeric rules still show sensibly. */
export function levelForWeight(weight: number | undefined, fallback: FairnessLevel): FairnessLevel {
  if (weight === undefined) return fallback;
  if (weight <= 0) return 'off';
  if (weight < 0.75) return 'low';
  if (weight < 1.5) return 'medium';
  return 'high';
}

export function isFairnessLevel(value: unknown): value is FairnessLevel {
  return typeof value === 'string' && (FAIRNESS_LEVELS as readonly string[]).includes(value);
}
