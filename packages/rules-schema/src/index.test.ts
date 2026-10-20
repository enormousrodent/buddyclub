import { describe, expect, it } from 'vitest';
import {
  LeagueRulesetSchema,
  REFERENCE_FOUR_RUBBER_TEMPLATE,
  RulesetDefinitionSchema,
  ScoringRulesSchema,
} from './index';

describe('rules-schema', () => {
  it('does not assume win-by-two or a cap for a 21-point game', () => {
    const rules = ScoringRulesSchema.parse({ targetPoints: 21 });
    expect(rules.winBy).toBe(1);
    expect(rules.cap).toBeNull();
  });

  it('accepts an explicit win-by-two with a 30-point cap', () => {
    const rules = ScoringRulesSchema.parse({ targetPoints: 21, winBy: 2, cap: 30 });
    expect(rules).toMatchObject({ targetPoints: 21, winBy: 2, cap: 30 });
  });

  it('rejects a cap below the target', () => {
    expect(ScoringRulesSchema.safeParse({ targetPoints: 21, cap: 15 }).success).toBe(false);
  });

  it('parses the reference league ruleset with safe defaults for open decisions', () => {
    const ruleset = LeagueRulesetSchema.parse({
      schemaVersion: 1,
      kind: 'league',
      scoring: { targetPoints: 21 },
      rubberTemplate: REFERENCE_FOUR_RUBBER_TEMPLATE,
    });
    expect(ruleset.rubberTemplate).toHaveLength(4);
    expect(ruleset.fixtureOutcome.tieBreak).toBe('needs_review');
    expect(ruleset.standings.criteria).toEqual(['fixture_wins', 'points_difference']);
    expect(ruleset.standings.finalTieResolution).toBe('unresolved');
    expect(ruleset.progression).toEqual({ promoteCount: 1, relegateCount: 1, highestOrdinal: 1 });
  });

  it('rejects duplicate rubber keys', () => {
    const result = LeagueRulesetSchema.safeParse({
      schemaVersion: 1,
      kind: 'league',
      scoring: {},
      rubberTemplate: [
        { key: 'xd', label: 'A', format: 'doubles', order: 1 },
        { key: 'xd', label: 'B', format: 'doubles', order: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('discriminates social session rulesets', () => {
    const parsed = RulesetDefinitionSchema.parse({ schemaVersion: 1, kind: 'social_session' });
    expect(parsed.kind).toBe('social_session');
    if (parsed.kind === 'social_session') {
      expect(parsed.rotation.genderMode).toBe('off');
      expect(parsed.rotation.format).toBe('doubles');
    }
  });
});
