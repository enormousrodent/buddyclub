-- Addendum 1.1 step 3 / migration 10: category-agnostic community model (ADR-018). Additive.
-- Reverse: drop table community.activity_rsvps, community.activities, community.group_interests,
-- community.interests; alter table community.groups drop column visibility, drop column join_policy,
-- drop column locality, drop column location_name, alter column sport_id set not null;
-- drop type community.group_visibility, community.group_join_policy, community.activity_state, community.rsvp_status.

-- ---------------------------------------------------------------------------
-- Interests: reference data for every kind of community, sports included.
-- ---------------------------------------------------------------------------

create table community.interests (
  id text primary key check (id ~ '^[a-z_]{2,32}$'),
  name text not null,
  sort_order integer not null default 100
);
grant select on community.interests to anon, authenticated, service_role;
grant all on community.interests to service_role;

insert into community.interests (id, name, sort_order) values
  ('sports', 'Sports', 10),
  ('racket_sports', 'Racket sports', 11),
  ('running', 'Running', 12),
  ('cycling', 'Cycling', 13),
  ('swimming', 'Swimming', 14),
  ('walking', 'Walking and hiking', 15),
  ('dog_walking', 'Dog walking', 20),
  ('books', 'Books', 30),
  ('board_games', 'Board games', 31),
  ('families', 'Families', 40),
  ('parent_toddler', 'Parent and toddler', 41),
  ('wellbeing', 'Wellbeing', 50),
  ('arts_crafts', 'Arts and crafts', 60),
  ('food_drink', 'Food and drink', 61),
  ('music', 'Music', 62),
  ('volunteering', 'Volunteering', 70),
  ('other', 'Other', 999);

-- ---------------------------------------------------------------------------
-- Groups: optional sport, interests, visibility, join policy, locality
-- ---------------------------------------------------------------------------

create type community.group_visibility as enum ('public', 'private');
create type community.group_join_policy as enum ('open', 'invite');

alter table community.groups
  alter column sport_id drop not null,
  add column visibility community.group_visibility not null default 'private',
  add column join_policy community.group_join_policy not null default 'invite',
  add column locality text check (locality is null or char_length(locality) <= 120),
  add column location_name text check (location_name is null or char_length(location_name) <= 200);
create index groups_public_idx on community.groups (visibility, locality) where archived_at is null;

create table community.group_interests (
  group_id uuid not null references community.groups (id) on delete cascade,
  interest_id text not null references community.interests (id),
  primary key (group_id, interest_id)
);
create index group_interests_interest_idx on community.group_interests (interest_id);

-- Backfill: every existing group was a sport group.
insert into community.group_interests (group_id, interest_id)
select id, 'racket_sports' from community.groups where sport_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Activities: the cross-category gathering, optionally run by Rally
-- ---------------------------------------------------------------------------

create type community.activity_state as enum ('scheduled', 'cancelled', 'completed');
create type community.rsvp_status as enum ('going', 'maybe', 'not_going');

create table community.activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  group_id uuid not null references community.groups (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  interest_id text references community.interests (id),
  venue_id uuid references facilities.venues (id) on delete set null,
  location_name text check (location_name is null or char_length(location_name) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer check (capacity is null or capacity between 1 and 10000),
  visibility community.group_visibility not null default 'public',
  state community.activity_state not null default 'scheduled',
  -- One attendance owner: when set, Rally's session entries are the ledger (ADR-018).
  rally_occurrence_id uuid unique references activities.session_occurrences (id) on delete set null,
  version integer not null default 1,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index activities_group_idx on community.activities (group_id, starts_at);
create index activities_public_idx on community.activities (visibility, starts_at) where state = 'scheduled';
create trigger activities_set_updated_at before update on community.activities for each row execute function platform.set_updated_at();

create table community.activity_rsvps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references community.activities (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete cascade,
  status community.rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, participant_id)
);
create index activity_rsvps_participant_idx on community.activity_rsvps (participant_id);
create trigger activity_rsvps_set_updated_at before update on community.activity_rsvps for each row execute function platform.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges and RLS: members of the owning organisation may read; writes go through the API.
-- ---------------------------------------------------------------------------

revoke all on community.group_interests, community.activities, community.activity_rsvps from anon, authenticated;
grant all on community.group_interests, community.activities, community.activity_rsvps to service_role;
grant select on community.group_interests, community.activities, community.activity_rsvps to authenticated;

alter table community.group_interests enable row level security;
alter table community.activities enable row level security;
alter table community.activity_rsvps enable row level security;

create policy group_interests_select on community.group_interests for select to authenticated
  using (exists (select 1 from community.groups g where g.id = community.group_interests.group_id and community.is_org_member(g.organisation_id)));
create policy activities_select on community.activities for select to authenticated
  using (community.is_org_member(organisation_id));
create policy activity_rsvps_select on community.activity_rsvps for select to authenticated
  using (exists (select 1 from community.activities a where a.id = community.activity_rsvps.activity_id and community.is_org_member(a.organisation_id)));
