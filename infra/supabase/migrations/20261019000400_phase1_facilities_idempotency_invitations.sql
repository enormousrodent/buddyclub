-- Phase 1 / migration 4: facilities (venues, courts), optimistic versions, idempotency keys,
-- invitation redemptions. Reverse steps in infra/supabase/migrations/README.md.

-- ---------------------------------------------------------------------------
-- Optimistic concurrency on mutable aggregates (spec section 5.2).
-- ---------------------------------------------------------------------------

alter table community.organisations add column version integer not null default 1;
alter table identity.participants add column version integer not null default 1;
alter table community.groups add column version integer not null default 1;

-- ---------------------------------------------------------------------------
-- facilities: venues and courts.
-- ---------------------------------------------------------------------------

create schema if not exists facilities;
grant usage on schema facilities to authenticated, service_role;

create or replace function facilities.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown IANA timezone: %', new.timezone using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create table facilities.venues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  timezone text not null,
  address_json jsonb not null default '{}'::jsonb,
  notes text,
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index venues_organisation_idx on facilities.venues (organisation_id);

create trigger venues_validate_timezone
  before insert or update of timezone on facilities.venues
  for each row execute function facilities.validate_timezone();

create trigger venues_set_updated_at
  before update on facilities.venues
  for each row execute function platform.set_updated_at();

create table facilities.courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references facilities.venues (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 16),
  label text,
  sport_ids text[] not null default '{}',
  zone text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, code)
);

create index courts_venue_idx on facilities.courts (venue_id);

create trigger courts_set_updated_at
  before update on facilities.courts
  for each row execute function platform.set_updated_at();

revoke all on all tables in schema facilities from anon, authenticated;
grant all on all tables in schema facilities to service_role;
alter default privileges in schema facilities grant all on tables to service_role;
grant select on facilities.venues, facilities.courts to authenticated;

alter table facilities.venues enable row level security;
alter table facilities.courts enable row level security;

create policy venues_select_same_org
  on facilities.venues for select to authenticated
  using (community.is_org_member(organisation_id));

create policy courts_select_same_org
  on facilities.courts for select to authenticated
  using (
    exists (
      select 1 from facilities.venues v
      where v.id = facilities.courts.venue_id
        and community.is_org_member(v.organisation_id)
    )
  );

-- ---------------------------------------------------------------------------
-- platform.idempotency_keys: replay protection for mutating requests (spec section 4).
-- scope is the acting identity (profile id or guest grant id) so keys cannot collide across actors.
-- ---------------------------------------------------------------------------

create table platform.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null check (char_length(key) between 1 and 200),
  request_hash text not null,
  status_code integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (scope, key)
);

create index idempotency_keys_expires_idx on platform.idempotency_keys (expires_at);

-- ---------------------------------------------------------------------------
-- platform.invitation_redemptions: who redeemed which invitation (idempotent per account).
-- ---------------------------------------------------------------------------

create table platform.invitation_redemptions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references platform.invitation_links (id) on delete cascade,
  user_profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (invitation_id, user_profile_id)
);

create index invitation_redemptions_profile_idx on platform.invitation_redemptions (user_profile_id);

alter table platform.invitation_redemptions enable row level security;
