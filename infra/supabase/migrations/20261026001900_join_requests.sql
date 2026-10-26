-- Ask to join (owner, 2026-10-26): a person who finds a public, invitation-only session in
-- Near you can ask to join its club; an organiser approves or declines. Approval makes them a
-- club member and a regular of the session they asked about.
-- Additive. Reverse:
--   drop table community.join_requests;

create table community.join_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references community.organisations (id) on delete cascade,
  series_id uuid references activities.session_series (id) on delete set null,
  profile_id uuid not null references identity.user_profiles (id) on delete cascade,
  note text check (char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open request per person per club; a decided one may be followed by another.
create unique index join_requests_one_pending
  on community.join_requests (organisation_id, profile_id) where status = 'pending';
create index join_requests_org on community.join_requests (organisation_id, status, created_at desc);
create index join_requests_profile on community.join_requests (profile_id, created_at desc);
create index join_requests_series on community.join_requests (series_id) where series_id is not null;
alter table community.join_requests enable row level security;
comment on table community.join_requests is 'Ask to join a club via one of its public sessions; organisers decide.';
