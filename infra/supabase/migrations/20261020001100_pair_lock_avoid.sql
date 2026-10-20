-- Keep-apart pairings (owner request 2026-10-20): a pair lock of kind 'avoid' keeps two players
-- off the same court, as partners or opponents. Additive: one new enum value.
-- Reverse: enum values cannot be dropped; leave it, or recreate the type without 'avoid'
-- after deleting rows that use it.
alter type activities.pair_lock_kind add value if not exists 'avoid';
