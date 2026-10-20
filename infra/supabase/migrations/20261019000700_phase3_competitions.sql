-- Phase 3 / migration 7: competitions, seasons, divisions, teams and rosters, meets, division
-- assignments, dedicated court pools, fixtures, result revisions, standings snapshots and
-- progression records. Reverse: drop schema competition cascade; drop table facilities.court_pool_members,
-- facilities.court_pools, matches.result_revisions; alter table matches.matches drop constraint matches_fixture_fk.

create schema if not exists competition;
grant usage on schema competition to authenticated, service_role;

create type competition.competition_type as enum ('league', 'tournament');
create type competition.season_state as enum ('draft', 'active', 'completed', 'archived');
create type competition.meet_state as enum ('draft', 'published', 'live', 'completed', 'cancelled');
create type competition.fixture_status as enum ('scheduled', 'in_progress', 'completed', 'needs_review', 'void');
create type competition.progression_status as enum ('preview', 'committed', 'discarded');
create type matches.result_status as enum ('submitted', 'confirmed', 'disputed', 'void');
create type facilities.court_pool_policy as enum ('fixed_division', 'fixed_team', 'fixed_zone', 'dynamic', 'preferred', 'manual');

-- ---------------------------------------------------------------------------
-- Competitions, seasons, divisions
-- ---------------------------------------------------------------------------

create table competition.competitions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  type competition.competition_type not null default 'league',
  sport_id text not null references community.sports (id),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  archived_at timestamptz,
  version integer not null default 1,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index competitions_organisation_idx on competition.competitions (organisation_id);
create trigger competitions_set_updated_at before update on competition.competitions for each row execute function platform.set_updated_at();

create table competition.seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition.competitions (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state competition.season_state not null default 'draft',
  -- League ruleset snapshot (ADR-004); meets copy it again at publish time.
  rules_json jsonb not null,
  rules_schema_version integer not null,
  ruleset_id uuid references platform.rulesets (id) on delete set null,
  version integer not null default 1,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index seasons_competition_idx on competition.seasons (competition_id);
create trigger seasons_set_updated_at before update on competition.seasons for each row execute function platform.set_updated_at();

create table competition.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references competition.seasons (id) on delete cascade,
  ordinal integer not null check (ordinal >= 1),
  name text not null check (char_length(name) between 1 and 80),
  capacity integer not null default 4 check (capacity between 2 and 32),
  created_at timestamptz not null default now(),
  unique (season_id, ordinal)
);

-- ---------------------------------------------------------------------------
-- Teams and rosters
-- ---------------------------------------------------------------------------

create table competition.teams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  short_name text check (short_name is null or char_length(short_name) between 1 and 12),
  captain_participant_id uuid references identity.participants (id) on delete set null,
  archived_at timestamptz,
  version integer not null default 1,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_organisation_idx on competition.teams (organisation_id);
create index teams_captain_idx on competition.teams (captain_participant_id);
create unique index teams_name_unique on competition.teams (organisation_id, lower(name)) where archived_at is null;
create trigger teams_set_updated_at before update on competition.teams for each row execute function platform.set_updated_at();

