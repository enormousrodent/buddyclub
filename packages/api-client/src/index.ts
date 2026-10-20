import {
  ActivitySchema,
  BoardSchema,
  DiscoverResultSchema,
  GroupCardSchema,
  InterestSchema,
  MyCommunitySchema,
  MyGroupSchema,
  CORRELATION_ID_HEADER,
  CourtSchema,
  EntrySchema,
  GroupDetailSchema,
  GroupSchema,
  GuestGrantCreatedSchema,
  GuestGrantSchema,
  GuestMeSchema,
  GuestSessionSchema,
  HealthResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  IF_MATCH_HEADER,
  InvitationCreatedSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  JoinResultSchema,
  listOf,
  MeResponseSchema,
  MemberSchema,
  MyScheduleSchema,
  MySessionSchema,
  OccurrenceSchema,
  PresetSchema,
  OrganisationSchema,
  PairLockSchema,
  ParticipantSchema,
  ProblemDetailsSchema,
  PublicAccessSchema,
  PublicBoardSchema,
  PublicEventSchema,
  RedeemInvitationResponseSchema,
  RotationPreviewSchema,
  RoundSchema,
  RulesetSchema,
  SessionSeriesSchema,
  SportSchema,
  VenueDetailSchema,
  VenueSchema,
  type AddEntryBody,
  type CreateActivityBody,
  type CreateCommunityGroupBody,
  type DiscoverQuery,
  type UpdateCommunityGroupBody,
  type AddGroupMemberBody,
  type CreateCourtBody,
  type CreateGroupBody,
  type CreateGuestGrantBody,
  type CreateInvitationBody,
  type CreateOccurrenceBody,
  type CreateOrganisationBody,
  type CreatePairLockBody,
  type CreateParticipantBody,
  type CreateRulesetBody,
  type CreateSessionSeriesBody,
  type CreateVenueBody,
  type HealthResponse,
  type MeResponse,
  type ProblemDetails,
  type RotationPreviewRequest,
  type StartPresetBody,
  type UpdateCourtBody,
  type UpdateGroupBody,
  type UpdateMeBody,
  type UpdateMemberBody,
  type UpdateOccurrenceBody,
  type UpdateOrganisationBody,
  type UpdateParticipantBody,
  type UpdateSessionSeriesBody,
  type UpdateVenueBody,
  type WithdrawBody,
} from '@buddyclub/shared-types';
import { z, type ZodType } from 'zod';
import { competitionClient } from './competitions';

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current bearer credential (Supabase access token or guest credential), or null. */
  getAccessToken?: () => Promise<string | null> | string | null;
  fetch?: typeof fetch;
  /** Optional correlation id factory; the server generates one when absent. */
  correlationId?: () => string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get code(): ProblemDetails['code'] | null {
    return this.problem?.code ?? null;
  }
}

export interface RequestOptions {
  idempotencyKey?: string;
  /** Sent as If-Match for optimistic concurrency on versioned aggregates. */
  ifMatch?: number;
  signal?: AbortSignal;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const NoContent = z.null();
const WithdrawResultSchema = z.object({
  entry: EntrySchema,
  cancelledRoundIds: z.array(z.string()),
  currentMatch: z.object({ matchId: z.string(), action: z.enum(['finish', 'cancel']) }).nullable(),
});

function parseProblem(text: string): ProblemDetails | null {
  try {
    const parsed = ProblemDetailsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(
    method: Method,
    path: string,
    schema: ZodType<T>,
    requestOptions: RequestOptions & { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers({ accept: 'application/json' });
    if (requestOptions.body !== undefined) headers.set('content-type', 'application/json');
    if (requestOptions.idempotencyKey)
      headers.set(IDEMPOTENCY_KEY_HEADER, requestOptions.idempotencyKey);
    if (requestOptions.ifMatch !== undefined)
      headers.set(IF_MATCH_HEADER, String(requestOptions.ifMatch));
    if (options.correlationId) headers.set(CORRELATION_ID_HEADER, options.correlationId());
    if (requestOptions.auth !== false && options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) headers.set('authorization', `Bearer ${token}`);
    }

    const init: RequestInit = { method, headers };
    if (requestOptions.body !== undefined) init.body = JSON.stringify(requestOptions.body);
    if (requestOptions.signal) init.signal = requestOptions.signal;

    const response = await fetchImpl(`${base}${path}`, init);
    const text = await response.text();
    const json: unknown = text.length ? JSON.parse(text) : null;

    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(json);
      throw new ApiError(
        response.status,
        problem.success ? problem.data : null,
        problem.success ? `${problem.data.code}: ${problem.data.title}` : `HTTP ${response.status}`,
      );
    }
    return schema.parse(json);
  }

  /** Same auth and error handling, but returns the body as text (CSV exports). */
  async function requestText(path: string, requestOptions: RequestOptions = {}): Promise<string> {
    const headers = new Headers({ accept: 'text/csv, application/json' });
    if (options.correlationId) headers.set(CORRELATION_ID_HEADER, options.correlationId());
    if (options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) headers.set('authorization', `Bearer ${token}`);
    }
    const init: RequestInit = { method: 'GET', headers };
    if (requestOptions.signal) init.signal = requestOptions.signal;
    const response = await fetchImpl(`${base}${path}`, init);
    const text = await response.text();
    if (!response.ok) {
      const problem = parseProblem(text);
      throw new ApiError(
        response.status,
        problem,
        problem ? `${problem.code}: ${problem.title}` : `HTTP ${response.status}`,
      );
    }
    return text;
  }

