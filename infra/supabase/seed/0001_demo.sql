-- Local development seed. Loaded by `supabase db reset`. NEVER run against a shared environment.
-- Demo credentials (local only): organiser@example.com / password123, player@example.com / password123,
-- other-admin@example.com / password123.

-- Deterministic ids so docs and tests can reference them.
-- Users
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token
) values
  (
    '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'organiser@example.com', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Olive Organiser"}'::jsonb, now(), now(), '', ''
  ),
  (
    '22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'player@example.com', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Pat Player"}'::jsonb, now(), now(), '', ''
  ),
  (
    '33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'other-admin@example.com', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Oscar Other"}'::jsonb, now(), now(), '', ''
  );

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

-- Profiles were created by the on_auth_user_created trigger. Organisations:
insert into community.organisations (id, name, slug, owner_profile_id)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Demo Badminton Club', 'demo-badminton', p.id
from identity.user_profiles p where p.auth_user_id = '11111111-1111-4111-8111-111111111111';

insert into community.organisations (id, name, slug, owner_profile_id)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Other Town Racquets', 'other-town', p.id
from identity.user_profiles p where p.auth_user_id = '33333333-3333-4333-8333-333333333333';

-- Memberships
insert into community.memberships (organisation_id, user_profile_id, role)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p.id, 'org_admin'
from identity.user_profiles p where p.auth_user_id = '11111111-1111-4111-8111-111111111111';

insert into community.memberships (organisation_id, user_profile_id, role)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p.id, 'participant'
from identity.user_profiles p where p.auth_user_id = '22222222-2222-4222-8222-222222222222';

insert into community.memberships (organisation_id, user_profile_id, role)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p.id, 'org_admin'
from identity.user_profiles p where p.auth_user_id = '33333333-3333-4333-8333-333333333333';

-- Group
insert into community.groups (id, organisation_id, sport_id, name, description)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'badminton',
        'Tuesday Social', 'Weekly social doubles, all welcome.');

-- Participants: registered members plus a walk-in guest with no account.
insert into identity.participants (id, organisation_id, user_profile_id, display_name, source)
select 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p.id, p.display_name, 'registered'
from identity.user_profiles p where p.auth_user_id = '11111111-1111-4111-8111-111111111111';

insert into identity.participants (id, organisation_id, user_profile_id, display_name, source)
select 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p.id, p.display_name, 'registered'
from identity.user_profiles p where p.auth_user_id = '22222222-2222-4222-8222-222222222222';

insert into identity.participants (id, organisation_id, user_profile_id, display_name, source)
values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Walk-in Sam', 'guest');

insert into community.group_members (group_id, participant_id)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3');