create table competition.team_roster (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references competition.teams (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete restrict,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  eligibility_metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);
create index team_roster_team_idx on competition.team_roster (team_id);
create index team_roster_participant_idx on competition.team_roster (participant_id);
create unique index team_roster_active_unique on competition.team_roster (team_id, participant_id) where valid_to is null;

-- ---------------------------------------------------------------------------
-- Meets, division assignments, court pools
-- ---------------------------------------------------------------------------

create table competition.meets (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references competition.seasons (id) on delete cascade,
  venue_id uuid references facilities.venues (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  sequence_no integer not null check (sequence_no >= 1),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state competition.meet_state not null default 'draft',
  rules_json jsonb,
  rules_schema_version integer,
  version integer not null default 1,
  published_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, sequence_no),
  check (ends_at > starts_at)
);
create index meets_season_idx on competition.meets (season_id);
create index meets_venue_idx on competition.meets (venue_id);
create trigger meets_set_updated_at before update on competition.meets for each row execute function platform.set_updated_at();

create table competition.division_assignments (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references competition.meets (id) on delete cascade,
  division_id uuid not null references competition.divisions (id) on delete cascade,
  team_id uuid not null references competition.teams (id) on delete restrict,
  seed integer,
  snapshot_revision integer not null default 1,
  created_at timestamptz not null default now(),
  unique (meet_id, team_id),
  unique (meet_id, division_id, team_id)
);
create index division_assignments_division_idx on competition.division_assignments (division_id);
create index division_assignments_team_idx on competition.division_assignments (team_id);

create table facilities.court_pools (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid references competition.meets (id) on delete cascade,
  occurrence_id uuid references activities.session_occurrences (id) on delete cascade,
  division_id uuid references competition.divisions (id) on delete cascade,
  policy facilities.court_pool_policy not null default 'fixed_division',
  exclusive boolean not null default true,
  created_at timestamptz not null default now(),
  check ((meet_id is not null)::int + (occurrence_id is not null)::int = 1)
);
create index court_pools_meet_idx on facilities.court_pools (meet_id);
create index court_pools_occurrence_idx on facilities.court_pools (occurrence_id);
create index court_pools_division_idx on facilities.court_pools (division_id);
create unique index court_pools_meet_division_unique on facilities.court_pools (meet_id, division_id) where meet_id is not null and division_id is not null;

create table facilities.court_pool_members (
  id uuid primary key default gen_random_uuid(),
  court_pool_id uuid not null references facilities.court_pools (id) on delete cascade,
  court_id uuid not null references facilities.courts (id) on delete cascade,
  unique (court_pool_id, court_id)
);
create index court_pool_members_court_idx on facilities.court_pool_members (court_id);

-- ---------------------------------------------------------------------------
-- Fixtures and rubbers
-- ---------------------------------------------------------------------------

create table competition.fixtures (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references competition.meets (id) on delete cascade,
  division_id uuid not null references competition.divisions (id) on delete cascade,
  home_team_id uuid not null references competition.teams (id) on delete restrict,
  away_team_id uuid not null references competition.teams (id) on delete restrict,
  round_no integer not null check (round_no >= 1),
  status competition.fixture_status not null default 'scheduled',
  outcome_policy_version text,
  -- Evaluated outcome from confirmed rubbers: {outcome, rubbersWon, pointsFor, reason}
  outcome_json jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  unique (meet_id, home_team_id, away_team_id)
);
create index fixtures_meet_division_idx on competition.fixtures (meet_id, division_id);
create index fixtures_home_idx on competition.fixtures (home_team_id);
create index fixtures_away_idx on competition.fixtures (away_team_id);
create trigger fixtures_set_updated_at before update on competition.fixtures for each row execute function platform.set_updated_at();

alter table matches.matches
  add constraint matches_fixture_fk foreign key (fixture_id) references competition.fixtures (id) on delete cascade;

alter table matches.matches add column rubber_label text;
alter table matches.matches add column rubber_order integer;
alter table matches.matches add column called_at timestamptz;
alter table matches.matches add column court_override_reason text;

create table matches.result_revisions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches.matches (id) on delete cascade,
  revision integer not null check (revision >= 1),
  submitted_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  confirmed_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  score_json jsonb not null,
  result_status matches.result_status not null default 'submitted',
  reason text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (match_id, revision)
);
create index result_revisions_match_idx on matches.result_revisions (match_id, revision desc);
create trigger result_revisions_append_only
  before delete on matches.result_revisions
  for each row execute function platform.reject_mutation();

-- ---------------------------------------------------------------------------
-- Standings snapshots and progression
-- ---------------------------------------------------------------------------

create table competition.standings_snapshots (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references competition.meets (id) on delete cascade,
  division_id uuid not null references competition.divisions (id) on delete cascade,
  revision integer not null check (revision >= 1),
  ruleset_version text not null,
  inputs_hash text not null,
  rows_json jsonb not null,
  unresolved_ties_json jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  unique (meet_id, division_id, revision)
);
create trigger standings_snapshots_append_only
  before update or delete on competition.standings_snapshots
  for each row execute function platform.reject_mutation();

