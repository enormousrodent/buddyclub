-- pgTAP: cross-tenant isolation (spec section 11). Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Fixtures created as postgres (bypasses RLS), independent of seed data.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-a@example.com', '{}'::jsonb, '{"full_name":"Member A"}'::jsonb, now(), now()),
  ('b0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-b@example.com', '{}'::jsonb, '{"full_name":"Member B"}'::jsonb, now(), now()),
  ('c0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-nobody@example.com', '{}'::jsonb, '{"full_name":"No Club"}'::jsonb, now(), now());

insert into community.organisations (id, name, slug, owner_profile_id)
select 'a1000000-0000-4000-8000-000000000000', 'RLS Club A', 'rls-club-a', id
from identity.user_profiles where auth_user_id = 'a0000000-0000-4000-8000-000000000001';

insert into community.organisations (id, name, slug, owner_profile_id)
select 'b1000000-0000-4000-8000-000000000000', 'RLS Club B', 'rls-club-b', id
from identity.user_profiles where auth_user_id = 'b0000000-0000-4000-8000-000000000002';

insert into community.memberships (organisation_id, user_profile_id, role)
select 'a1000000-0000-4000-8000-000000000000', id, 'org_admin'
from identity.user_profiles where auth_user_id = 'a0000000-0000-4000-8000-000000000001';

insert into community.memberships (organisation_id, user_profile_id, role)
select 'b1000000-0000-4000-8000-000000000000', id, 'org_admin'
from identity.user_profiles where auth_user_id = 'b0000000-0000-4000-8000-000000000002';

insert into identity.participants (organisation_id, display_name, source)
values ('a1000000-0000-4000-8000-000000000000', 'Guest In A', 'guest'),
       ('b1000000-0000-4000-8000-000000000000', 'Guest In B', 'guest');

-- Act as member A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::int from community.organisations where slug like 'rls-club-%'),
  1, 'member of club A sees exactly one RLS club');

select is(
  (select count(*)::int from community.organisations where slug = 'rls-club-b'),
  0, 'club B is invisible to a member of club A');

select is(
  (select count(*)::int from identity.participants where display_name = 'Guest In B'),
  0, 'club B guests are invisible to a member of club A');

select is(
  (select count(*)::int from identity.participants where display_name = 'Guest In A'),
  1, 'club A guests are visible to a member of club A');

select is(
  (select count(*)::int from identity.user_profiles where auth_user_id = 'b0000000-0000-4000-8000-000000000002'),
  0, 'profiles of people in other clubs are hidden');

select is(
  (select count(*)::int from identity.user_profiles where auth_user_id = 'a0000000-0000-4000-8000-000000000001'),
  1, 'own profile is visible');

select throws_ok(
  $$ insert into community.organisations (name, slug, owner_profile_id)
     values ('Sneaky', 'sneaky', community.current_profile_id()) $$,
  '42501',
  'permission denied for table organisations',
  'authenticated role cannot insert organisations directly');

select throws_ok(
  $$ select count(*) from platform.audit_events $$,
  '42501',
  'permission denied for table audit_events',
  'authenticated role cannot read the audit log');

-- Act as a user with no memberships.
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*)::int from community.organisations where slug like 'rls-club-%'),
  0, 'a user with no memberships sees no organisations');

select * from finish();
rollback;
