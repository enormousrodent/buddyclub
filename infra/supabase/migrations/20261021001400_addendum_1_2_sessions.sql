-- Addendum 1.2 (owner, 2026-10-21): a session is set up once and run many times.
--   * weekly schedule, check-in window and the host switch on the series;
--   * hosts: people who may set up and run any night of the series;
--   * keep-apart defaults copied onto every night as `avoid` pair locks (step 2);
--   * anonymous night ratings (step 3);
--   * one night per series and start time, so two hosts tapping "Set up" at once share it.
-- Additive. Reverse:
--   drop table activities.session_ratings, activities.session_keep_apart, activities.session_hosts;
--   drop index activities.session_occurrences_series_start_unique;
--   alter table activities.session_series drop column schedule_weekday, drop column schedule_time,
--     drop column schedule_timezone, drop column check_in_window_minutes, drop column hosts_enabled;

alter table activities.session_series
  add column schedule_weekday smallint check (schedule_weekday between 0 and 6),
  add column schedule_time time,
  add column schedule_timezone text check (char_length(schedule_timezone) between 1 and 64),
  add column check_in_window_minutes integer not null default 10
    check (check_in_window_minutes between 0 and 180),
  add column hosts_enabled boolean not null default true,
  add constraint session_series_schedule_complete
    check ((schedule_weekday is null) = (schedule_time is null)
       and (schedule_weekday is null) = (schedule_timezone is null));

comment on column activities.session_series.schedule_weekday is '0 = Sunday .. 6 = Saturday, in schedule_timezone';
comment on column activities.session_series.check_in_window_minutes is 'Self check-in opens this many minutes before a night starts; hosts are never gated';
comment on column activities.session_series.hosts_enabled is 'Owner switch: when false, session_hosts rows are kept but grant nothing';

-- Hosts: may set up and run any night of the series (not edit the series itself).
create table activities.session_hosts (
  series_id uuid not null references activities.session_series (id) on delete cascade,
  profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  added_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (series_id, profile_id)
);
create index session_hosts_profile_idx on activities.session_hosts (profile_id);
alter table activities.session_hosts enable row level security;

-- Keep-apart defaults: copied onto each night as pair locks of kind 'avoid'.
create table activities.session_keep_apart (
  series_id uuid not null references activities.session_series (id) on delete cascade,
  participant_a uuid not null references identity.participants (id) on delete cascade,
  participant_b uuid not null references identity.participants (id) on delete cascade,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (series_id, participant_a, participant_b),
  check (participant_a < participant_b)
);
create index session_keep_apart_participant_a_idx on activities.session_keep_apart (participant_a);
create index session_keep_apart_participant_b_idx on activities.session_keep_apart (participant_b);
alter table activities.session_keep_apart enable row level security;

-- Night ratings: score and tags only, one per person per night. Never read individually;
-- the API serves aggregates once enough people have rated. Service role only.
create table activities.session_ratings (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references activities.session_occurrences (id) on delete cascade,
  rater_profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  score smallint not null check (score between 0 and 5),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (occurrence_id, rater_profile_id)
);
create index session_ratings_rater_idx on activities.session_ratings (rater_profile_id);
alter table activities.session_ratings enable row level security;

-- One night per series and start time (cancelled nights do not count).
create unique index session_occurrences_series_start_unique
  on activities.session_occurrences (series_id, starts_at)
  where cancelled_at is null;
