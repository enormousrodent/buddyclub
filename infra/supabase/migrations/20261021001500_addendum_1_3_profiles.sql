-- Addendum 1.3 step 1 (owner, 2026-10-21): the person's own profile for Buddy Club.
--   * place, a short bio, visibility switches (off by default), 18+ confirmation, and a separate
--     "onboarded" mark per app so each app's first run is independent;
--   * activities: what they are into, their self-rated level and the days they are free;
--   * gear per activity (names and notes; no photos yet).
-- Nothing here is readable by anyone but the person until step 2 (people search).
-- Additive. Reverse:
--   drop table identity.profile_gear, identity.profile_activities;
--   alter table identity.user_profiles drop column locality, drop column bio,
--     drop column discoverable, drop column show_gear, drop column adult_confirmed_at,
--     drop column buddyclub_onboarded_at, drop column rally_onboarded_at;

alter table identity.user_profiles
  add column locality text check (char_length(locality) between 1 and 80),
  add column bio text check (char_length(bio) <= 160),
  add column discoverable boolean not null default false,
  add column show_gear boolean not null default false,
  add column adult_confirmed_at timestamptz,
  add column buddyclub_onboarded_at timestamptz,
  add column rally_onboarded_at timestamptz,
  add constraint user_profiles_discoverable_adult
    check (discoverable = false or adult_confirmed_at is not null);

comment on column identity.user_profiles.discoverable is 'Find me: shown in buddy search. Requires adult_confirmed_at.';
comment on column identity.user_profiles.buddyclub_onboarded_at is 'Buddy Club first run finished; independent of Rally''s.';

create table identity.profile_activities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  interest_id text not null references community.interests (id),
  -- Set for racket sports: the sport itself is the activity.
  sport_id text references community.sports (id),
  level text check (level in ('just_starting', 'getting_going', 'comfortable', 'strong', 'expert')),
  -- { "mon": ["evening"], "sat": ["morning", "afternoon"] }
  days jsonb not null default '{}'::jsonb,
  note text check (char_length(note) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profile_activities_unique
  on identity.profile_activities (profile_id, interest_id, coalesce(sport_id, ''));
create index profile_activities_interest_idx on identity.profile_activities (interest_id, sport_id);
create trigger profile_activities_set_updated_at
  before update on identity.profile_activities
  for each row execute function platform.set_updated_at();
alter table identity.profile_activities enable row level security;

create table identity.profile_gear (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  interest_id text not null references community.interests (id),
  sport_id text references community.sports (id),
  name text not null check (char_length(name) between 1 and 80),
  detail text check (char_length(detail) <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index profile_gear_profile_idx on identity.profile_gear (profile_id, sort_order);
alter table identity.profile_gear enable row level security;
