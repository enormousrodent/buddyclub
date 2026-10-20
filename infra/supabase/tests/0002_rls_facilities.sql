-- pgTAP: facilities visibility follows organisation membership. Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-fac-a@example.com', '{}'::jsonb, '{"full_name":"Fac A"}'::jsonb, now(), now()),
  ('e0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-fac-b@example.com', '{}'::jsonb, '{"full_name":"Fac B"}'::jsonb, now(), now());

insert into community.organisations (id, name, slug, owner_profile_id)
select 'd1000000-0000-4000-8000-000000000000', 'Fac Club A', 'fac-club-a', id
from identity.user_profiles where auth_user_id = 'd0000000-0000-4000-8000-000000000001';

insert into community.memberships (organisation_id, user_profile_id, role)
select 'd1000000-0000-4000-8000-000000000000', id, 'org_admin'
from identity.user_profiles where auth_user_id = 'd0000000-0000-4000-8000-000000000001';

insert into facilities.venues (id, organisation_id, name, timezone)
values ('d2000000-0000-4000-8000-000000000000', 'd1000000-0000-4000-8000-000000000000', 'Hall A', 'Europe/London');

insert into facilities.courts (venue_id, code) values ('d2000000-0000-4000-8000-000000000000', '1');

select throws_ok(
  $$ insert into facilities.venues (organisation_id, name, timezone)
     values ('d1000000-0000-4000-8000-000000000000', 'Bad TZ', 'Mars/Olympus') $$,
  '23514',
  'unknown IANA timezone: Mars/Olympus',
  'venue timezone must be a known IANA name');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from facilities.venues where name = 'Hall A'), 1, 'member sees own club venue');
select is((select count(*)::int from facilities.courts where venue_id = 'd2000000-0000-4000-8000-000000000000'), 1, 'member sees own club courts');

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from facilities.venues where name = 'Hall A'), 0, 'non-member sees no venues');

select * from finish();
rollback;