  const enc = encodeURIComponent;
  /** POST with an explicit JSON body (empty object by default) so body-less commands validate cleanly. */
  const command = <T>(path: string, schema: ZodType<T>, o?: RequestOptions, body: unknown = {}) =>
    request('POST', path, schema, { ...o, body });

  return {
    ...competitionClient(request, requestText),

    community: {
      interests: () => request('GET', '/v1/interests', listOf(InterestSchema), { auth: false }),
      discover: (q: DiscoverQuery = {}, o?: RequestOptions) => {
        const params = new URLSearchParams();
        if (q.q) params.set('q', q.q);
        if (q.interest) params.set('interest', q.interest);
        if (q.locality) params.set('locality', q.locality);
        const qs = params.toString();
        return request('GET', `/v1/public/discover${qs ? `?${qs}` : ''}`, DiscoverResultSchema, {
          ...o,
          auth: false,
        });
      },
      createGroup: (body: CreateCommunityGroupBody, o?: RequestOptions) =>
        command('/v1/community/groups', GroupCardSchema, o, body),
      group: (groupId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/community/groups/${enc(groupId)}`,
          z.object({
            group: GroupCardSchema,
            activities: z.array(ActivitySchema),
            myRole: z.enum(['organiser', 'member']).nullable(),
          }),
          o ?? {},
        ),
      updateGroup: (groupId: string, body: UpdateCommunityGroupBody, o?: RequestOptions) =>
        request('PATCH', `/v1/community/groups/${enc(groupId)}`, GroupCardSchema, { ...o, body }),
      joinGroup: (groupId: string, o?: RequestOptions) =>
        command(`/v1/community/groups/${enc(groupId)}/join`, MyGroupSchema, o),
      createActivity: (groupId: string, body: CreateActivityBody, o?: RequestOptions) =>
        command(`/v1/community/groups/${enc(groupId)}/activities`, ActivitySchema, o, body),
      activity: (activityId: string, o?: RequestOptions) =>
        request('GET', `/v1/community/activities/${enc(activityId)}`, ActivitySchema, o ?? {}),
      rsvp: (activityId: string, status: 'going' | 'maybe' | 'not_going', o?: RequestOptions) =>
        command(`/v1/community/activities/${enc(activityId)}/rsvp`, ActivitySchema, o, { status }),
      cancelActivity: (activityId: string, o?: RequestOptions) =>
        command(`/v1/community/activities/${enc(activityId)}/cancel`, ActivitySchema, o),
      linkRally: (activityId: string, occurrenceId: string | null, o?: RequestOptions) =>
        command(`/v1/community/activities/${enc(activityId)}/rally-link`, ActivitySchema, o, {
          occurrenceId,
        }),
      mine: (o?: RequestOptions) => request('GET', '/v1/me/community', MyCommunitySchema, o ?? {}),
    },

    public: {
      event: (slug: string, o?: RequestOptions) =>
        request('GET', `/v1/public/events/${enc(slug)}`, PublicEventSchema, o ?? {}),
      board: (slug: string, o?: RequestOptions) =>
        request('GET', `/v1/public/events/${enc(slug)}/board`, PublicBoardSchema, {
          ...o,
          auth: false,
        }),
      join: (slug: string, o?: RequestOptions) =>
        command(`/v1/public/events/${enc(slug)}/join`, JoinResultSchema, o),
    },
    health: () => request('GET', '/healthz', HealthResponseSchema, { auth: false }),

    me: (o?: RequestOptions) => request('GET', '/v1/me', MeResponseSchema, o ?? {}),
    updateMe: (body: UpdateMeBody, o?: RequestOptions) =>
      request('PATCH', '/v1/me', MeResponseSchema, { ...o, body }),

    sports: () => request('GET', '/v1/sports', listOf(SportSchema), { auth: false }),

    organisations: {
      create: (body: CreateOrganisationBody, o?: RequestOptions) =>
        command('/v1/organisations', OrganisationSchema, o, body),
      get: (orgId: string, o?: RequestOptions) =>
        request('GET', `/v1/organisations/${enc(orgId)}`, OrganisationSchema, o ?? {}),
      /** Personal Rally workspace, created on first call (ADR-017). */
      workspace: (o?: RequestOptions) => command('/v1/me/workspace', OrganisationSchema, o),
      update: (orgId: string, body: UpdateOrganisationBody, o?: RequestOptions) =>
        request('PATCH', `/v1/organisations/${enc(orgId)}`, OrganisationSchema, { ...o, body }),
      members: (orgId: string, o?: RequestOptions) =>
        request('GET', `/v1/organisations/${enc(orgId)}/members`, listOf(MemberSchema), o ?? {}),
      updateMember: (
        orgId: string,
        profileId: string,
        body: UpdateMemberBody,
        o?: RequestOptions,
      ) =>
        request(
          'PATCH',
          `/v1/organisations/${enc(orgId)}/members/${enc(profileId)}`,
          MemberSchema,
          {
            ...o,
            body,
          },
        ),
      removeMember: (orgId: string, profileId: string, o?: RequestOptions) =>
        request(
          'DELETE',
          `/v1/organisations/${enc(orgId)}/members/${enc(profileId)}`,
          NoContent,
          o ?? {},
        ),
    },

    invitations: {
      create: (orgId: string, body: CreateInvitationBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/invitations`, InvitationCreatedSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/organisations/${enc(orgId)}/invitations`,
          listOf(InvitationSchema),
          o ?? {},
        ),
      revoke: (orgId: string, invitationId: string, o?: RequestOptions) =>
        request(
          'DELETE',
          `/v1/organisations/${enc(orgId)}/invitations/${enc(invitationId)}`,
          NoContent,
          o ?? {},
        ),
      preview: (token: string) =>
        request('GET', `/v1/invitations/${enc(token)}/preview`, InvitationPreviewSchema, {
          auth: false,
        }),
      redeem: (token: string, o?: RequestOptions) =>
        command(`/v1/invitations/${enc(token)}/redeem`, RedeemInvitationResponseSchema, o),
    },

    participants: {
      create: (orgId: string, body: CreateParticipantBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/participants`, ParticipantSchema, o, body),
      list: (orgId: string, includeArchived = false, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/organisations/${enc(orgId)}/participants${includeArchived ? '?includeArchived=true' : ''}`,
          listOf(ParticipantSchema),
          o ?? {},
        ),
      get: (orgId: string, participantId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/organisations/${enc(orgId)}/participants/${enc(participantId)}`,
          ParticipantSchema,
          o ?? {},
        ),
      update: (
        orgId: string,
        participantId: string,
        body: UpdateParticipantBody,
        o?: RequestOptions,
      ) =>
        request(
          'PATCH',
          `/v1/organisations/${enc(orgId)}/participants/${enc(participantId)}`,
          ParticipantSchema,
          { ...o, body },
        ),
      archive: (orgId: string, participantId: string, o?: RequestOptions) =>
        command(
          `/v1/organisations/${enc(orgId)}/participants/${enc(participantId)}/archive`,
          ParticipantSchema,
          o,
        ),
    },

    guestGrants: {
      create: (
        orgId: string,
        participantId: string,
        body: CreateGuestGrantBody,
        o?: RequestOptions,
      ) =>
        command(
          `/v1/organisations/${enc(orgId)}/participants/${enc(participantId)}/guest-grants`,
          GuestGrantCreatedSchema,
          o,
          body,
        ),
      list: (orgId: string, participantId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/organisations/${enc(orgId)}/participants/${enc(participantId)}/guest-grants`,
          listOf(GuestGrantSchema),
          o ?? {},
        ),
      revoke: (orgId: string, participantId: string, grantId: string, o?: RequestOptions) =>
        request(
          'DELETE',
          `/v1/organisations/${enc(orgId)}/participants/${enc(participantId)}/guest-grants/${enc(grantId)}`,
          NoContent,
          o ?? {},
        ),
    },

    rulesets: {
      create: (orgId: string, body: CreateRulesetBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/rulesets`, RulesetSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request('GET', `/v1/organisations/${enc(orgId)}/rulesets`, listOf(RulesetSchema), o ?? {}),
    },

    sessions: {
      presets: (o?: RequestOptions) =>
        request('GET', '/v1/me/presets', listOf(PresetSchema), o ?? {}),
      startPreset: (seriesId: string, body: StartPresetBody = { open: true }, o?: RequestOptions) =>
        command(`/v1/sessions/${enc(seriesId)}/start`, OccurrenceSchema, o, body),
      create: (orgId: string, body: CreateSessionSeriesBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/sessions`, SessionSeriesSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/organisations/${enc(orgId)}/sessions`,
          listOf(SessionSeriesSchema),
          o ?? {},
        ),
      get: (seriesId: string, o?: RequestOptions) =>
        request('GET', `/v1/sessions/${enc(seriesId)}`, SessionSeriesSchema, o ?? {}),
      update: (seriesId: string, body: UpdateSessionSeriesBody, o?: RequestOptions) =>
        request('PATCH', `/v1/sessions/${enc(seriesId)}`, SessionSeriesSchema, { ...o, body }),
      createOccurrence: (seriesId: string, body: CreateOccurrenceBody, o?: RequestOptions) =>
        command(`/v1/sessions/${enc(seriesId)}/occurrences`, OccurrenceSchema, o, body),
      mine: (o?: RequestOptions) =>
        request('GET', '/v1/me/sessions', listOf(MySessionSchema), o ?? {}),
    },

    occurrences: {
      list: (
        orgId: string,
        query: { from?: string; to?: string; state?: string } = {},
        o?: RequestOptions,
      ) => {
        const qs = new URLSearchParams(
          Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][],
        ).toString();
        return request(
          'GET',
          `/v1/organisations/${enc(orgId)}/occurrences${qs ? `?${qs}` : ''}`,
          listOf(OccurrenceSchema),
          o ?? {},
        );
      },
      get: (occurrenceId: string, o?: RequestOptions) =>
        request('GET', `/v1/occurrences/${enc(occurrenceId)}`, OccurrenceSchema, o ?? {}),
      update: (occurrenceId: string, body: UpdateOccurrenceBody, o?: RequestOptions) =>
        request('PATCH', `/v1/occurrences/${enc(occurrenceId)}`, OccurrenceSchema, { ...o, body }),
      transition: (
        occurrenceId: string,
        action: 'open' | 'complete' | 'cancel',
        o?: RequestOptions,
      ) => command(`/v1/occurrences/${enc(occurrenceId)}/${action}`, OccurrenceSchema, o),
      board: (occurrenceId: string, o?: RequestOptions) =>
        request('GET', `/v1/occurrences/${enc(occurrenceId)}/board`, BoardSchema, o ?? {}),
      setPublicAccess: (occurrenceId: string, enabled: boolean, o?: RequestOptions) =>
        command(`/v1/occurrences/${enc(occurrenceId)}/public-access`, PublicAccessSchema, o, {
          enabled,
        }),
      exportCsv: (occurrenceId: string, o?: RequestOptions) =>
        requestText(`/v1/occurrences/${enc(occurrenceId)}/export.csv`, o),
      mySchedule: (occurrenceId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/occurrences/${enc(occurrenceId)}/my-schedule`,
          MyScheduleSchema,
          o ?? {},
        ),
      addEntry: (occurrenceId: string, body: AddEntryBody, o?: RequestOptions) =>
        command(`/v1/occurrences/${enc(occurrenceId)}/participants`, EntrySchema, o, body),
      entries: (occurrenceId: string, o?: RequestOptions) =>
        request(
          'GET',
          `/v1/occurrences/${enc(occurrenceId)}/participants`,
          listOf(EntrySchema),
          o ?? {},
        ),
      checkIn: (occurrenceId: string, participantId?: string, o?: RequestOptions) =>
        command(
          `/v1/occurrences/${enc(occurrenceId)}/check-ins`,
          EntrySchema,
          o,
          participantId ? { participantId } : {},
        ),
      withdraw: (
        occurrenceId: string,
        participantId: string,
        body: WithdrawBody,
        o?: RequestOptions,
      ) =>
        command(
          `/v1/occurrences/${enc(occurrenceId)}/participants/${enc(participantId)}/withdraw`,
          WithdrawResultSchema,
          o,
          body,
        ),
      noShow: (occurrenceId: string, participantId: string, o?: RequestOptions) =>
        command(
          `/v1/occurrences/${enc(occurrenceId)}/participants/${enc(participantId)}/no-show`,
          EntrySchema,
          o,
        ),
      guestGrant: (
        occurrenceId: string,
        participantId: string,
        body: CreateGuestGrantBody,
        o?: RequestOptions,
      ) =>
        command(
          `/v1/occurrences/${enc(occurrenceId)}/participants/${enc(participantId)}/guest-grants`,
          GuestGrantCreatedSchema,
          o,
          body,
        ),
      createPairLock: (occurrenceId: string, body: CreatePairLockBody, o?: RequestOptions) =>
        command(`/v1/occurrences/${enc(occurrenceId)}/pair-locks`, PairLockSchema, o, body),
      releasePairLock: (occurrenceId: string, lockId: string, o?: RequestOptions) =>
        request(
          'DELETE',
          `/v1/occurrences/${enc(occurrenceId)}/pair-locks/${enc(lockId)}`,
          NoContent,
          o ?? {},
        ),
      previewRotation: (
        occurrenceId: string,
        body: RotationPreviewRequest = {},
        o?: RequestOptions,
      ) =>
        command(
          `/v1/occurrences/${enc(occurrenceId)}/rotations/preview`,
          RotationPreviewSchema,
          o,
          body,
        ),
      commitRotation: (occurrenceId: string, previewId: string, o?: RequestOptions) =>
        command(`/v1/occurrences/${enc(occurrenceId)}/rotations/commit`, RoundSchema, o, {
          previewId,
        }),
    },

    rounds: {
      transition: (
        roundId: string,
        action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel',
        o?: RequestOptions,
      ) => command(`/v1/rounds/${enc(roundId)}/${action}`, RoundSchema, o),
    },

    guest: {
      redeem: (token: string) =>
        request('POST', '/v1/guest-access/redeem', GuestSessionSchema, {
          auth: false,
          body: { token },
        }),
      me: (o?: RequestOptions) => request('GET', '/v1/guest/me', GuestMeSchema, o ?? {}),
      schedule: (o?: RequestOptions) =>
        request('GET', '/v1/guest/schedule', MyScheduleSchema, o ?? {}),
    },

    groups: {
      create: (orgId: string, body: CreateGroupBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/groups`, GroupSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request('GET', `/v1/organisations/${enc(orgId)}/groups`, listOf(GroupSchema), o ?? {}),
      get: (groupId: string, o?: RequestOptions) =>
        request('GET', `/v1/groups/${enc(groupId)}`, GroupDetailSchema, o ?? {}),
      update: (groupId: string, body: UpdateGroupBody, o?: RequestOptions) =>
        request('PATCH', `/v1/groups/${enc(groupId)}`, GroupSchema, { ...o, body }),
      addMember: (groupId: string, body: AddGroupMemberBody, o?: RequestOptions) =>
        command(`/v1/groups/${enc(groupId)}/members`, GroupDetailSchema, o, body),
      removeMember: (groupId: string, participantId: string, o?: RequestOptions) =>
        request(
          'DELETE',
          `/v1/groups/${enc(groupId)}/members/${enc(participantId)}`,
          NoContent,
          o ?? {},
        ),
    },

    venues: {
      create: (orgId: string, body: CreateVenueBody, o?: RequestOptions) =>
        command(`/v1/organisations/${enc(orgId)}/venues`, VenueSchema, o, body),
      list: (orgId: string, o?: RequestOptions) =>
        request('GET', `/v1/organisations/${enc(orgId)}/venues`, listOf(VenueSchema), o ?? {}),
      get: (venueId: string, o?: RequestOptions) =>
        request('GET', `/v1/venues/${enc(venueId)}`, VenueDetailSchema, o ?? {}),
      update: (venueId: string, body: UpdateVenueBody, o?: RequestOptions) =>
        request('PATCH', `/v1/venues/${enc(venueId)}`, VenueSchema, { ...o, body }),
      createCourt: (venueId: string, body: CreateCourtBody, o?: RequestOptions) =>
        command(`/v1/venues/${enc(venueId)}/courts`, CourtSchema, o, body),
      updateCourt: (courtId: string, body: UpdateCourtBody, o?: RequestOptions) =>
        request('PATCH', `/v1/courts/${enc(courtId)}`, CourtSchema, { ...o, body }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { HealthResponse, MeResponse };
