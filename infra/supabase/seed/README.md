# Seed data

`0001_demo.sql` runs on every `supabase db reset` (local only). It creates three local accounts
with the password `password123`, two organisations (so cross-tenant behaviour is visible in dev),
one group, two registered participants and one walk-in guest.

Fixed ids:

| Thing                                                    | Id                                     |
| -------------------------------------------------------- | -------------------------------------- |
| organiser@example.com (org_admin, Demo Badminton Club)   | `11111111-1111-4111-8111-111111111111` |
| player@example.com (participant, Demo Badminton Club)    | `22222222-2222-4222-8222-222222222222` |
| other-admin@example.com (org_admin, Other Town Racquets) | `33333333-3333-4333-8333-333333333333` |
| Demo Badminton Club                                      | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` |
| Other Town Racquets                                      | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` |
| Tuesday Social group                                     | `cccccccc-cccc-4ccc-8ccc-cccccccccccc` |
| Walk-in Sam (guest, no account)                          | `dddddddd-dddd-4ddd-8ddd-ddddddddddd3` |
