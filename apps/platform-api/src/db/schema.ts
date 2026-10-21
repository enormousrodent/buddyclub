import type { MembershipStatus, ParticipantSource, Role } from '@buddyclub/shared-types';
import type { ColumnType, Generated, JSONColumnType } from 'kysely';

/**
 * Kysely table definitions. Keep in step with infra/supabase/migrations; `pnpm db:cloud:types`
 * generates a reference file to diff against when a migration changes a table.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export interface UserProfilesTable {
  id: Generated<string>;
  auth_user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  locale: Generated<string>;
  anonymised_at: NullableTimestamp;
  /** Buddy profile (Addendum 1.3). */
  locality: string | null;
  bio: string | null;
  discoverable: Generated<boolean>;
  show_gear: Generated<boolean>;
  adult_confirmed_at: NullableTimestamp;
  buddyclub_onboarded_at: NullableTimestamp;
  rally_onboarded_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProfileActivitiesTable {
  id: Generated<string>;
  profile_id: string;
  interest_id: string;
  sport_id: string | null;
  level: string | null;
  days: JSONColumnType<Record<string, string[]>>;
  note: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ProfileGearTable {
  id: Generated<string>;
  profile_id: string;
  interest_id: string;
  sport_id: string | null;
  name: string;
  detail: string | null;
  sort_order: Generated<number>;
  created_at: Generated<Timestamp>;
}

export interface ParticipantsTable {
  id: Generated<string>;
  organisation_id: string;
  user_profile_id: string | null;
  display_name: string;
  source: Generated<ParticipantSource>;
  declared_attributes: JSONColumnType<Record<string, unknown>>;
  skill_rating: ColumnType<
    string | null,
    number | string | null | undefined,
    number | string | null
  >;
  archived_at: NullableTimestamp;
  created_by_profile_id: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GuestGrantsTable {
  id: Generated<string>;
  participant_id: string;
  session_occurrence_id: string | null;
  token_hash: string;
  scopes: Generated<string[]>;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
  redeemed_at: NullableTimestamp;
  redeem_count: Generated<number>;
  max_redeems: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
}

export interface OrganisationsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  owner_profile_id: string;
  kind: Generated<'club' | 'personal'>;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MembershipsTable {
  id: Generated<string>;
  organisation_id: string;
  user_profile_id: string;
  role: Role;
  status: Generated<MembershipStatus>;
  invited_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SportsTable {
  id: string;
  name: string;
  default_players_per_side: number;
}

export interface GroupsTable {
  id: Generated<string>;
  organisation_id: string;
  sport_id: string | null;
  visibility: Generated<'public' | 'private'>;
  join_policy: Generated<'open' | 'invite'>;
  locality: string | null;
  location_name: string | null;
  name: string;
  description: string | null;
  archived_at: NullableTimestamp;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface InterestsTable {
  id: string;
  name: string;
  sort_order: Generated<number>;
}

export interface GroupInterestsTable {
  group_id: string;
  interest_id: string;
}

export interface ActivitiesTable {
  id: Generated<string>;
  organisation_id: string;
  group_id: string;
  title: string;
  description: string | null;
  interest_id: string | null;
  venue_id: string | null;
  location_name: string | null;
  starts_at: Timestamp;
  ends_at: Timestamp;
  capacity: number | null;
  visibility: Generated<'public' | 'private'>;
  state: Generated<'scheduled' | 'cancelled' | 'completed'>;
  rally_occurrence_id: string | null;
  version: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ActivityRsvpsTable {
  id: Generated<string>;
  activity_id: string;
  participant_id: string;
  status: Generated<'going' | 'maybe' | 'not_going'>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GroupMembersTable {
  id: Generated<string>;
  group_id: string;
  participant_id: string;
  status: Generated<'active' | 'left' | 'removed'>;
  joined_at: Timestamp;
  left_at: NullableTimestamp;
}

export interface VenuesTable {
  id: Generated<string>;
  organisation_id: string;
  name: string;
  timezone: string;
  address_json: JSONColumnType<Record<string, unknown>>;
  notes: string | null;
  archived_at: NullableTimestamp;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CourtsTable {
  id: Generated<string>;
  venue_id: string;
  code: string;
  label: string | null;
  sport_ids: Generated<string[]>;
  zone: string | null;
  active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditEventsTable {
  id: Generated<string>;
  entity_type: string;
  entity_id: string;
  operation: string;
  actor_type: 'user' | 'guest' | 'service' | 'system';
  actor_id: string | null;
  reason: string | null;
  correlation_id: string | null;
  ruleset_version: string | null;
  before_json: ColumnType<unknown, string | null, string | null>;
  after_json: ColumnType<unknown, string | null, string | null>;
  created_at: Timestamp;
}

export interface IdempotencyKeysTable {
  id: Generated<string>;
  scope: string;
  key: string;
  request_hash: string;
  status_code: number | null;
  response_body: ColumnType<unknown, string | null, string | null>;
  created_at: Timestamp;
  expires_at: Timestamp;
}

export interface InvitationLinksTable {
  id: Generated<string>;
  scope_type: 'organisation' | 'group' | 'team' | 'session' | 'meet';
  scope_id: string;
  token_hash: string;
  permissions: ColumnType<unknown, string, string>;
  grants_role: Role | null;
  expires_at: Timestamp;
  max_uses: Generated<number>;
  use_count: Generated<number>;
  revoked_at: NullableTimestamp;
  created_by_profile_id: string | null;
  created_at: Timestamp;
}

export interface InvitationRedemptionsTable {
  id: Generated<string>;
  invitation_id: string;
  user_profile_id: string;
  created_at: Timestamp;
}

export interface RulesetsTable {
  id: Generated<string>;
  organisation_id: string;
  kind: 'social_session' | 'league';
  name: string;
  schema_version: number;
  definition_json: JSONColumnType<Record<string, unknown>>;
  version: Generated<number>;
  used_at: NullableTimestamp;
  archived_at: NullableTimestamp;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionSeriesTable {
  id: Generated<string>;
  organisation_id: string;
  group_id: string | null;
  venue_id: string | null;
  sport_id: string;
  owner_scope: Generated<'personal' | 'organisation' | 'buddy_group'>;
  buddy_group_id: string | null;
  name: string;
  description: string | null;
  recurrence_rrule: string | null;
  default_ruleset_id: string | null;
  default_rules_json: JSONColumnType<Record<string, unknown>> | null;
  default_duration_minutes: Generated<number>;
  default_round_minutes: Generated<number>;
  /** Weekly schedule (Addendum 1.2): all three set, or none. 0 = Sunday. */
  schedule_weekday: number | null;
  /** `HH:MM:SS` as Postgres `time`. */
  schedule_time: string | null;
  schedule_timezone: string | null;
  check_in_window_minutes: Generated<number>;
  hosts_enabled: Generated<boolean>;
  archived_at: NullableTimestamp;
  version: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionHostsTable {
  series_id: string;
  profile_id: string;
  added_by_profile_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface SessionKeepApartTable {
  series_id: string;
  participant_a: string;
  participant_b: string;
  created_by_profile_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface SessionRatingsTable {
  id: Generated<string>;
  occurrence_id: string;
  rater_profile_id: string;
  score: number;
  tags: string[];
  created_at: Generated<Timestamp>;
}

export interface SessionRegularsTable {
  series_id: string;
  participant_id: string;
  added_by_profile_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface SessionOccurrencesTable {
  id: Generated<string>;
  series_id: string;
  organisation_id: string;
  venue_id: string | null;
  starts_at: Timestamp;
  ends_at: Timestamp;
  state: Generated<'draft' | 'open' | 'live' | 'completed' | 'cancelled'>;
  rules_json: JSONColumnType<Record<string, unknown>>;
  rules_schema_version: number;
  ruleset_id: string | null;
  round_duration_seconds: number;
  notes: string | null;
  public_slug: string | null;
  version: Generated<number>;
  opened_at: NullableTimestamp;
  started_at: NullableTimestamp;
  completed_at: NullableTimestamp;
  cancelled_at: NullableTimestamp;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionCourtsTable {
  id: Generated<string>;
  occurrence_id: string;
  court_id: string;
  sort_order: Generated<number>;
  active: Generated<boolean>;
}

export interface SessionEntriesTable {
  id: Generated<string>;
  occurrence_id: string;
  participant_id: string;
  attendance_status: Generated<'registered' | 'checked_in' | 'left' | 'no_show'>;
  joined_at: Timestamp;
  check_in_at: NullableTimestamp;
  left_at: NullableTimestamp;
  left_reason: string | null;
  created_by_profile_id: string | null;
}

export interface PairLocksTable {
  id: Generated<string>;
  occurrence_id: string;
  participant_a: string;
  participant_b: string;
  kind: Generated<'hard' | 'soft' | 'avoid'>;
  until_round: number | null;
  released_at: NullableTimestamp;
  created_by_profile_id: string | null;
  created_at: Timestamp;
}

export interface RotationPreviewsTable {
  id: Generated<string>;
  occurrence_id: string;
  sequence_no: number;
  source_version: number;
  algorithm_version: string;
  seed: string;
  input_json: ColumnType<unknown, string, string>;
  result_json: ColumnType<unknown, string, string>;
  expires_at: Timestamp;
  committed_round_id: string | null;
  created_by_profile_id: string | null;
  created_at: Timestamp;
}

export interface SocialRoundsTable {
  id: Generated<string>;
  occurrence_id: string;
  sequence_no: number;
  status: Generated<'published' | 'in_progress' | 'paused' | 'completed' | 'cancelled'>;
  duration_seconds: number;
  started_at: NullableTimestamp;
  paused_at: NullableTimestamp;
  paused_total_seconds: Generated<number>;
  completed_at: NullableTimestamp;
  cancelled_at: NullableTimestamp;
  revision: Generated<number>;
  algorithm_version: string;
  seed: string;
  metrics_json: JSONColumnType<Record<string, number>>;
  warnings_json: JSONColumnType<Array<{ code: string; detail: string }>>;
  preview_id: string | null;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RoundAssignmentsTable {
  id: Generated<string>;
  round_id: string;
  participant_id: string;
  role: 'playing' | 'resting';
  match_id: string | null;
  side_no: number | null;
}

export interface MatchesTable {
  id: Generated<string>;
  social_round_id: string | null;
  fixture_id: string | null;
  rubber_key: string | null;
  state: Generated<'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'forfeited'>;
  court_id: string | null;
  format: 'singles' | 'doubles';
  starts_at: NullableTimestamp;
  completed_at: NullableTimestamp;
  ruleset_version: string | null;
  rubber_label: string | null;
  rubber_order: number | null;
  called_at: NullableTimestamp;
  court_override_reason: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MatchSidesTable {
  id: Generated<string>;
  match_id: string;
  side_no: number;
  team_id: string | null;
}

export interface MatchSidePlayersTable {
  id: Generated<string>;
  match_side_id: string;
  participant_id: string;
  role: Generated<string>;
}

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload_json: ColumnType<unknown, string, string>;
  status: Generated<'pending' | 'processing' | 'delivered' | 'dead'>;
  retries: Generated<number>;
  dedupe_key: string | null;
  available_at: Timestamp;
  last_error: string | null;
  created_at: Timestamp;
  processed_at: NullableTimestamp;
}

export interface CompetitionsTable {
  id: Generated<string>;
  organisation_id: string;
  type: Generated<'league' | 'tournament'>;
  sport_id: string;
  name: string;
  description: string | null;
  archived_at: NullableTimestamp;
  version: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SeasonsTable {
  id: Generated<string>;
  competition_id: string;
  name: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  state: Generated<'draft' | 'active' | 'completed' | 'archived'>;
  rules_json: JSONColumnType<Record<string, unknown>>;
  rules_schema_version: number;
  ruleset_id: string | null;
  version: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DivisionsTable {
  id: Generated<string>;
  season_id: string;
  ordinal: number;
  name: string;
  capacity: Generated<number>;
  created_at: Timestamp;
}

export interface TeamsTable {
  id: Generated<string>;
  organisation_id: string;
  name: string;
  short_name: string | null;
  captain_participant_id: string | null;
  archived_at: NullableTimestamp;
  version: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TeamRosterTable {
  id: Generated<string>;
  team_id: string;
  participant_id: string;
  valid_from: Timestamp;
  valid_to: NullableTimestamp;
  eligibility_metadata: ColumnType<Record<string, unknown>, string | undefined, string>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
}

export interface MeetsTable {
  id: Generated<string>;
  season_id: string;
  venue_id: string | null;
  name: string;
  sequence_no: number;
  starts_at: Timestamp;
  ends_at: Timestamp;
  state: Generated<'draft' | 'published' | 'live' | 'completed' | 'cancelled'>;
  format: Generated<'round_robin' | 'pools_knockout'>;
  public_slug: string | null;
  rules_json: JSONColumnType<Record<string, unknown>> | null;
  rules_schema_version: number | null;
  version: Generated<number>;
  published_at: NullableTimestamp;
  completed_at: NullableTimestamp;
  cancelled_at: NullableTimestamp;
  created_by_profile_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DivisionAssignmentsTable {
  id: Generated<string>;
  meet_id: string;
  division_id: string;
  team_id: string;
  seed: number | null;
  snapshot_revision: Generated<number>;
  created_at: Timestamp;
}

export interface CourtPoolsTable {
  id: Generated<string>;
  meet_id: string | null;
  occurrence_id: string | null;
  division_id: string | null;
  policy: Generated<
    'fixed_division' | 'fixed_team' | 'fixed_zone' | 'dynamic' | 'preferred' | 'manual'
  >;
  exclusive: Generated<boolean>;
  created_at: Timestamp;
}

export interface CourtPoolMembersTable {
  id: Generated<string>;
  court_pool_id: string;
  court_id: string;
}

export interface FixturesTable {
  id: Generated<string>;
  meet_id: string;
  division_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  round_no: number;
  stage: Generated<'pool' | 'knockout'>;
  bracket_round: number | null;
  bracket_slot: number | null;
  bracket_label: string | null;
  sources_json: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  winner_team_id: string | null;
  status: Generated<'scheduled' | 'in_progress' | 'completed' | 'needs_review' | 'void'>;
  outcome_policy_version: string | null;
  outcome_json: ColumnType<Record<string, unknown> | null, string | null, string | null>;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ResultRevisionsTable {
  id: Generated<string>;
  match_id: string;
  revision: number;
  submitted_by_profile_id: string | null;
  confirmed_by_profile_id: string | null;
  score_json: ColumnType<Record<string, unknown>, string, string>;
  result_status: Generated<'submitted' | 'confirmed' | 'disputed' | 'void'>;
  reason: string | null;
  resolved_by_profile_id: string | null;
  resolved_at: NullableTimestamp;
  resolution: 'upheld' | 'voided' | null;
  created_at: Timestamp;
  confirmed_at: NullableTimestamp;
}

export interface StandingsSnapshotsTable {
  id: Generated<string>;
  meet_id: string;
  division_id: string;
  revision: number;
  ruleset_version: string;
  inputs_hash: string;
  rows_json: ColumnType<unknown, string, string>;
  unresolved_ties_json: ColumnType<unknown, string, string>;
  computed_at: Timestamp;
}

export interface ProgressionsTable {
  id: Generated<string>;
  meet_id: string;
  next_meet_id: string | null;
  status: Generated<'preview' | 'committed' | 'discarded'>;
  standings_revision_json: ColumnType<Record<string, number>, string, string>;
  preview_json: ColumnType<unknown, string, string>;
  ruleset_version: string;
  approved_by_profile_id: string | null;
  approved_at: NullableTimestamp;
  reason: string | null;
  version: Generated<number>;
  created_by_profile_id: string | null;
  created_at: Timestamp;
}

export interface Database {
  'identity.user_profiles': UserProfilesTable;
  'identity.participants': ParticipantsTable;
  'identity.guest_grants': GuestGrantsTable;
  'community.organisations': OrganisationsTable;
  'community.memberships': MembershipsTable;
  'community.sports': SportsTable;
  'community.groups': GroupsTable;
  'community.group_members': GroupMembersTable;
  'community.interests': InterestsTable;
  'community.group_interests': GroupInterestsTable;
  'community.activities': ActivitiesTable;
  'community.activity_rsvps': ActivityRsvpsTable;
  'facilities.venues': VenuesTable;
  'facilities.courts': CourtsTable;
  'platform.audit_events': AuditEventsTable;
  'platform.idempotency_keys': IdempotencyKeysTable;
  'platform.invitation_links': InvitationLinksTable;
  'platform.invitation_redemptions': InvitationRedemptionsTable;
  'platform.outbox_events': OutboxEventsTable;
  'platform.rulesets': RulesetsTable;
  'activities.session_series': SessionSeriesTable;
  'activities.session_regulars': SessionRegularsTable;
  'identity.profile_activities': ProfileActivitiesTable;
  'identity.profile_gear': ProfileGearTable;
  'activities.session_hosts': SessionHostsTable;
  'activities.session_keep_apart': SessionKeepApartTable;
  'activities.session_ratings': SessionRatingsTable;
  'activities.session_occurrences': SessionOccurrencesTable;
  'activities.session_courts': SessionCourtsTable;
  'activities.session_entries': SessionEntriesTable;
  'activities.pair_locks': PairLocksTable;
  'activities.rotation_previews': RotationPreviewsTable;
  'activities.social_rounds': SocialRoundsTable;
  'activities.round_assignments': RoundAssignmentsTable;
  'matches.matches': MatchesTable;
  'matches.match_sides': MatchSidesTable;
  'matches.match_side_players': MatchSidePlayersTable;
  'matches.result_revisions': ResultRevisionsTable;
  'competition.competitions': CompetitionsTable;
  'competition.seasons': SeasonsTable;
  'competition.divisions': DivisionsTable;
  'competition.teams': TeamsTable;
  'competition.team_roster': TeamRosterTable;
  'competition.meets': MeetsTable;
  'competition.division_assignments': DivisionAssignmentsTable;
  'competition.fixtures': FixturesTable;
  'competition.standings_snapshots': StandingsSnapshotsTable;
  'competition.progressions': ProgressionsTable;
  'facilities.court_pools': CourtPoolsTable;
  'facilities.court_pool_members': CourtPoolMembersTable;
}
