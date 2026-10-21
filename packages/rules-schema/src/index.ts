import { z } from 'zod';

/**
 * Ruleset definitions stored in `platform.rulesets.definition_json` (spec sections 9.2 to 9.4).
 * Every value is configurable; the defaults below are deliberately conservative and never
 * encode an unconfirmed league policy. Bump `RULESET_SCHEMA_VERSION` on breaking changes and
 * keep old versions parseable, because published meets pin the version they were run with.
 */
export const RULESET_SCHEMA_VERSION = 1;

export const MatchFormatSchema = z.enum(['singles', 'doubles']);
export type MatchFormat = z.infer<typeof MatchFormatSchema>;

/**
 * Eligibility for a rubber. `open` means no demographic constraint. Gender-based values are only
 * meaningful when participants have opted in to declare that data (spec section 8).
 */
export const RubberEligibilitySchema = z.enum(['open', 'women', 'men', 'mixed']);

export const RubberTemplateEntrySchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_]{1,32}$/)
    .describe('Stable identifier used as matches.rubber_key, e.g. wd, md, xd1, xd2'),
  label: z.string().min(1).max(64),
  format: MatchFormatSchema,
  eligibility: RubberEligibilitySchema.default('open'),
  order: z.int().min(1),
});
export type RubberTemplateEntry = z.infer<typeof RubberTemplateEntrySchema>;

export const ForfeitPolicySchema = z.enum(['award_target_to_zero', 'award_target_only', 'void']);

export const ScoringRulesSchema = z
  .object({
    targetPoints: z.int().min(1).default(21),
    /** 1 means "first to target wins". Win-by-two is NOT assumed: set 2 explicitly. */
    winBy: z.int().min(1).default(1),
    /** Absolute cap at which a game ends regardless of margin; null means no cap. */
    cap: z.int().min(1).nullable().default(null),
    setsPerRubber: z.int().min(1).max(9).default(1),
    allowDraw: z.boolean().default(false),
    forfeitPolicy: ForfeitPolicySchema.default('award_target_to_zero'),
  })
  .refine((rules) => rules.cap === null || rules.cap >= rules.targetPoints, {
    message: 'cap must be greater than or equal to targetPoints',
    path: ['cap'],
  });
export type ScoringRules = z.infer<typeof ScoringRulesSchema>;

/** How a team fixture is decided from its rubbers. */
export const FixtureOutcomePolicySchema = z.object({
  primary: z.literal('most_rubbers').default('most_rubbers'),
  /**
   * What to do when rubbers are level (e.g. 2-2). `needs_review` is the safe default until the
   * league confirms its policy (ADR-009): no winner is invented.
   */
  tieBreak: z
    .enum(['aggregate_points', 'draw_allowed', 'decider', 'needs_review'])
    .default('needs_review'),
});
export type FixtureOutcomePolicy = z.infer<typeof FixtureOutcomePolicySchema>;

export const StandingCriterionSchema = z.enum([
  'fixture_wins',
  'points_difference',
  'rubbers_won',
  'head_to_head',
  'points_scored',
  'fixture_draws',
  'disciplinary_points',
]);
export type StandingCriterion = z.infer<typeof StandingCriterionSchema>;

export const StandingsRulesSchema = z.object({
  criteria: z
    .array(StandingCriterionSchema)
    .min(1)
    .default(['fixture_wins', 'points_difference'])
    .refine((criteria) => new Set(criteria).size === criteria.length, {
      message: 'criteria must not repeat',
    }),
  /**
   * What happens when teams remain level after all criteria. `unresolved` surfaces an
   * UNRESOLVED_TIE for a documented director decision. Alphabetical ordering is never implied.
   */
  finalTieResolution: z
    .enum(['unresolved', 'director_decision', 'shared_rank'])
    .default('unresolved'),
});
export type StandingsRules = z.infer<typeof StandingsRulesSchema>;

export const ProgressionRulesSchema = z.object({
  promoteCount: z.int().min(0).default(1),
  relegateCount: z.int().min(0).default(1),
  /** Divisions ordered by `ordinal`; 1 is the highest unless `highestOrdinal` says otherwise. */
  highestOrdinal: z.int().min(1).default(1),
});
export type ProgressionRules = z.infer<typeof ProgressionRulesSchema>;

