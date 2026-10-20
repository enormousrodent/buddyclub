import { z } from 'zod';
import { DisplayNameSchema, IsoDateTimeSchema, UuidSchema } from './common';
import { SportIdSchema } from './groups';
import { RulesJsonSchema } from './sessions';

export const CompetitionTypeSchema = z.enum(['league', 'tournament']);
export const SeasonStateSchema = z.enum(['draft', 'active', 'completed', 'archived']);
export const MeetStateSchema = z.enum(['draft', 'published', 'live', 'completed', 'cancelled']);
export const FixtureStatusSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'needs_review',
  'void',
]);
export const MatchStateSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'forfeited',
]);
export const ResultStatusSchema = z.enum(['submitted', 'confirmed', 'disputed', 'void']);

export const CompetitionSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  type: CompetitionTypeSchema,
  sportId: SportIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  version: z.int(),
  createdAt: IsoDateTimeSchema,
});
export type Competition = z.infer<typeof CompetitionSchema>;

export const CreateCompetitionBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: CompetitionTypeSchema.default('league'),
  sportId: SportIdSchema.default('badminton'),
  description: z.string().trim().max(2000).optional(),
});
export type CreateCompetitionBody = z.infer<typeof CreateCompetitionBodySchema>;

export const DivisionSchema = z.object({
  id: UuidSchema,
  seasonId: UuidSchema,
  ordinal: z.int().min(1),
  name: z.string(),
  capacity: z.int(),
});
export type Division = z.infer<typeof DivisionSchema>;

export const SeasonSchema = z.object({
  id: UuidSchema,
  competitionId: UuidSchema,
  competitionName: z.string(),
  organisationId: UuidSchema,
  name: z.string(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  state: SeasonStateSchema,
  rules: RulesJsonSchema,
  rulesSchemaVersion: z.int(),
  version: z.int(),
  divisions: z.array(DivisionSchema),
  createdAt: IsoDateTimeSchema,
});
export type Season = z.infer<typeof SeasonSchema>;

export const CreateSeasonBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  /** League rules (validated against the rules schema). Defaults are the safe ADR-009 ones. */
  rules: RulesJsonSchema.optional(),
  divisions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        capacity: z.int().min(2).max(32).default(4),
      }),
    )
    .min(1)
    .max(16)
    .default([{ name: 'Division 1', capacity: 4 }]),
});
export type CreateSeasonBody = z.infer<typeof CreateSeasonBodySchema>;

export const TeamSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  name: z.string(),
  shortName: z.string().nullable(),
  captainParticipantId: UuidSchema.nullable(),
  rosterCount: z.int(),
  archivedAt: IsoDateTimeSchema.nullable(),
  version: z.int(),
  createdAt: IsoDateTimeSchema,
});
export type Team = z.infer<typeof TeamSchema>;

