import { z } from 'zod';
import { IsoDateTimeSchema } from './common';
import { TimerSchema } from './sessions';

/**
 * Public, redacted projections (spec section 11; ADR-011, ADR-016). Served by the API from a slug
 * the organiser enabled; no internal ids beyond the slug, no guest links, no contact data.
 */

export const PublicEventSchema = z.object({
  slug: z.string(),
  kind: z.enum(['session', 'meet']),
  name: z.string(),
  organisationName: z.string(),
  venueName: z.string().nullable(),
  startsAt: IsoDateTimeSchema,
  state: z.string(),
  /** Only for signed-in callers: how this person relates to the event. */
  viewer: z
    .object({
      member: z.boolean(),
      participantStatus: z.string().nullable(),
      canJoin: z.boolean(),
    })
    .nullable(),
});
export type PublicEvent = z.infer<typeof PublicEventSchema>;

export const PublicCourtSchema = z.object({
  code: z.string(),
  /** Two sides of display names (social) or team names (meet). Empty when the court is free. */
  sides: z.array(z.array(z.string())),
  label: z.string().nullable(),
  score: z.string().nullable(),
});

export const PublicSessionBoardSchema = z.object({
  kind: z.literal('session'),
  slug: z.string(),
  name: z.string(),
  organisationName: z.string(),
  venueName: z.string().nullable(),
  state: z.string(),
  serverTime: IsoDateTimeSchema,
  round: z.object({ sequenceNo: z.int(), status: z.string(), timer: TimerSchema }).nullable(),
  courts: z.array(PublicCourtSchema),
  resting: z.array(z.string()),
  next: z
    .object({
      sequenceNo: z.int(),
      courts: z.array(PublicCourtSchema),
      resting: z.array(z.string()),
    })
    .nullable(),
  playersHere: z.int(),
});

export const PublicStandingRowSchema = z.object({
  rank: z.int(),
  team: z.string(),
  played: z.int(),
  won: z.int(),
  drawn: z.int(),
  lost: z.int(),
  rubbers: z.string(),
  difference: z.int(),
  tied: z.boolean(),
});

export const PublicMeetBoardSchema = z.object({
  kind: z.literal('meet'),
  slug: z.string(),
  name: z.string(),
  competitionName: z.string(),
  organisationName: z.string(),
  venueName: z.string().nullable(),
  state: z.string(),
  format: z.enum(['round_robin', 'pools_knockout']),
  serverTime: IsoDateTimeSchema,
  nowPlaying: z.array(PublicCourtSchema),
  upNext: z.array(
    z.object({
      label: z.string(),
      home: z.string(),
      away: z.string(),
      division: z.string().nullable(),
    }),
  ),
  divisions: z.array(
    z.object({
      name: z.string(),
      courts: z.array(z.string()),
      rows: z.array(PublicStandingRowSchema),
      pendingFixtures: z.int(),
    }),
  ),
  knockout: z.array(
    z.object({
      round: z.int(),
      slot: z.int(),
      label: z.string(),
      home: z.string().nullable(),
      away: z.string().nullable(),
      status: z.string(),
      score: z.string().nullable(),
      winner: z.string().nullable(),
    }),
  ),
});

export const PublicBoardSchema = z.discriminatedUnion('kind', [
  PublicSessionBoardSchema,
  PublicMeetBoardSchema,
]);
export type PublicBoard = z.infer<typeof PublicBoardSchema>;
export type PublicSessionBoard = z.infer<typeof PublicSessionBoardSchema>;
export type PublicMeetBoard = z.infer<typeof PublicMeetBoardSchema>;

export const JoinResultSchema = z.object({
  participantId: z.string(),
  attendanceStatus: z.string(),
  occurrenceId: z.string(),
});
export type JoinResult = z.infer<typeof JoinResultSchema>;

export const PublicSlugParamsSchema = z.object({ slug: z.string().regex(/^[a-z0-9]{6,32}$/) });
