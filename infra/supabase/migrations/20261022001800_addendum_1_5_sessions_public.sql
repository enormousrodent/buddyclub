-- Addendum 1.5 (owner, 2026-10-22): the session is the group. A session can be public and
-- open to join, which is what community groups did; groups are no longer shown in the app.
-- Additive. Reverse:
--   alter table activities.session_series drop column visibility, drop column join_policy,
--     drop column locality;

alter table activities.session_series
  add column visibility text not null default 'private'
    check (visibility in ('public', 'private')),
  add column join_policy text not null default 'invite'
    check (join_policy in ('open', 'invite')),
  add column locality text check (char_length(locality) between 1 and 120);

comment on column activities.session_series.visibility is 'public: listed in Near you; private: members and links only.';
comment on column activities.session_series.join_policy is 'open: anyone may join and becomes a regular; invite: links only.';
comment on column activities.session_series.locality is 'Town or area for discovery when there is no venue.';

create index session_series_public
  on activities.session_series (sport_id, name)
  where visibility = 'public' and archived_at is null;