export const RosterEntrySchema = z.object({
  participantId: UuidSchema,
  displayName: DisplayNameSchema,
  validFrom: IsoDateTimeSchema,
  validTo: IsoDateTimeSchema.nullable(),
  isCaptain: z.boolean(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const TeamDetailSchema = TeamSchema.extend({ roster: z.array(RosterEntrySchema) });
export type TeamDetail = z.infer<typeof TeamDetailSchema>;

export const CreateTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  shortName: z.string().trim().min(1).max(12).optional(),
  captainParticipantId: UuidSchema.optional(),
});
export type CreateTeamBody = z.infer<typeof CreateTeamBodySchema>;

export const UpdateTeamBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    shortName: z.string().trim().min(1).max(12).nullable().optional(),
    captainParticipantId: UuidSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateTeamBody = z.infer<typeof UpdateTeamBodySchema>;

export const RosterChangeBodySchema = z.object({ participantId: UuidSchema });

export const CourtPoolSchema = z.object({
  divisionId: UuidSchema,
  policy: z.enum(['fixed_division', 'fixed_team', 'fixed_zone', 'dynamic', 'preferred', 'manual']),
  exclusive: z.boolean(),
  courts: z.array(z.object({ courtId: UuidSchema, code: z.string() })),
});
export type CourtPool = z.infer<typeof CourtPoolSchema>;

export const MeetDivisionSchema = z.object({
  division: DivisionSchema,
  teams: z.array(z.object({ teamId: UuidSchema, name: z.string(), seed: z.int().nullable() })),
  courts: z.array(z.object({ courtId: UuidSchema, code: z.string() })),
});

export const MeetSchema = z.object({
  id: UuidSchema,
  seasonId: UuidSchema,
  seasonName: z.string(),
  competitionName: z.string(),
  organisationId: UuidSchema,
  venueId: UuidSchema.nullable(),
  venueName: z.string().nullable(),
  name: z.string(),
  sequenceNo: z.int(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  state: MeetStateSchema,
  format: z.enum(['round_robin', 'pools_knockout']),
  /** Set when the organiser has enabled the public board (`/board/:slug`). */
  publicSlug: z.string().nullable(),
  version: z.int(),
  divisions: z.array(MeetDivisionSchema),
  counts: z.object({
    fixtures: z.int(),
    rubbers: z.int(),
    completedFixtures: z.int(),
    knockoutFixtures: z.int(),
    knockoutResolved: z.int(),
  }),
  createdAt: IsoDateTimeSchema,
});
export type Meet = z.infer<typeof MeetSchema>;

export const SetMeetEntriesBodySchema = z.object({
  teams: z
    .array(z.object({ teamId: UuidSchema, seed: z.int().min(1).max(999).optional() }))
    .min(2)
    .max(256),
});
export type SetMeetEntriesBody = z.infer<typeof SetMeetEntriesBodySchema>;

export const PublicAccessBodySchema = z.object({ enabled: z.boolean() });
export const PublicAccessSchema = z.object({ slug: z.string().nullable() });
export type PublicAccess = z.infer<typeof PublicAccessSchema>;

export const CreateMeetBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema.optional(),
  venueId: UuidSchema.optional(),
  /** Defaults to the season rules' `tournament.format`. */
  format: z.enum(['round_robin', 'pools_knockout']).optional(),
});
export type CreateMeetBody = z.infer<typeof CreateMeetBodySchema>;

export const SetDivisionTeamsBodySchema = z.object({
  teamIds: z.array(UuidSchema).max(32),
});
export const SetDivisionCourtsBodySchema = z.object({
  courtIds: z.array(UuidSchema).max(50),
  exclusive: z.boolean().default(true),
});

export const RubberSideSchema = z.object({
  /** Null while a knockout side is still to be decided. */
  teamId: UuidSchema.nullable(),
  teamName: z.string(),
  players: z.array(z.object({ participantId: UuidSchema, displayName: DisplayNameSchema })),
});

export const RubberSchema = z.object({
  matchId: UuidSchema,
  fixtureId: UuidSchema,
  rubberKey: z.string(),
  label: z.string(),
  order: z.int(),
  format: z.enum(['singles', 'doubles']),
  state: MatchStateSchema,
  courtId: UuidSchema.nullable(),
  courtCode: z.string().nullable(),
  calledAt: IsoDateTimeSchema.nullable(),
  startedAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  sides: z.array(RubberSideSchema).length(2),
  /** Latest result revision, if any. */
  result: z
    .object({
      revision: z.int(),
      status: ResultStatusSchema,
      games: z.array(z.tuple([z.int(), z.int()])),
      forfeitedBy: z.enum(['home', 'away']).nullable(),
      submittedAt: IsoDateTimeSchema,
      confirmedAt: IsoDateTimeSchema.nullable(),
    })
    .nullable(),
});
export type Rubber = z.infer<typeof RubberSchema>;

export const BracketSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('seed'), seed: z.int().min(1) }),
  z.object({ type: z.literal('winner'), round: z.int().min(1), slot: z.int().min(1) }),
  z.object({ type: z.literal('loser'), round: z.int().min(1), slot: z.int().min(1) }),
]);
export type BracketSource = z.infer<typeof BracketSourceSchema>;

export const FixtureStageSchema = z.enum(['pool', 'knockout']);

