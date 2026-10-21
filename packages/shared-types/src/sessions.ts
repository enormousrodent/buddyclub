import { z } from 'zod';
import { DisplayNameSchema, IsoDateTimeSchema, UuidSchema } from './common';
import { SportIdSchema } from './groups';
import { ParticipantSourceSchema } from './roles';

/** Opaque rule definitions; the API validates them with @buddyclub/rules-schema. */
export const RulesJsonSchema = z.record(z.string(), z.unknown());

export const RulesetSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  kind: z.enum(['social_session', 'league']),
  name: z.string(),
  schemaVersion: z.int(),
  definition: RulesJsonSchema,
  version: z.int().min(1),
  usedAt: IsoDateTimeSchema.nullable(),
  archivedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Ruleset = z.infer<typeof RulesetSchema>;

export const CreateRulesetBodySchema = z.object({
  kind: z.enum(['social_session']).default('social_session'),
  name: z.string().trim().min(1).max(120),
  definition: RulesJsonSchema,
});
export type CreateRulesetBody = z.infer<typeof CreateRulesetBodySchema>;

/** Singles or doubles: how many on each side of a court. */
export const MatchFormatSchema = z.enum(['singles', 'doubles']);
export type MatchFormat = z.infer<typeof MatchFormatSchema>;

/** What a sport usually plays socially; tennis genuinely varies, so it asks. */
export function usualFormatForSport(sportId: string): MatchFormat {
  return sportId === 'squash' || sportId === 'table_tennis' ? 'singles' : 'doubles';
}

export const RotationModeSchema = z.enum(['mix', 'king_of_the_court']);
export type RotationMode = z.infer<typeof RotationModeSchema>;

export const OccurrenceStateSchema = z.enum(['draft', 'open', 'live', 'completed', 'cancelled']);
export type OccurrenceState = z.infer<typeof OccurrenceStateSchema>;
export const AttendanceStatusSchema = z.enum(['registered', 'checked_in', 'left', 'no_show']);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;
export const RoundStatusSchema = z.enum([
  'published',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
]);
export type RoundStatus = z.infer<typeof RoundStatusSchema>;

/** IANA zone name the browser reports (`Intl.DateTimeFormat().resolvedOptions().timeZone`). */
export const TimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'unknown time zone' },
  );

/** Weekly schedule of a session (Addendum 1.2): "Mondays at 19:30, Europe/London". */
export const ScheduleSchema = z.object({
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: z.int().min(0).max(6),
  /** `HH:MM`, 24-hour, local to `timezone`. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM'),
  timezone: TimezoneSchema,
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const SessionSeriesSchema = z.object({
  id: UuidSchema,
  organisationId: UuidSchema,
  groupId: UuidSchema.nullable(),
  venueId: UuidSchema.nullable(),
  sportId: SportIdSchema,
  /** Who owns this Rally series (ADR-017). */
  ownerScope: z.enum(['personal', 'organisation', 'buddy_group']),
  buddyGroupId: UuidSchema.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  recurrenceRrule: z.string().nullable(),
  defaultRulesetId: UuidSchema.nullable(),
  defaultRules: RulesJsonSchema.nullable(),
  defaultDurationMinutes: z.int(),
  defaultRoundMinutes: z.int(),
  schedule: ScheduleSchema.nullable(),
  /** The next scheduled start, computed from the schedule; null without one. */
  nextAt: IsoDateTimeSchema.nullable(),
  /** Minutes before the start from which attendees may check themselves in. */
  checkInWindowMinutes: z.int(),
  /** Owner switch: hosts may run nights only while this is on. */
  hostsEnabled: z.boolean(),
  /** True for the organisation's organisers and, while enabled, its hosts. */
  canRun: z.boolean(),
  /** True for the organisation's organisers: may edit the session and its hosts. */
  canEdit: z.boolean(),
  archivedAt: IsoDateTimeSchema.nullable(),
  version: z.int().min(1),
  createdAt: IsoDateTimeSchema,
});
export type SessionSeries = z.infer<typeof SessionSeriesSchema>;

