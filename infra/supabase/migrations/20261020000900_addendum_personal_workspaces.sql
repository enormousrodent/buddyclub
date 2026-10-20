-- Addendum 1.1 step 1 / migration 9: personal workspaces (Rally without a club) and session
-- owner scope (ADR-017). Additive only. Reverse: alter table activities.session_series drop column
-- buddy_group_id, drop column owner_scope; alter table community.organisations drop column kind;
-- drop type activities.owner_scope; drop type community.organisation_kind.

create type community.organisation_kind as enum ('club', 'personal');
alter table community.organisations
  add column kind community.organisation_kind not null default 'club';
create index organisations_kind_idx on community.organisations (kind);
-- One personal workspace per account.
create unique index organisations_personal_owner_unique
  on community.organisations (owner_profile_id) where kind = 'personal';

create type activities.owner_scope as enum ('personal', 'organisation', 'buddy_group');
alter table activities.session_series
  add column owner_scope activities.owner_scope not null default 'organisation',
  add column buddy_group_id uuid references community.groups (id) on delete set null;
create index session_series_buddy_group_idx on activities.session_series (buddy_group_id);

-- Backfill: series in personal workspaces are personal; series with a group are buddy_group.
update activities.session_series s
set owner_scope = 'personal'
from community.organisations o
where o.id = s.organisation_id and o.kind = 'personal';
update activities.session_series
set owner_scope = 'buddy_group', buddy_group_id = group_id
where group_id is not null and owner_scope = 'organisation';