export const FixtureSchema = z.object({
  id: UuidSchema,
  meetId: UuidSchema,
  /** Null for knockout fixtures. */
  divisionId: UuidSchema.nullable(),
  divisionName: z.string().nullable(),
  roundNo: z.int(),
  stage: FixtureStageSchema,
  bracket: z
    .object({
      round: z.int(),
      slot: z.int(),
      label: z.string(),
      thirdPlace: z.boolean(),
      sources: z.object({ home: BracketSourceSchema, away: BracketSourceSchema }),
      /** Seed numbers once known (from the pool standings). */
      seeds: z.object({ home: z.int().nullable(), away: z.int().nullable() }),
    })
    .nullable(),
  status: FixtureStatusSchema,
  /** Null while a knockout side is still to be decided. */
  home: z.object({ teamId: UuidSchema, name: z.string() }).nullable(),
  away: z.object({ teamId: UuidSchema, name: z.string() }).nullable(),
  winnerTeamId: UuidSchema.nullable(),
  outcome: z
    .object({
      outcome: z.enum(['home', 'away', 'draw', 'needs_review', 'incomplete']),
      rubbersWon: z.tuple([z.int(), z.int()]),
      pointsFor: z.tuple([z.int(), z.int()]),
      reason: z.string().optional(),
    })
    .nullable(),
  version: z.int(),
  rubbers: z.array(RubberSchema),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const FixturePreviewSchema = z.object({
  format: z.enum(['round_robin', 'pools_knockout']),
  divisions: z.array(
    z.object({
      divisionId: UuidSchema,
      divisionName: z.string(),
      fixtures: z.array(
        z.object({
          roundNo: z.int(),
          home: z.string(),
          away: z.string(),
          homeTeamId: UuidSchema,
          awayTeamId: UuidSchema,
        }),
      ),
      rubbersPerFixture: z.int(),
    }),
  ),
  knockout: z
    .object({
      entrants: z.int(),
      rounds: z.int(),
      fixtures: z.int(),
      thirdPlace: z.boolean(),
    })
    .nullable(),
  totals: z.object({ fixtures: z.int(), rubbers: z.int() }),
  warnings: z.array(z.string()),
});
export type FixturePreview = z.infer<typeof FixturePreviewSchema>;

export const KnockoutAdvanceSchema = z.object({
  meetId: UuidSchema,
  /** Fixtures whose sides were filled in by this call. */
  resolved: z.int(),
  /** Human-readable reasons sides are still waiting (pool unfinished, tie, feeder pending). */
  pending: z.array(z.string()),
  fixtures: z.array(FixtureSchema),
});
export type KnockoutAdvance = z.infer<typeof KnockoutAdvanceSchema>;

export const DisputeSchema = z.object({
  matchId: UuidSchema,
  fixtureId: UuidSchema,
  divisionName: z.string().nullable(),
  rubberLabel: z.string(),
  home: z.string(),
  away: z.string(),
  revision: z.int(),
  games: z.array(z.tuple([z.int(), z.int()])),
  forfeitedBy: z.enum(['home', 'away']).nullable(),
  submittedAs: z.string().nullable(),
  reason: z.string().nullable(),
  submittedAt: IsoDateTimeSchema,
  disputedAt: IsoDateTimeSchema.nullable(),
});
export type Dispute = z.infer<typeof DisputeSchema>;

export const ResolveDisputeBodySchema = z.object({
  /** `uphold` confirms the disputed score; `void` discards it and reopens the rubber. */
  decision: z.enum(['uphold', 'void']),
  reason: z.string().trim().min(3).max(400),
});
export type ResolveDisputeBody = z.infer<typeof ResolveDisputeBodySchema>;

export const TeamsImportBodySchema = z.object({
  /** CSV with a header row: team,player[,captain]. One row per player. */
  csv: z.string().min(1).max(200_000),
});
export const ImportResultSchema = z.object({
  teamsCreated: z.int(),
  teamsReused: z.int(),
  playersCreated: z.int(),
  rosterAdded: z.int(),
  errors: z.array(z.string()),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const LineupBodySchema = z.object({
  /** rubberKey -> participant ids for this team's side (1 for singles, 2 for doubles). */
  rubbers: z.record(z.string(), z.array(UuidSchema).min(1).max(2)),
});
export type LineupBody = z.infer<typeof LineupBodySchema>;

export const SubmitResultBodySchema = z
  .object({
    games: z
      .array(z.tuple([z.int().min(0), z.int().min(0)]))
      .max(9)
      .default([]),
    forfeitedBy: z.enum(['home', 'away']).optional(),
    reason: z.string().trim().max(400).optional(),
  })
  .refine((b) => b.games.length > 0 || b.forfeitedBy !== undefined, {
    message: 'games or forfeitedBy required',
  });
export type SubmitResultBody = z.infer<typeof SubmitResultBodySchema>;

export const CourtCallBodySchema = z.object({
  /** Court to call the rubber to. Must be in the division's pool unless `overrideReason` is given. */
  courtId: UuidSchema,
  overrideReason: z.string().trim().min(3).max(400).optional(),
});

export const StandingRowSchema = z.object({
  teamId: UuidSchema,
  teamName: z.string(),
  rank: z.int(),
  played: z.int(),
  fixtureWins: z.int(),
  fixtureDraws: z.int(),
  fixtureLosses: z.int(),
  rubbersWon: z.int(),
  rubbersLost: z.int(),
  pointsFor: z.int(),
  pointsAgainst: z.int(),
  pointsDifference: z.int(),
  tiedWith: z.array(UuidSchema),
});

export const StandingsSchema = z.object({
  meetId: UuidSchema,
  rulesetVersion: z.string(),
  criteria: z.array(z.string()),
  divisions: z.array(
    z.object({
      divisionId: UuidSchema,
      divisionName: z.string(),
      ordinal: z.int(),
      revision: z.int(),
      computedAt: IsoDateTimeSchema,
      rows: z.array(StandingRowSchema),
      unresolvedTies: z.array(z.array(UuidSchema)),
      pendingFixtures: z.int(),
    }),
  ),
});
export type Standings = z.infer<typeof StandingsSchema>;

export const ProgressionPreviewSchema = z.object({
  progressionId: UuidSchema,
  meetId: UuidSchema,
  status: z.enum(['preview', 'committed', 'discarded']),
  standingsRevisions: z.record(z.string(), z.int()),
  moves: z.array(
    z.object({
      teamId: UuidSchema,
      teamName: z.string(),
      fromDivisionId: UuidSchema,
      toDivisionId: UuidSchema,
      direction: z.enum(['up', 'down', 'stay']),
    }),
  ),
  nextAssignments: z.array(
    z.object({ divisionId: UuidSchema, divisionName: z.string(), teamIds: z.array(UuidSchema) }),
  ),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
  createdAt: IsoDateTimeSchema,
});
export type ProgressionPreview = z.infer<typeof ProgressionPreviewSchema>;

export const CommitProgressionBodySchema = z.object({
  progressionId: UuidSchema,
  /** The meet to receive the assignments; created as a draft if omitted. */
  nextMeet: z
    .object({
      name: z.string().trim().min(1).max(160),
      startsAt: IsoDateTimeSchema,
      venueId: UuidSchema.optional(),
    })
    .optional(),
  nextMeetId: UuidSchema.optional(),
  reason: z.string().trim().max(400).optional(),
});
export type CommitProgressionBody = z.infer<typeof CommitProgressionBodySchema>;

export const CompetitionIdParamsSchema = z.object({ competitionId: UuidSchema });
export const SeasonIdParamsSchema = z.object({ seasonId: UuidSchema });
export const TeamIdParamsSchema = z.object({ teamId: UuidSchema });
export const MeetIdParamsSchema = z.object({ meetId: UuidSchema });
export const FixtureIdParamsSchema = z.object({ fixtureId: UuidSchema });
export const MatchIdParamsSchema = z.object({ matchId: UuidSchema });

/** The player's view of competitions across clubs (Addendum 1.1). */
export const MyCompetitionsSchema = z.object({
  teams: z.array(
    z.object({
      teamId: UuidSchema,
      name: z.string(),
      organisationId: UuidSchema,
      isCaptain: z.boolean(),
    }),
  ),
  meets: z.array(
    z.object({
      meetId: UuidSchema,
      name: z.string(),
      competitionName: z.string(),
      organisationId: UuidSchema,
      venueName: z.string().nullable(),
      startsAt: IsoDateTimeSchema,
      state: MeetStateSchema,
      format: z.enum(['round_robin', 'pools_knockout']),
      publicSlug: z.string().nullable(),
      canManage: z.boolean(),
      myFixtures: z.array(
        z.object({
          fixtureId: UuidSchema,
          label: z.string(),
          myTeam: z.string(),
          opponent: z.string(),
          status: FixtureStatusSchema,
          myRubbers: z.array(
            z.object({
              matchId: UuidSchema,
              label: z.string(),
              state: MatchStateSchema,
              courtCode: z.string().nullable(),
              score: z.string().nullable(),
            }),
          ),
          outcome: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type MyCompetitions = z.infer<typeof MyCompetitionsSchema>;