export const CreateSessionSeriesBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  sportId: SportIdSchema,
  venueId: UuidSchema.optional(),
  groupId: UuidSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  rulesetId: UuidSchema.optional(),
  /** Inline social-session rules (validated against the rules schema). */
  rules: RulesJsonSchema.optional(),
  defaultDurationMinutes: z.int().min(15).max(720).default(120),
  defaultRoundMinutes: z.int().min(3).max(120).default(12),
  schedule: ScheduleSchema.optional(),
  checkInWindowMinutes: z.int().min(0).max(180).optional(),
  /** Singles or doubles; defaults to what the sport usually plays. */
  format: MatchFormatSchema.optional(),
  /** Defaults to `personal` in a personal workspace, `buddy_group` when groupId is set. */
  ownerScope: z.enum(['personal', 'organisation', 'buddy_group']).optional(),
});
export type CreateSessionSeriesBody = z.infer<typeof CreateSessionSeriesBodySchema>;

export const UpdateSessionSeriesBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    venueId: UuidSchema.nullable().optional(),
    groupId: UuidSchema.nullable().optional(),
    rules: RulesJsonSchema.optional(),
    defaultDurationMinutes: z.int().min(15).max(720).optional(),
    defaultRoundMinutes: z.int().min(3).max(120).optional(),
    /** null clears the schedule. */
    schedule: ScheduleSchema.nullable().optional(),
    checkInWindowMinutes: z.int().min(0).max(180).optional(),
    hostsEnabled: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateSessionSeriesBody = z.infer<typeof UpdateSessionSeriesBodySchema>;

export const SessionCourtSchema = z.object({
  courtId: UuidSchema,
  code: z.string(),
  label: z.string().nullable(),
  sortOrder: z.int(),
  active: z.boolean(),
});
export type SessionCourt = z.infer<typeof SessionCourtSchema>;