/** Tournament shape (Phase 4). Pools reuse divisions; the meet carries the format. */
export const TournamentRulesSchema = z.object({
  format: z.enum(['round_robin', 'pools_knockout']).default('round_robin'),
  /** Teams per pool that go through to the knockout. */
  advancePerPool: z.int().min(1).max(8).default(2),
  seeding: z.enum(['snake', 'sequential']).default('snake'),
  thirdPlacePlayoff: z.boolean().default(false),
});
export type TournamentRules = z.infer<typeof TournamentRulesSchema>;

export const RotationWeightsSchema = z.object({
  rest: z.number().min(0).default(1),
  minutes: z.number().min(0).default(1),
  partners: z.number().min(0).default(1),
  opponents: z.number().min(0).default(0.5),
  skill: z.number().min(0).default(0.5),
});

export const GenderModeSchema = z.enum([
  'off',
  'prefer_same',
  'prefer_mixed',
  'strict_same',
  'strict_mixed',
]);
export type GenderMode = z.infer<typeof GenderModeSchema>;

/**
 * How courts are filled each round (Addendum 1.2 step 4). `mix` is the fair rotation; in
 * `king_of_the_court` winners move up a court and losers move down, teams staying together.
 */
export const RotationModeSchema = z.enum(['mix', 'king_of_the_court']);
export type RotationMode = z.infer<typeof RotationModeSchema>;

export const RotationRulesSchema = z.object({
  format: MatchFormatSchema.default('doubles'),
  mode: RotationModeSchema.default('mix'),
  /**
   * Opt-in gender-aware pairing over self-declared labels (spec section 8). `off` ignores the
   * data; `prefer_*` scores it softly; `strict_*` makes it a hard rule and reports when it
   * cannot be satisfied. Participants with no declared label are never penalised.
   */
  genderMode: GenderModeSchema.default('off'),
  maxConsecutiveRests: z.int().min(1).optional(),
  /** Candidate rotations evaluated per round; higher is better quality but slower. */
  candidates: z.int().min(10).max(5000).default(300),
  weights: RotationWeightsSchema.prefault({}),
});
export type RotationRules = z.infer<typeof RotationRulesSchema>;

export const SocialSessionRulesetSchema = z.object({
  schemaVersion: z.literal(RULESET_SCHEMA_VERSION),
  kind: z.literal('social_session'),
  rotation: RotationRulesSchema.prefault({}),
  scoring: ScoringRulesSchema.optional(),
});

export const LeagueRulesetSchema = z.object({
  schemaVersion: z.literal(RULESET_SCHEMA_VERSION),
  kind: z.literal('league'),
  scoring: ScoringRulesSchema,
  rubberTemplate: z
    .array(RubberTemplateEntrySchema)
    .min(1)
    .refine((entries) => new Set(entries.map((e) => e.key)).size === entries.length, {
      message: 'rubber keys must be unique',
    }),
  fixtureOutcome: FixtureOutcomePolicySchema.prefault({}),
  standings: StandingsRulesSchema.prefault({}),
  progression: ProgressionRulesSchema.prefault({}),
  tournament: TournamentRulesSchema.prefault({}),
});

export const RulesetDefinitionSchema = z.discriminatedUnion('kind', [
  SocialSessionRulesetSchema,
  LeagueRulesetSchema,
]);
export type RulesetDefinition = z.infer<typeof RulesetDefinitionSchema>;
export type LeagueRuleset = z.infer<typeof LeagueRulesetSchema>;
export type SocialSessionRuleset = z.infer<typeof SocialSessionRulesetSchema>;

/**
 * The reference league's rubber template from spec section 1. Exported as an example input for
 * tests and seeds; it is not a default applied anywhere implicitly.
 */
export const REFERENCE_FOUR_RUBBER_TEMPLATE: RubberTemplateEntry[] = [
  { key: 'wd', label: "Women's doubles", format: 'doubles', eligibility: 'women', order: 1 },
  { key: 'md', label: "Men's doubles", format: 'doubles', eligibility: 'men', order: 2 },
  { key: 'xd1', label: 'Mixed doubles 1', format: 'doubles', eligibility: 'mixed', order: 3 },
  { key: 'xd2', label: 'Mixed doubles 2', format: 'doubles', eligibility: 'mixed', order: 4 },
];
