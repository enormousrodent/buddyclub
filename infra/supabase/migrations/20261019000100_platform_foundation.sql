-- Phase 0 / migration 1: schemas, shared helpers, enums, audit log and outbox.
-- Reversal: see infra/supabase/migrations/README.md (drop in reverse order).

create extension if not exists "pgcrypto" with schema extensions;

create schema if not exists identity;
create schema if not exists community;
create schema if not exists platform;

comment on schema identity is 'Accounts (profiles linked to auth.users) and participants (people who play, possibly guests).';
comment on schema community is 'Tenant boundary: organisations, memberships, groups.';
comment on schema platform is 'Cross-cutting: audit log, outbox, rulesets, invitation links.';

-- Only authenticated users and the service role may even see these schemas. anon gets nothing.
grant usage on schema identity, community, platform to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function platform.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function platform.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums (migration-managed; add values with ALTER TYPE ... ADD VALUE in later migrations)
-- ---------------------------------------------------------------------------

create type community.membership_role as enum (
  'platform_admin',
  'org_admin',
  'competition_director',
  'session_organiser',
  'team_captain',
  'participant',
  'spectator'
);

create type community.membership_status as enum ('invited', 'active', 'suspended', 'left');

create type identity.participant_source as enum ('registered', 'guest', 'imported');

create type platform.actor_type as enum ('user', 'guest', 'service', 'system');

create type platform.outbox_status as enum ('pending', 'processing', 'delivered', 'dead');

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

create table platform.audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  actor_type platform.actor_type not null,
  actor_id uuid,
  reason text,
  correlation_id text,
  ruleset_version text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

comment on table platform.audit_events is 'Every privileged state change. Rows are never updated or deleted.';

create index audit_events_entity_idx on platform.audit_events (entity_type, entity_id, created_at desc);
create index audit_events_correlation_idx on platform.audit_events (correlation_id) where correlation_id is not null;

create trigger audit_events_append_only
  before update or delete on platform.audit_events
  for each row execute function platform.reject_mutation();

-- ---------------------------------------------------------------------------
-- Transactional outbox
-- ---------------------------------------------------------------------------

create table platform.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload_json jsonb not null,
  status platform.outbox_status not null default 'pending',
  retries integer not null default 0 check (retries >= 0),
  dedupe_key text unique,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table platform.outbox_events is 'Domain events committed in the same transaction as the state change; drained by workers.';

create index outbox_events_status_idx on platform.outbox_events (status, created_at);
create index outbox_events_available_idx on platform.outbox_events (available_at) where status = 'pending';
