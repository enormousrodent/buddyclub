-- Phase 0 / migration 3: row level security and privileges.
--
-- Model (ADR-011): end users get RLS-filtered SELECT on tenant data through PostgREST/Realtime.
-- All writes go through the platform API using a server-side credential that bypasses RLS.
-- Nothing in these schemas is granted to anon.

-- ---------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so policies can consult memberships without recursion).
-- ---------------------------------------------------------------------------

create or replace function community.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from identity.user_profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function community.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from community.memberships m
    where m.organisation_id = org_id
      and m.status = 'active'
      and m.user_profile_id = community.current_profile_id()
  );
$$;

create or replace function community.has_org_role(org_id uuid, roles community.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from community.memberships m
    where m.organisation_id = org_id
      and m.status = 'active'
      and m.role = any (roles)
      and m.user_profile_id = community.current_profile_id()
  );
$$;

revoke all on function community.current_profile_id() from public;
revoke all on function community.is_org_member(uuid) from public;
revoke all on function community.has_org_role(uuid, community.membership_role[]) from public;
grant execute on function community.current_profile_id() to authenticated, service_role;
grant execute on function community.is_org_member(uuid) to authenticated, service_role;
grant execute on function community.has_org_role(uuid, community.membership_role[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema identity, community, platform from anon, authenticated;

grant all on all tables in schema identity, community, platform to service_role;
alter default privileges in schema identity grant all on tables to service_role;
alter default privileges in schema community grant all on tables to service_role;
alter default privileges in schema platform grant all on tables to service_role;

grant select on
  identity.user_profiles,
  identity.participants,
  community.organisations,
  community.memberships,
  community.sports,
  community.groups,
  community.group_members
to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere, including tables with no end-user policies (deny by default).
-- ---------------------------------------------------------------------------

alter table identity.user_profiles enable row level security;
alter table identity.participants enable row level security;
alter table identity.guest_grants enable row level security;
alter table community.organisations enable row level security;
alter table community.memberships enable row level security;
alter table community.sports enable row level security;
alter table community.groups enable row level security;
alter table community.group_members enable row level security;
alter table platform.audit_events enable row level security;
alter table platform.outbox_events enable row level security;
alter table platform.invitation_links enable row level security;

-- ---------------------------------------------------------------------------
-- SELECT policies for authenticated end users. No INSERT/UPDATE/DELETE policies exist:
-- the platform API is the sole write surface (ADR-002).
-- ---------------------------------------------------------------------------

create policy user_profiles_select_self
  on identity.user_profiles for select to authenticated
  using (auth_user_id = auth.uid());

create policy user_profiles_select_shared_org
  on identity.user_profiles for select to authenticated
  using (
    exists (
      select 1
      from community.memberships m
      where m.user_profile_id = identity.user_profiles.id
        and m.status = 'active'
        and community.is_org_member(m.organisation_id)
    )
  );

create policy organisations_select_member
  on community.organisations for select to authenticated
  using (community.is_org_member(id));

create policy memberships_select_same_org
  on community.memberships for select to authenticated
  using (community.is_org_member(organisation_id));

create policy sports_select_all
  on community.sports for select to authenticated
  using (true);

create policy participants_select_same_org
  on identity.participants for select to authenticated
  using (community.is_org_member(organisation_id));

create policy groups_select_same_org
  on community.groups for select to authenticated
  using (community.is_org_member(organisation_id));

create policy group_members_select_same_org
  on community.group_members for select to authenticated
  using (
    exists (
      select 1
      from community.groups g
      where g.id = community.group_members.group_id
        and community.is_org_member(g.organisation_id)
    )
  );
