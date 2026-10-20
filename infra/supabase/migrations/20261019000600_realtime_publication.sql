-- Phase 2 / migration 6: expose change signals for live session pages (ADR-014).
-- Clients subscribe to these tables through Supabase Realtime with their own session; RLS applies.
-- Reverse: alter publication supabase_realtime drop table activities.session_occurrences, activities.social_rounds;

alter publication supabase_realtime add table activities.session_occurrences;
alter publication supabase_realtime add table activities.social_rounds;