export const OccurrenceSchema = z.object({
  id: UuidSchema,
  seriesId: UuidSchema,
  seriesName: z.string(),
  organisationId: UuidSchema,
  venueId: UuidSchema.nullable(),
  venueName: z.string().nullable(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  state: OccurrenceStateSchema,
  roundDurationSeconds: z.int(),
  rules: RulesJsonSchema,
  rulesSchemaVersion: z.int(),
  notes: z.string().nullable(),
  version: z.int().min(1),
  openedAt: IsoDateTimeSchema.nullable(),
  startedAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  cancelledAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  counts: z.object({ entries: z.int(), checkedIn: z.int(), rounds: z.int() }),
  courts: z.array(SessionCourtSchema),
});
export type Occurrence = z.infer<typeof OccurrenceSchema>;

export const CreateOccurrenceBodySchema = z.object({
  startsAt: IsoDateTimeSchema,
  /** Defaults to startsAt + the series default duration. */
  endsAt: IsoDateTimeSchema.optional(),
  venueId: UuidSchema.optional(),
  /** Courts available tonight; must belong to the venue. Defaults to all active venue courts. */
  courtIds: z.array(UuidSchema).max(50).optional(),
  roundMinutes: z.int().min(1).max(120).optional(),
  rules: RulesJsonSchema.optional(),
  /** Tonight's format; overrides the series default's rotation mode. */
  mode: RotationModeSchema.optional(),
  /** Singles or doubles tonight; overrides the series default. */
  format: MatchFormatSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateOccurrenceBody = z.infer<typeof CreateOccurrenceBodySchema>;

export const UpdateOccurrenceBodySchema = z
  .object({
    startsAt: IsoDateTimeSchema.optional(),
    endsAt: IsoDateTimeSchema.optional(),
    venueId: UuidSchema.optional(),
    courtIds: z.array(UuidSchema).max(50).optional(),
    roundMinutes: z.int().min(1).max(120).optional(),
    /** Tonight's format; only before the first round is published. */
    mode: RotationModeSchema.optional(),
    /** Singles or doubles; only before the first round is published. */
    format: MatchFormatSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });
export type UpdateOccurrenceBody = z.infer<typeof UpdateOccurrenceBodySchema>;

export const ListOccurrencesQuerySchema = z.object({
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
  state: OccurrenceStateSchema.optional(),
});

export const EntrySchema = z.object({
  participantId: UuidSchema,
  displayName: DisplayNameSchema,
  /** Profile photo of the linked account, when the participant has one. */
  avatarUrl: z.string().nullable(),
  source: ParticipantSourceSchema,
  skillRating: z.number().nullable(),
  attendanceStatus: AttendanceStatusSchema,
  joinedAt: IsoDateTimeSchema,
  checkInAt: IsoDateTimeSchema.nullable(),
  leftAt: IsoDateTimeSchema.nullable(),
});
export type Entry = z.infer<typeof EntrySchema>;

/** Add an existing participant, or create a walk-in guest by name in the same request. */
export const AddEntryBodySchema = z
  .object({
    participantId: UuidSchema.optional(),
    displayName: DisplayNameSchema.optional(),
    skillRating: z.number().min(0).max(100).optional(),
    /** Mark as checked in immediately (walk-ins usually are). */
    checkIn: z.boolean().default(true),
  })
  .refine((b) => !!b.participantId !== !!b.displayName, {
    message: 'provide participantId or displayName, not both',
  });
export type AddEntryBody = z.infer<typeof AddEntryBodySchema>;

export const CheckInBodySchema = z.object({
  /** Omit to check yourself in (your own participant record in the club). */
  participantId: UuidSchema.optional(),
});

export const WithdrawBodySchema = z.object({
  reason: z.string().trim().max(400).optional(),
  /** What happens to a match in progress: let it finish, or cancel it now. */
  currentMatch: z.enum(['finish', 'cancel']).default('finish'),
});
export type WithdrawBody = z.infer<typeof WithdrawBodySchema>;

export const PairLockSchema = z.object({
  id: UuidSchema,
  participantA: UuidSchema,
  participantB: UuidSchema,
  kind: z.enum(['hard', 'soft', 'avoid']),
  untilRound: z.int().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type PairLock = z.infer<typeof PairLockSchema>;

export const CreatePairLockBodySchema = z
  .object({
    participantA: UuidSchema,
    participantB: UuidSchema,
    kind: z.enum(['hard', 'soft', 'avoid']).default('hard'),
    untilRound: z.int().min(1).optional(),
  })
  .refine((b) => b.participantA !== b.participantB, {
    message: 'a participant cannot be locked with themselves',
  });
export type CreatePairLockBody = z.infer<typeof CreatePairLockBodySchema>;

export const NamedParticipantSchema = z.object({
  participantId: UuidSchema,
  displayName: DisplayNameSchema,
});

export const AssignmentSchema = z.object({
  courtId: UuidSchema,
  courtCode: z.string(),
  matchId: UuidSchema.nullable(),
  teams: z.array(z.array(NamedParticipantSchema)).length(2),
  /** Recorded result, when the organiser entered one (king of the court needs it). */
  winnerSide: z
    .union([z.literal(1), z.literal(2)])
    .nullable()
    .default(null),
});

export const RecordResultBodySchema = z.object({
  /** null clears a mistaken result. */
  winnerSide: z.union([z.literal(1), z.literal(2)]).nullable(),
});
export type RecordResultBody = z.infer<typeof RecordResultBodySchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;

export const RotationWarningSchema = z.object({ code: z.string(), detail: z.string() });

export const RotationPreviewRequestSchema = z.object({
  seed: z.string().min(1).max(64).optional(),
  /** Leave out participants who are present but sitting this round out by choice. */
  excludeParticipantIds: z.array(UuidSchema).max(100).optional(),
});
export type RotationPreviewRequest = z.infer<typeof RotationPreviewRequestSchema>;

export const RotationPreviewSchema = z.object({
  previewId: UuidSchema,
  occurrenceId: UuidSchema,
  sequenceNo: z.int().min(1),
  sourceVersion: z.int().min(1),
  algorithmVersion: z.string(),
  assignments: z.array(AssignmentSchema),
  resting: z.array(NamedParticipantSchema),
  warnings: z.array(RotationWarningSchema),
  metrics: z.record(z.string(), z.number()),
  expiresAt: IsoDateTimeSchema,
});
export type RotationPreview = z.infer<typeof RotationPreviewSchema>;

export const CommitRotationBodySchema = z.object({ previewId: UuidSchema });

export const TimerSchema = z.object({
  startedAt: IsoDateTimeSchema.nullable(),
  pausedAt: IsoDateTimeSchema.nullable(),
  pausedTotalSeconds: z.int(),
  durationSeconds: z.int(),
  /** When the round ends if not paused again; null until started. */
  endsAt: IsoDateTimeSchema.nullable(),
  remainingSeconds: z.int().nullable(),
});
export type Timer = z.infer<typeof TimerSchema>;

export const RoundSchema = z.object({
  id: UuidSchema,
  occurrenceId: UuidSchema,
  sequenceNo: z.int().min(1),
  status: RoundStatusSchema,
  revision: z.int().min(1),
  timer: TimerSchema,
  completedAt: IsoDateTimeSchema.nullable(),
  assignments: z.array(AssignmentSchema),
  resting: z.array(NamedParticipantSchema),
  warnings: z.array(RotationWarningSchema),
  metrics: z.record(z.string(), z.number()),
});
export type Round = z.infer<typeof RoundSchema>;

export const BoardSchema = z.object({
  serverTime: IsoDateTimeSchema,
  occurrence: z.object({
    id: UuidSchema,
    organisationId: UuidSchema,
    name: z.string(),
    state: OccurrenceStateSchema,
    version: z.int(),
    roundDurationSeconds: z.int(),
    startsAt: IsoDateTimeSchema,
    venueName: z.string().nullable(),
    /** Set when the organiser enabled the public board and QR join. */
    publicSlug: z.string().nullable(),
    /** Attendees may check themselves in from this moment; hosts at any time. */
    checkInOpensAt: IsoDateTimeSchema,
    mode: RotationModeSchema,
    format: MatchFormatSchema,
  }),
  /** The viewer may run this night: an organiser of the club, or a host of the session. */
  canManage: z.boolean(),
  courts: z.array(SessionCourtSchema),
  entries: z.array(EntrySchema),
  pairLocks: z.array(PairLockSchema),
  /** The round players should be on now: in progress, paused, or the latest published one. */
  currentRound: RoundSchema.nullable(),
  /** A published round after the current one, if the organiser committed ahead. */
  nextRound: RoundSchema.nullable(),
  completedRounds: z.int(),
});
export type Board = z.infer<typeof BoardSchema>;

export const MyGameSchema = z.object({
  sequenceNo: z.int(),
  status: RoundStatusSchema,
  resting: z.boolean(),
  courtCode: z.string().nullable(),
  partners: z.array(NamedParticipantSchema),
  opponents: z.array(NamedParticipantSchema),
  timer: TimerSchema,
});

export const MyScheduleSchema = z.object({
  serverTime: IsoDateTimeSchema,
  occurrence: z.object({
    id: UuidSchema,
    name: z.string(),
    state: OccurrenceStateSchema,
    startsAt: IsoDateTimeSchema,
    checkInOpensAt: IsoDateTimeSchema,
  }),
  participant: NamedParticipantSchema,
  attendanceStatus: AttendanceStatusSchema.nullable(),
  current: MyGameSchema.nullable(),
  next: MyGameSchema.nullable(),
});
export type MySchedule = z.infer<typeof MyScheduleSchema>;

/**
 * A scheduled session as a member sees it (Addendum 1.2): its next date, whether that night
 * exists yet, and whether the caller may set it up.
 */
export const ScheduledSessionSchema = z.object({
  seriesId: UuidSchema,
  name: z.string(),
  organisationId: UuidSchema,
  organisationName: z.string(),
  venueName: z.string().nullable(),
  schedule: ScheduleSchema.nullable(),
  nextAt: IsoDateTimeSchema.nullable(),
  /** The night already set up for the next date (or on now), if any. */
  nextOccurrenceId: UuidSchema.nullable(),
  canRun: z.boolean(),
});
export type ScheduledSession = z.infer<typeof ScheduledSessionSchema>;

export const MySessionSchema = z.object({
  occurrenceId: UuidSchema,
  seriesName: z.string(),
  organisationId: UuidSchema,
  organisationName: z.string(),
  venueName: z.string().nullable(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  state: OccurrenceStateSchema,
  myAttendance: AttendanceStatusSchema.nullable(),
  canManage: z.boolean(),
  /** What is happening right now, for the Rally home resume hero (open or live only). */
  live: z
    .object({
      roundNo: z.int().nullable(),
      roundStatus: z.string().nullable(),
      timer: TimerSchema.nullable(),
      courtsInPlay: z.int(),
      playersHere: z.int(),
      serverTime: IsoDateTimeSchema,
    })
    .nullable(),
});
export type MySession = z.infer<typeof MySessionSchema>;

/** A saved way of running a session: the series' defaults, startable with one tap. */
/** A person usually in a session preset. */
export const RegularSchema = z.object({
  participantId: UuidSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().nullable(),
});
export type Regular = z.infer<typeof RegularSchema>;

export const SetRegularsBodySchema = z.object({
  participantIds: z.array(UuidSchema).max(200),
});
export type SetRegularsBody = z.infer<typeof SetRegularsBodySchema>;

/** A host (Addendum 1.2): a club member who may set up and run any night of the session. */
export const HostSchema = z.object({
  profileId: UuidSchema,
  displayName: DisplayNameSchema,
  avatarUrl: z.string().nullable(),
});
export type Host = z.infer<typeof HostSchema>;

export const SetHostsBodySchema = z.object({
  profileIds: z.array(UuidSchema).max(50),
});
export type SetHostsBody = z.infer<typeof SetHostsBodySchema>;

export const PresetSchema = z.object({
  seriesId: UuidSchema,
  name: z.string(),
  organisationId: UuidSchema,
  organisationName: z.string(),
  organisationKind: z.enum(['club', 'personal']),
  ownerScope: z.enum(['personal', 'organisation', 'buddy_group']),
  sportId: SportIdSchema,
  venueId: UuidSchema.nullable(),
  venueName: z.string().nullable(),
  courts: z.int(),
  defaultRoundMinutes: z.int(),
  defaultDurationMinutes: z.int(),
  lastStartedAt: IsoDateTimeSchema.nullable(),
  /** A night that is live, or open and about to start, if any. */
  activeOccurrenceId: UuidSchema.nullable(),
  /** A night already set up for later (open or draft, starts in the future), if any. */
  upcomingOccurrenceId: UuidSchema.nullable(),
  upcomingStartsAt: IsoDateTimeSchema.nullable(),
  /** The next scheduled start, computed from the schedule; null without one. */
  nextAt: IsoDateTimeSchema.nullable(),
  schedule: ScheduleSchema.nullable(),
  /** How many people are registered automatically when this session starts. */
  regulars: z.int(),
  hosts: z.int(),
  /** The caller is a host rather than an organiser of the club. */
  asHost: z.boolean(),
});
export type Preset = z.infer<typeof PresetSchema>;

export const StartPresetBodySchema = z.object({
  /**
   * Defaults to now. "Set up" passes the next scheduled start; when a night already exists for
   * that start (another host got there first) it is returned instead of a duplicate.
   */
  startsAt: IsoDateTimeSchema.optional(),
  /** Open for check-in straight away (default true). */
  open: z.boolean().default(true),
  /** Tonight's format; defaults to the session's usual one. */
  mode: RotationModeSchema.optional(),
  format: MatchFormatSchema.optional(),
  roundMinutes: z.int().min(1).max(120).optional(),
});
export type StartPresetBody = z.infer<typeof StartPresetBodySchema>;

/** Keep-apart defaults (Addendum 1.2 step 2): copied onto each night as `avoid` pair locks. */
export const KeepApartPairSchema = z.object({
  participantA: UuidSchema,
  participantB: UuidSchema,
  displayNameA: DisplayNameSchema,
  displayNameB: DisplayNameSchema,
});
export type KeepApartPair = z.infer<typeof KeepApartPairSchema>;

export const SetKeepApartBodySchema = z.object({
  pairs: z
    .array(
      z
        .object({ participantA: UuidSchema, participantB: UuidSchema })
        .refine((p) => p.participantA !== p.participantB, {
          message: 'a participant cannot be kept apart from themselves',
        }),
    )
    .max(100),
});
export type SetKeepApartBody = z.infer<typeof SetKeepApartBodySchema>;

/** Night ratings (Addendum 1.2 step 3): a score and tags, never free text, never shown singly. */
export const RATING_TAGS = {
  positive: [
    { id: 'good_mix', label: 'Good mix of players' },
    { id: 'right_level', label: 'Right level for me' },
    { id: 'fair_rest', label: 'Fair rest' },
    { id: 'well_organised', label: 'Well organised' },
    { id: 'good_courts', label: 'Good courts' },
    { id: 'right_pace', label: 'Right pace' },
    { id: 'friendly', label: 'Friendly crowd' },
  ],
  negative: [
    { id: 'too_much_sitting', label: 'Too much sitting out' },
    { id: 'uneven_levels', label: 'Levels too uneven' },
    { id: 'started_late', label: 'Started late' },
    { id: 'too_crowded', label: 'Too crowded' },
    { id: 'poor_courts', label: 'Courts not great' },
    { id: 'rounds_too_short', label: 'Rounds too short' },
    { id: 'rounds_too_long', label: 'Rounds too long' },
    { id: 'disorganised', label: 'Felt disorganised' },
  ],
} as const;
/** 3 stars and up is positive. */
export const RATING_POSITIVE_FROM = 3;
/** Attendees may rate for this long after a night completes. */
export const RATING_WINDOW_DAYS = 7;
/** Aggregates are shown only from this many ratings, so no single rating can be read back. */
export const RATING_MIN_FOR_SUMMARY = 3;

export const RateOccurrenceBodySchema = z
  .object({
    score: z.int().min(0).max(5),
    tags: z
      .array(z.string().regex(/^[a-z_]{1,32}$/))
      .max(8)
      .default([]),
  })
  .refine(
    (b) => {
      const allowed = new Set<string>(
        (b.score >= RATING_POSITIVE_FROM ? RATING_TAGS.positive : RATING_TAGS.negative).map(
          (t) => t.id,
        ),
      );
      return b.tags.every((t) => allowed.has(t));
    },
    { message: 'tags must match the score: positive tags from 3 stars, negative below' },
  );
export type RateOccurrenceBody = z.infer<typeof RateOccurrenceBodySchema>;

export const RatingSummarySchema = z.object({
  count: z.int(),
  /** Withheld (null) until enough people have rated. */
  average: z.number().nullable(),
  tags: z.record(z.string(), z.int()).nullable(),
  /** The caller's own rating, if they gave one. */
  myRating: z.object({ score: z.int(), tags: z.array(z.string()) }).nullable(),
  /** The caller attended, the night is done, the window is open and they have not rated yet. */
  canRate: z.boolean(),
});
export type RatingSummary = z.infer<typeof RatingSummarySchema>;

export const SeriesRatingSummarySchema = z.object({
  count: z.int(),
  nights: z.int(),
  average: z.number().nullable(),
  tags: z.record(z.string(), z.int()).nullable(),
});
export type SeriesRatingSummary = z.infer<typeof SeriesRatingSummarySchema>;

export const PendingRatingSchema = z.object({
  occurrenceId: UuidSchema,
  seriesName: z.string(),
  organisationName: z.string(),
  startsAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
});
export type PendingRating = z.infer<typeof PendingRatingSchema>;

export const OccurrenceIdParamsSchema = z.object({ occurrenceId: UuidSchema });
export const SeriesIdParamsSchema = z.object({ seriesId: UuidSchema });
export const RoundIdParamsSchema = z.object({ roundId: UuidSchema });
