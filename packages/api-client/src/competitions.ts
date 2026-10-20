import {
  CompetitionSchema,
  DisputeSchema,
  FixturePreviewSchema,
  FixtureSchema,
  ImportResultSchema,
  KnockoutAdvanceSchema,
  listOf,
  MeetSchema,
  MyCompetitionsSchema,
  ProgressionPreviewSchema,
  PublicAccessSchema,
  SeasonSchema,
  StandingsSchema,
  TeamDetailSchema,
  TeamSchema,
  type CommitProgressionBody,
  type CreateCompetitionBody,
  type CreateMeetBody,
  type CreateSeasonBody,
  type CreateTeamBody,
  type LineupBody,
  type ResolveDisputeBody,
  type SetMeetEntriesBody,
  type SubmitResultBody,
  type UpdateTeamBody,
} from '@buddyclub/shared-types';
import { z, type ZodType } from 'zod';

export interface RequestOptions {
  idempotencyKey?: string;
  ifMatch?: number;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RequestFn = <T>(
  method: Method,
  path: string,
  schema: ZodType<T>,
  requestOptions?: RequestOptions & { body?: unknown; auth?: boolean },
) => Promise<T>;
/** Fetches a text document (CSV exports) with the same auth handling. */
export type TextRequestFn = (path: string, requestOptions?: RequestOptions) => Promise<string>;

const NoContent = z.null();
const CompetitionDetailSchema = CompetitionSchema.extend({ seasons: z.array(SeasonSchema) });

/** Phase 3 and 4 client surface: competitions, teams, meets, fixtures, results, standings, progression, tournaments, disputes, reports. */
export function competitionClient(request: RequestFn, requestText: TextRequestFn) {
  const enc = encodeURIComponent;
  const command = <T>(path: string, schema: ZodType<T>, o?: RequestOptions, body: unknown = {}) =>
    request('POST', path, schema, { ...o, body });

  return {
    competitions: {
      create: (orgId: string, body: CreateCompetitionBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/competitions`, CompetitionSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/organisations/${enc(orgId)}/competitions`,
          listOf(CompetitionSchema),
          o ?? {},
        ),
      get: (competitionId: string, o?: RequestOptions) =>
        request('GET', `/v1/competitions/${enc(competitionId)}`, CompetitionDetailSchema, o ?? {}),
      createSeason: (competitionId: string, body: CreateSeasonBody, o?: RequestOptions) =>
        command(`/v1/competitions/${enc(competitionId)}/seasons`, SeasonSchema, o, body),
      getSeason: (seasonId: string, o?: RequestOptions) =>
        request('GET', `/v1/seasons/${enc(seasonId)}`, SeasonSchema, o ?? {}),
      /** The player's teams, meets and fixtures across clubs. */
      mine: (o?: RequestOptions) =>
        request('GET', '/v1/me/competitions', MyCompetitionsSchema, o ?? {}),
    },

    teams: {
      create: (orgId: string, body: CreateTeamBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/teams`, TeamSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request('GET', `/v1/organisations/${enc(orgId)}/teams`, listOf(TeamSchema), o ?? {}),
      get: (teamId: string, o?: RequestOptions) =>
        request('GET', `/v1/teams/${enc(teamId)}`, TeamDetailSchema, o ?? {}),
      update: (teamId: string, body: UpdateTeamBody, o?: RequestOptions) =>
        request('PATCH', `/v1/teams/${enc(teamId)}`, TeamSchema, { ...o, body }),
      addToRoster: (teamId: string, participantId: string, o?: RequestOptions) =>
        command(`/v1/teams/${enc(teamId)}/roster`, TeamDetailSchema, o, { participantId }),
      removeFromRoster: (teamId: string, participantId: string, o?: RequestOptions) =>
        request(
          'DELETE',
          `/v1/teams/${enc(teamId)}/roster/${enc(participantId)}`,
          NoContent,
          o ?? {},
        ),
      importCsv: (orgId: string, csv: string, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/teams/import`, ImportResultSchema, o, { csv }),
    },

    meets: {
      create: (seasonId: string, body: CreateMeetBody, o?: RequestOptions) =>
        command(`/v1/seasons/${enc(seasonId)}/meets`, MeetSchema, o, body),
      list: (seasonId: string, o?: RequestOptions) =>
        request('GET', `/v1/seasons/${enc(seasonId)}/meets`, listOf(MeetSchema), o ?? {}),
      get: (meetId: string, o?: RequestOptions) =>
        request('GET', `/v1/meets/${enc(meetId)}`, MeetSchema, o ?? {}),
      setDivisionTeams: (
        meetId: string,
        divisionId: string,
        teamIds: string[],
        o?: RequestOptions,
      ) =>
        request('PUT', `/v1/meets/${enc(meetId)}/divisions/${enc(divisionId)}/teams`, MeetSchema, {
          ...o,
          body: { teamIds },
        }),
      setDivisionCourts: (
        meetId: string,
        divisionId: string,
        courtIds: string[],
        exclusive = true,
        o?: RequestOptions,
      ) =>
        request('PUT', `/v1/meets/${enc(meetId)}/divisions/${enc(divisionId)}/courts`, MeetSchema, {
          ...o,
          body: { courtIds, exclusive },
        }),
      /** Tournament draw: distributes the entrants across the pools by seed. */
      setEntries: (meetId: string, body: SetMeetEntriesBody, o?: RequestOptions) =>
        request('PUT', `/v1/meets/${enc(meetId)}/entries`, MeetSchema, { ...o, body }),
      previewFixtures: (meetId: string, o?: RequestOptions) =>
        command(`/v1/meets/${enc(meetId)}/fixtures/preview`, FixturePreviewSchema, o),
      commitFixtures: (meetId: string, o?: RequestOptions) =>
        command(`/v1/meets/${enc(meetId)}/fixtures/commit`, MeetSchema, o),
      fixtures: (meetId: string, o?: RequestOptions) =>
        request('GET', `/v1/meets/${enc(meetId)}/fixtures`, listOf(FixtureSchema), o ?? {}),
      advanceKnockout: (meetId: string, o?: RequestOptions) =>
        command(`/v1/meets/${enc(meetId)}/knockout/advance`, KnockoutAdvanceSchema, o),
      standings: (meetId: string, o?: RequestOptions) =>
        request('GET', `/v1/meets/${enc(meetId)}/standings`, StandingsSchema, o ?? {}),
      previewProgression: (meetId: string, o?: RequestOptions) =>
        command(`/v1/meets/${enc(meetId)}/progression/preview`, ProgressionPreviewSchema, o),
      commitProgression: (meetId: string, body: CommitProgressionBody, o?: RequestOptions) =>
        command(`/v1/meets/${enc(meetId)}/progression/commit`, ProgressionPreviewSchema, o, body),
      disputes: (meetId: string, o?: RequestOptions) =>
        request('GET', `/v1/meets/${enc(meetId)}/disputes`, listOf(DisputeSchema), o ?? {}),
      setPublicAccess: (meetId: string, enabled: boolean, o?: RequestOptions) =>
        command(`/v1/meets/${enc(meetId)}/public-access`, PublicAccessSchema, o, { enabled }),
      exportCsv: (meetId: string, o?: RequestOptions) =>
        requestText(`/v1/meets/${enc(meetId)}/export.csv`, o),
      standingsCsv: (meetId: string, o?: RequestOptions) =>
        requestText(`/v1/meets/${enc(meetId)}/standings.csv`, o),
    },

    fixtures: {
      submitLineup: (fixtureId: string, teamId: string, body: LineupBody, o?: RequestOptions) =>
        request('PUT', `/v1/fixtures/${enc(fixtureId)}/lineups/${enc(teamId)}`, FixtureSchema, {
          ...o,
          body,
        }),
      call: (matchId: string, courtId: string, overrideReason?: string, o?: RequestOptions) =>
        command(`/v1/matches/${enc(matchId)}/call`, FixtureSchema, o, {
          courtId,
          ...(overrideReason ? { overrideReason } : {}),
        }),
      start: (matchId: string, o?: RequestOptions) =>
        command(`/v1/matches/${enc(matchId)}/start`, FixtureSchema, o),
      submitResult: (matchId: string, body: SubmitResultBody, o?: RequestOptions) =>
        command(`/v1/matches/${enc(matchId)}/results`, FixtureSchema, o, body),
      confirmResult: (matchId: string, revision: number, o?: RequestOptions) =>
        command(`/v1/matches/${enc(matchId)}/results/${revision}/confirm`, FixtureSchema, o),
      disputeResult: (matchId: string, revision: number, reason: string, o?: RequestOptions) =>
        command(`/v1/matches/${enc(matchId)}/results/${revision}/dispute`, FixtureSchema, o, {
          reason,
        }),
      resolveDispute: (
        matchId: string,
        revision: number,
        body: ResolveDisputeBody,
        o?: RequestOptions,
      ) =>
        command(`/v1/matches/${enc(matchId)}/results/${revision}/resolve`, FixtureSchema, o, body),
    },
  };
}
