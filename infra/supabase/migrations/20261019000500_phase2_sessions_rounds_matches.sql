-- Phase 2 / migration 5: rulesets, session series and occurrences, roster, pair locks,
-- rotation previews, rounds, round assignments, and the match model.
-- Reverse: drop schema matches cascade; drop schema activities cascade; drop table platform.rulesets.

-- ---------------------------------------------------------------------------
-- platform.rulesets: named, versioned rule presets (ADR-004).
-- ---------------------------------------------------------------------------

create table platform.rulesets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  kind text not null check (kind in ('social_session', 'league')),
  name text not null check (char_length(name) between 1 and 120),
  schema_version integer not null,
  definition_json jsonb not null,
  version integer not null default 1,
  used_at timestamptz,
  archived_at timestamptz,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rulesets_organisation_idx on platform.rulesets (organisation_id, kind);

create trigger rulesets_set_updated_at
  before update on platform.rulesets
  for each row execute function platform.set_updated_at();

-- ---------------------------------------------------------------------------
-- activities schema
-- ---------------------------------------------------------------------------

create schema if not exists activities;
create schema if not exists matches;
grant usage on schema activities, matches to authenticated, service_role;

create type activities.occurrence_state as enum ('draft', 'open', 'live', 'completed', 'cancelled');
create type activities.attendance_status as enum ('registered', 'checked_in', 'left', 'no_show');
create type activities.round_status as enum ('published', 'in_progress', 'paused', 'completed', 'cancelled');
create type activities.pair_lock_kind as enum ('hard', 'soft');
create type activities.assignment_role as enum ('playing', 'resting');
create type matches.match_state as enum ('scheduled', 'in_progress', 'completed', 'cancelled', 'forfeited');

