-- Addendum 1.4 step 3 (owner, 2026-10-22): buddies inside Rally.
--   Every account is a Buddy Club member. A buddy is someone you have shared a night with (both
--   checked in on the same occurrence); that list is derived at read time from session entries,
--   so nothing here stores it. What is stored: who said hi to whom, who blocked whom (hides in
--   both directions, the blocked person never learns), and reports for a person to review.
-- Additive. Reverse:
--   drop table identity.buddy_hellos, identity.buddy_reports, identity.buddy_blocks;

create table identity.buddy_blocks (
  blocker_id uuid not null references identity.user_profiles (id) on delete cascade,
  blocked_id uuid not null references identity.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint buddy_blocks_not_self check (blocker_id <> blocked_id)
);
create index buddy_blocks_blocked on identity.buddy_blocks (blocked_id);
alter table identity.buddy_blocks enable row level security;
comment on table identity.buddy_blocks is 'Blocker never sees blocked and vice versa; blocked is not told.';

create table identity.buddy_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references identity.user_profiles (id) on delete cascade,
  reported_id uuid not null references identity.user_profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint buddy_reports_not_self check (reporter_id <> reported_id)
);
create index buddy_reports_reported on identity.buddy_reports (reported_id);
create index buddy_reports_reporter on identity.buddy_reports (reporter_id);
alter table identity.buddy_reports enable row level security;

create table identity.buddy_hellos (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references identity.user_profiles (id) on delete cascade,
  to_id uuid not null references identity.user_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint buddy_hellos_once unique (from_id, to_id),
  constraint buddy_hellos_not_self check (from_id <> to_id)
);
create index buddy_hellos_to on identity.buddy_hellos (to_id, created_at desc);
alter table identity.buddy_hellos enable row level security;
comment on table identity.buddy_hellos is 'Say hi: one per pair and direction. Messaging comes later.';

-- The shared-nights query walks entries by participant and participants by profile.
create index if not exists session_entries_checked_in
  on activities.session_entries (occurrence_id, participant_id) where check_in_at is not null;
create index if not exists participants_profile on identity.participants (user_profile_id)
  where user_profile_id is not null;
