-- Regulars on a session preset (owner request 2026-10-20): the people who are usually in a
-- given series. Starting a session from the preset registers them all, so the organiser only
-- checks people in. Additive.
-- Reverse: drop table activities.session_regulars;
create table activities.session_regulars (
  series_id uuid not null references activities.session_series (id) on delete cascade,
  participant_id uuid not null references identity.participants (id) on delete cascade,
  added_by_profile_id uuid references identity.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (series_id, participant_id)
);
create index session_regulars_participant_idx on activities.session_regulars (participant_id);

alter table activities.session_regulars enable row level security;
-- The API is the only writer (service role); members read through the API as well.