create table competition.progressions (
  id uuid primary key default gen_random_uuid(),
  meet_id uuid not null references competition.meets (id) on delete cascade,
  next_meet_id uuid references competition.meets (id) on delete set null,
  status competition.progression_status not null default 'preview',
  standings_revision_json jsonb not null,
  preview_json jsonb not null,
  ruleset_version text not null,
  approved_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  approved_at timestamptz,
  reason text,
  version integer not null default 1,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index progressions_meet_idx on competition.progressions (meet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Privileges and RLS (members of the owning organisation may read)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema competition from anon, authenticated;
grant all on all tables in schema competition to service_role;
alter default privileges in schema competition grant all on tables to service_role;
grant all on facilities.court_pools, facilities.court_pool_members, matches.result_revisions to service_role;
grant select on
  competition.competitions, competition.seasons, competition.divisions, competition.teams,
  competition.team_roster, competition.meets, competition.division_assignments, competition.fixtures,
  competition.standings_snapshots, facilities.court_pools, facilities.court_pool_members,
  matches.result_revisions
to authenticated;

alter table competition.competitions enable row level security;
alter table competition.seasons enable row level security;
alter table competition.divisions enable row level security;
alter table competition.teams enable row level security;
alter table competition.team_roster enable row level security;
alter table competition.meets enable row level security;
alter table competition.division_assignments enable row level security;
alter table competition.fixtures enable row level security;
alter table competition.standings_snapshots enable row level security;
alter table competition.progressions enable row level security;
alter table facilities.court_pools enable row level security;
alter table facilities.court_pool_members enable row level security;
alter table matches.result_revisions enable row level security;

create or replace function competition.season_org(s uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.organisation_id from competition.seasons se join competition.competitions c on c.id = se.competition_id where se.id = s;
$$;
create or replace function competition.meet_org(m uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select competition.season_org(me.season_id) from competition.meets me where me.id = m;
$$;
revoke all on function competition.season_org(uuid) from public;
revoke all on function competition.meet_org(uuid) from public;
grant execute on function competition.season_org(uuid), competition.meet_org(uuid) to authenticated, service_role;

create policy competitions_select on competition.competitions for select to authenticated using (community.is_org_member(organisation_id));
create policy seasons_select on competition.seasons for select to authenticated using (community.is_org_member(competition.season_org(id)));
create policy divisions_select on competition.divisions for select to authenticated using (community.is_org_member(competition.season_org(season_id)));
create policy teams_select on competition.teams for select to authenticated using (community.is_org_member(organisation_id));
create policy team_roster_select on competition.team_roster for select to authenticated
  using (exists (select 1 from competition.teams t where t.id = competition.team_roster.team_id and community.is_org_member(t.organisation_id)));
create policy meets_select on competition.meets for select to authenticated using (community.is_org_member(competition.season_org(season_id)));
create policy division_assignments_select on competition.division_assignments for select to authenticated using (community.is_org_member(competition.meet_org(meet_id)));
create policy fixtures_select on competition.fixtures for select to authenticated using (community.is_org_member(competition.meet_org(meet_id)));
create policy standings_snapshots_select on competition.standings_snapshots for select to authenticated using (community.is_org_member(competition.meet_org(meet_id)));
create policy court_pools_select on facilities.court_pools for select to authenticated
  using ((meet_id is not null and community.is_org_member(competition.meet_org(meet_id))) or (occurrence_id is not null and community.is_org_member(activities.occurrence_org(occurrence_id))));
create policy court_pool_members_select on facilities.court_pool_members for select to authenticated
  using (exists (select 1 from facilities.court_pools p where p.id = facilities.court_pool_members.court_pool_id));
create policy result_revisions_select on matches.result_revisions for select to authenticated
  using (exists (select 1 from matches.matches m where m.id = matches.result_revisions.match_id));

-- Fixture rubbers become readable through the same membership rule as social matches.
drop policy matches_select_same_org on matches.matches;
create policy matches_select_same_org on matches.matches for select to authenticated
  using (
    (social_round_id is not null and exists (
      select 1 from activities.social_rounds r
      where r.id = matches.matches.social_round_id and community.is_org_member(activities.occurrence_org(r.occurrence_id))))
    or
    (fixture_id is not null and exists (
      select 1 from competition.fixtures f
      where f.id = matches.matches.fixture_id and community.is_org_member(competition.meet_org(f.meet_id))))
  );

alter publication supabase_realtime add table competition.meets;
alter publication supabase_realtime add table competition.fixtures;
