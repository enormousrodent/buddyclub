# Policies

Row level security policies live inside the migrations (currently
`migrations/20261019000300_rls_and_grants.sql`) so that policy changes are versioned with the
schema they protect. This folder holds the policy matrix documentation.

## Phase 0 matrix

| Table                                                          | anon | authenticated (SELECT)                                  | authenticated (write) | service role |
| -------------------------------------------------------------- | ---- | ------------------------------------------------------- | --------------------- | ------------ |
| `identity.user_profiles`                                       | none | own row, plus profiles sharing an active org membership | none                  | all          |
| `identity.participants`                                        | none | rows in orgs where the user is an active member         | none                  | all          |
| `identity.guest_grants`                                        | none | none (API only)                                         | none                  | all          |
| `community.organisations`                                      | none | orgs where the user is an active member                 | none                  | all          |
| `community.memberships`                                        | none | memberships of orgs the user belongs to                 | none                  | all          |
| `community.sports`                                             | none | all                                                     | none                  | all          |
| `community.groups` / `group_members`                           | none | groups in the user's orgs                               | none                  | all          |
| `platform.audit_events` / `outbox_events` / `invitation_links` | none | none                                                    | none                  | all          |

Guest view access (Phase 1) is served by API read models, not by direct table policies.
