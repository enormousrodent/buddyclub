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
});
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
  }),
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
  }),
  participant: NamedParticipantSchema,
  attendanceStatus: AttendanceStatusSchema.nullable(),
  current: MyGameSchema.nullable(),
  next: MyGameSchema.nullable(),
});
export type MySchedule = z.infer<typeof MyScheduleSchema>;

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
  /** An occurrence that is open or live right now, if any. */
  activeOccurrenceId: UuidSchema.nullable(),
  /** How many people are registered automatically when this preset starts. */
  regulars: z.int(),
});
export type Preset = z.infer<typeof PresetSchema>;

export const StartPresetBodySchema = z.object({
  /** Defaults to now. */
  startsAt: IsoDateTimeSchema.optional(),
  /** Open for check-in straight away (default true). */
  open: z.boolean().default(true),
});
export type StartPresetBody = z.infer<typeof StartPresetBodySchema>;

export const OccurrenceIdParamsSchema = z.object({ occurrenceId: UuidSchema });
export const SeriesIdParamsSchema = z.object({ seriesId: UuidSchema });
export const RoundIdParamsSchema = z.object({ roundId: UuidSchema });
