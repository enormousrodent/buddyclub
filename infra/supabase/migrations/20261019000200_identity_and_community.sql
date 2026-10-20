-- Phase 0 / migration 2: user profiles, organisations, memberships, sports, groups,
-- participants (guest first-class), guest grants and invitation links.

-- ---------------------------------------------------------------------------
-- identity.user_profiles: one row per account. auth_user_id is nullable so an account can be
-- deleted/anonymised without touching historical references to the profile (spec section 11).
-- ---------------------------------------------------------------------------

create table identity.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  avatar_url text,
  locale text not null default 'en-GB' check (char_length(locale) between 2 and 16),
  anonymised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_set_updated_at
  before update on identity.user_profiles
  for each row execute function platform.set_updated_at();

-- Just-in-time profile creation on sign-up, so both apps see the same profile immediately.
create or replace function identity.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into identity.user_profiles (auth_user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'player'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function identity.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- community.organisations: the tenant boundary.
-- ---------------------------------------------------------------------------

create table community.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'),
  owner_profile_id uuid not null references identity.user_profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organisations_owner_idx on community.organisations (owner_profile_id);

create trigger organisations_set_updated_at
  before update on community.organisations
  for each row execute function platform.set_updated_at();

-- ---------------------------------------------------------------------------
-- community.memberships: organisation-scoped role grant for an account.
-- Finer-grained grants (competition, meet, session, team) arrive with their phases.
-- ---------------------------------------------------------------------------

create table community.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  user_profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  role community.membership_role not null,
  status community.membership_status not null default 'active',
  invited_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_profile_id)
);

create index memberships_user_profile_idx on community.memberships (user_profile_id);
create index memberships_org_role_idx on community.memberships (organisation_id, role) where status = 'active';

create trigger memberships_set_updated_at
  before update on community.memberships
  for each row execute function platform.set_updated_at();

-- ---------------------------------------------------------------------------
-- community.sports: reference data.
-- ---------------------------------------------------------------------------

create table community.sports (
  id text primary key check (id ~ '^[a-z_]{2,32}$'),
  name text not null,
  default_players_per_side integer not null check (default_players_per_side between 1 and 11)
);

insert into community.sports (id, name, default_players_per_side) values
  ('badminton', 'Badminton', 2),
  ('pickleball', 'Pickleball', 2),
  ('tennis', 'Tennis', 2),
  ('padel', 'Padel', 2),
  ('squash', 'Squash', 1),
  ('table_tennis', 'Table tennis', 1);

-- ---------------------------------------------------------------------------
-- identity.participants: a person who plays. Guests are first-class and have no account.
-- ---------------------------------------------------------------------------

create table identity.participants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  user_profile_id uuid references identity.user_profiles (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  source identity.participant_source not null default 'guest',
  -- Optional, self-declared, consent-gated attributes used by opt-in matching (spec section 8).
  declared_attributes jsonb not null default '{}'::jsonb,
  skill_rating numeric(5, 2),
  archived_at timestamptz,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column identity.participants.user_profile_id is 'Set only through a verified claim (ADR-008). Never merged by display name.';

create index participants_organisation_idx on identity.participants (organisation_id);
create index participants_user_profile_idx on identity.participants (user_profile_id) where user_profile_id is not null;
create unique index participants_one_per_account_per_org
  on identity.participants (organisation_id, user_profile_id)
  where user_profile_id is not null;

create trigger participants_set_updated_at
  before update on identity.participants
  for each row execute function platform.set_updated_at();

-- ---------------------------------------------------------------------------
-- identity.guest_grants: hashed, scoped, expiring view credentials for guests.
-- session_occurrence_id gains its foreign key when activities.session_occurrences exists (Phase 2).
-- ---------------------------------------------------------------------------

create table identity.guest_grants (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references identity.participants (id) on delete cascade,
  session_occurrence_id uuid,
  token_hash text not null unique check (char_length(token_hash) = 64),
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeem_count integer not null default 0 check (redeem_count >= 0),
  max_redeems integer not null default 1 check (max_redeems >= 1),
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column identity.guest_grants.token_hash is 'SHA-256 hex of the redemption token. Plaintext is never stored.';

create index guest_grants_participant_idx on identity.guest_grants (participant_id);
create index guest_grants_occurrence_idx on identity.guest_grants (session_occurrence_id) where session_occurrence_id is not null;

-- ---------------------------------------------------------------------------
-- community.groups and group_members (Buddy Club groups; allow guests and registered).
-- ---------------------------------------------------------------------------

create table community.groups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  sport_id text not null references community.sports (id),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index groups_organisation_idx on community.groups (organisation_id);
create index groups_sport_idx on community.groups (sport_id);

create trigger groups_set_updated_at
  before update on community.groups
  for each row execute function platform.set_updated_at();

create table community.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community.groups (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (group_id, participant_id)
);

create index group_members_participant_idx on community.group_members (participant_id);

-- ---------------------------------------------------------------------------
-- platform.invitation_links: hashed invite tokens with scope, expiry and use limits.
-- ---------------------------------------------------------------------------

create table platform.invitation_links (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('organisation', 'group', 'team', 'session', 'meet')),
  scope_id uuid not null,
  token_hash text not null unique check (char_length(token_hash) = 64),
  permissions jsonb not null default '[]'::jsonb,
  grants_role community.membership_role,
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses >= 1),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invitation_links_scope_idx on platform.invitation_links (scope_type, scope_id);
