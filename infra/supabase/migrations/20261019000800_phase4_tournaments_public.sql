-- Phase 4 / migration 8: tournament format and knockout brackets, public boards, dispute
-- resolution. Reverse: see the README table (drop the added columns, types and indexes, restore
-- the not-null constraints and the full unique constraint on fixtures).

create type competition.meet_format as enum ('round_robin', 'pools_knockout');
create type competition.fixture_stage as enum ('pool', 'knockout');

-- ---------------------------------------------------------------------------
-- Meets: format and public board slug
-- ---------------------------------------------------------------------------

alter table competition.meets
  add column format competition.meet_format not null default 'round_robin',
  add column public_slug text,
  add constraint meets_public_slug_format check (public_slug is null or public_slug ~ '^[a-z0-9]{6,32}$');
create unique index meets_public_slug_unique on competition.meets (public_slug) where public_slug is not null;

alter table activities.session_occurrences
  add column public_slug text,
  add constraint occurrences_public_slug_format check (public_slug is null or public_slug ~ '^[a-z0-9]{6,32}$');
create unique index occurrences_public_slug_unique on activities.session_occurrences (public_slug) where public_slug is not null;

-- ---------------------------------------------------------------------------
-- Fixtures: knockout skeleton with unresolved sides
-- ---------------------------------------------------------------------------

alter table competition.fixtures
  alter column home_team_id drop not null,
  alter column away_team_id drop not null,
  alter column division_id drop not null,
  drop constraint fixtures_check,
  drop constraint fixtures_meet_id_home_team_id_away_team_id_key,
  add column stage competition.fixture_stage not null default 'pool',
  add column bracket_round integer check (bracket_round is null or bracket_round >= 1),
  add column bracket_slot integer check (bracket_slot is null or bracket_slot >= 1),
  add column bracket_label text,
  -- {home: source, away: source}; source = {type: 'pool', divisionId, position} | {type: 'winner'|'loser', round, slot}
  add column sources_json jsonb,
  add column winner_team_id uuid references competition.teams (id) on delete set null,
  add constraint fixtures_distinct_teams check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id),
  add constraint fixtures_stage_shape check (
    (stage = 'pool' and division_id is not null and bracket_round is null)
    or (stage = 'knockout' and bracket_round is not null and bracket_slot is not null)
  );
create unique index fixtures_pool_pair_unique on competition.fixtures (meet_id, home_team_id, away_team_id) where stage = 'pool';
create unique index fixtures_bracket_slot_unique on competition.fixtures (meet_id, bracket_round, bracket_slot) where stage = 'knockout';
create index fixtures_winner_idx on competition.fixtures (winner_team_id);

-- ---------------------------------------------------------------------------
-- Dispute resolution
-- ---------------------------------------------------------------------------

alter table matches.result_revisions
  add column resolved_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  add column resolved_at timestamptz,
  add column resolution text check (resolution is null or resolution in ('upheld', 'voided'));