create table activities.session_series (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  group_id uuid references community.groups (id) on delete set null,
  venue_id uuid references facilities.venues (id) on delete set null,
  sport_id text not null references community.sports (id),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  recurrence_rrule text,
  default_ruleset_id uuid references platform.rulesets (id) on delete set null,
  default_rules_json jsonb,
  default_duration_minutes integer not null default 120 check (default_duration_minutes between 15 and 720),
  default_round_minutes integer not null default 12 check (default_round_minutes between 3 and 120),
  archived_at timestamptz,
  version integer not null default 1,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_series_organisation_idx on activities.session_series (organisation_id);
create index session_series_group_idx on activities.session_series (group_id);
create index session_series_venue_idx on activities.session_series (venue_id);

create trigger session_series_set_updated_at
  before update on activities.session_series
  for each row execute function platform.set_updated_at();

create table activities.session_occurrences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references activities.session_series (id) on delete cascade,
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  venue_id uuid references facilities.venues (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state activities.occurrence_state not null default 'draft',
  -- Immutable copy of the rules this occurrence runs under (ADR-004).
  rules_json jsonb not null,
  rules_schema_version integer not null,
  ruleset_id uuid references platform.rulesets (id) on delete set null,
  round_duration_seconds integer not null check (round_duration_seconds between 60 and 7200),
  notes text,
  version integer not null default 1,
  opened_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index session_occurrences_series_idx on activities.session_occurrences (series_id);
create index session_occurrences_org_time_idx on activities.session_occurrences (organisation_id, starts_at);
create index session_occurrences_venue_idx on activities.session_occurrences (venue_id);

create trigger session_occurrences_set_updated_at
  before update on activities.session_occurrences
  for each row execute function platform.set_updated_at();

create table activities.session_courts (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references activities.session_occurrences (id) on delete cascade,
  court_id uuid not null references facilities.courts (id) on delete cascade,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (occurrence_id, court_id)
);

create index session_courts_court_idx on activities.session_courts (court_id);

create table activities.session_entries (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references activities.session_occurrences (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete cascade,
  attendance_status activities.attendance_status not null default 'registered',
  joined_at timestamptz not null default now(),
  check_in_at timestamptz,
  left_at timestamptz,
  left_reason text,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  unique (occurrence_id, participant_id)
);

create index session_entries_participant_idx on activities.session_entries (participant_id);

create table activities.pair_locks (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references activities.session_occurrences (id) on delete cascade,
  participant_a uuid not null references identity.participants (id) on delete cascade,
  participant_b uuid not null references identity.participants (id) on delete cascade,
  kind activities.pair_lock_kind not null default 'hard',
  until_round integer check (until_round is null or until_round >= 1),
  released_at timestamptz,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (participant_a < participant_b)
);

create index pair_locks_occurrence_idx on activities.pair_locks (occurrence_id) where released_at is null;
create index pair_locks_participant_a_idx on activities.pair_locks (participant_a);
create index pair_locks_participant_b_idx on activities.pair_locks (participant_b);
create unique index pair_locks_active_unique on activities.pair_locks (occurrence_id, participant_a, participant_b)
  where released_at is null;

create table activities.rotation_previews (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references activities.session_occurrences (id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 1),
  source_version integer not null,
  algorithm_version text not null,
  seed text not null,
  input_json jsonb not null,
  result_json jsonb not null,
  expires_at timestamptz not null,
  committed_round_id uuid,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index rotation_previews_occurrence_idx on activities.rotation_previews (occurrence_id, created_at desc);

create table activities.social_rounds (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references activities.session_occurrences (id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 1),
  status activities.round_status not null default 'published',
  duration_seconds integer not null check (duration_seconds between 60 and 7200),
  -- Server is the timer authority (spec section 10).
  started_at timestamptz,
  paused_at timestamptz,
  paused_total_seconds integer not null default 0 check (paused_total_seconds >= 0),
  completed_at timestamptz,
  cancelled_at timestamptz,
  revision integer not null default 1,
  algorithm_version text not null,
  seed text not null,
  metrics_json jsonb not null default '{}'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  preview_id uuid references activities.rotation_previews (id) on delete set null,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, sequence_no)
);

create trigger social_rounds_set_updated_at
  before update on activities.social_rounds
  for each row execute function platform.set_updated_at();

alter table activities.rotation_previews
  add constraint rotation_previews_round_fk
  foreign key (committed_round_id) references activities.social_rounds (id) on delete set null;

-- ---------------------------------------------------------------------------
-- matches schema (spec section 5): shared by social rounds now and league fixtures later.
-- ---------------------------------------------------------------------------

create table matches.matches (
  id uuid primary key default gen_random_uuid(),
  social_round_id uuid references activities.social_rounds (id) on delete cascade,
  fixture_id uuid,
  rubber_key text,
  state matches.match_state not null default 'scheduled',
  court_id uuid references facilities.courts (id) on delete set null,
  format text not null check (format in ('singles', 'doubles')),
  starts_at timestamptz,
  completed_at timestamptz,
  ruleset_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one parent context (spec section 5.2).
  check ((social_round_id is not null)::int + (fixture_id is not null)::int = 1),
  check (fixture_id is null or rubber_key is not null)
);

create index matches_social_round_idx on matches.matches (social_round_id);
create index matches_fixture_idx on matches.matches (fixture_id);
create index matches_court_idx on matches.matches (court_id);
create index matches_state_starts_idx on matches.matches (state, starts_at);
create unique index matches_fixture_rubber_unique on matches.matches (fixture_id, rubber_key) where fixture_id is not null;
-- One active match per court at a time (spec section 5.3).
create unique index matches_active_court_unique on matches.matches (court_id)
  where court_id is not null and state = 'in_progress';

create trigger matches_set_updated_at
  before update on matches.matches
  for each row execute function platform.set_updated_at();

create table matches.match_sides (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches.matches (id) on delete cascade,
  side_no smallint not null check (side_no in (1, 2)),
  team_id uuid,
  unique (match_id, side_no)
);

create table matches.match_side_players (
  id uuid primary key default gen_random_uuid(),
  match_side_id uuid not null references matches.match_sides (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete restrict,
  role text not null default 'player',
  unique (match_side_id, participant_id)
);

create index match_side_players_participant_idx on matches.match_side_players (participant_id);

-- Per-round placement: the authoritative "where is everyone" for a round. A participant appears
-- at most once per round, which is the spec's no-double-booking invariant for social play.
create table activities.round_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references activities.social_rounds (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete restrict,
  role activities.assignment_role not null,
  match_id uuid references matches.matches (id) on delete cascade,
  side_no smallint check (side_no in (1, 2)),
  unique (round_id, participant_id),
  check ((role = 'playing' and match_id is not null and side_no is not null) or (role = 'resting' and match_id is null))
);

create index round_assignments_participant_idx on activities.round_assignments (participant_id);
create index round_assignments_match_idx on activities.round_assignments (match_id);

-- ---------------------------------------------------------------------------
-- Privileges and RLS: members of the organisation may read; writes only through the API.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema activities, matches from anon, authenticated;
grant all on all tables in schema activities, matches to service_role;
alter default privileges in schema activities grant all on tables to service_role;
alter default privileges in schema matches grant all on tables to service_role;
grant select on
  activities.session_series,
  activities.session_occurrences,
  activities.session_courts,
  activities.session_entries,
  activities.social_rounds,
  activities.round_assignments,
  matches.matches,
  matches.match_sides,
  matches.match_side_players,
  platform.rulesets
to authenticated;

alter table platform.rulesets enable row level security;
alter table activities.session_series enable row level security;
alter table activities.session_occurrences enable row level security;
alter table activities.session_courts enable row level security;
alter table activities.session_entries enable row level security;
alter table activities.pair_locks enable row level security;
alter table activities.rotation_previews enable row level security;
alter table activities.social_rounds enable row level security;
alter table activities.round_assignments enable row level security;
alter table matches.matches enable row level security;
alter table matches.match_sides enable row level security;
alter table matches.match_side_players enable row level security;

create or replace function activities.occurrence_org(occ uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.organisation_id from activities.session_occurrences o where o.id = occ;
$$;
revoke all on function activities.occurrence_org(uuid) from public;
grant execute on function activities.occurrence_org(uuid) to authenticated, service_role;

create policy rulesets_select_same_org on platform.rulesets for select to authenticated
  using (community.is_org_member(organisation_id));
create policy session_series_select_same_org on activities.session_series for select to authenticated
  using (community.is_org_member(organisation_id));
create policy session_occurrences_select_same_org on activities.session_occurrences for select to authenticated
  using (community.is_org_member(organisation_id));
create policy session_courts_select_same_org on activities.session_courts for select to authenticated
  using (community.is_org_member(activities.occurrence_org(occurrence_id)));
create policy session_entries_select_same_org on activities.session_entries for select to authenticated
  using (community.is_org_member(activities.occurrence_org(occurrence_id)));
create policy social_rounds_select_same_org on activities.social_rounds for select to authenticated
  using (community.is_org_member(activities.occurrence_org(occurrence_id)));
create policy round_assignments_select_same_org on activities.round_assignments for select to authenticated
  using (exists (
    select 1 from activities.social_rounds r
    where r.id = activities.round_assignments.round_id
      and community.is_org_member(activities.occurrence_org(r.occurrence_id))
  ));
create policy matches_select_same_org on matches.matches for select to authenticated
  using (
    social_round_id is not null and exists (
      select 1 from activities.social_rounds r
      where r.id = matches.matches.social_round_id
        and community.is_org_member(activities.occurrence_org(r.occurrence_id))
    )
  );
create policy match_sides_select_same_org on matches.match_sides for select to authenticated
  using (exists (select 1 from matches.matches m where m.id = matches.match_sides.match_id));
create policy match_side_players_select_same_org on matches.match_side_players for select to authenticated
  using (exists (select 1 from matches.match_sides s where s.id = matches.match_side_players.match_side_id));
