# Architectural decision records

One file per decision. Status values: `Proposed`, `Accepted`, `Open` (needs product/ops input), `Superseded`.
Numbering follows the register in `RALLY_TECHNICAL_SPEC.md` section 17; ADR-011 and ADR-012 were
added in Phase 0 for the decisions the spec asked for explicitly.

| ID                                                         | Title                                                                                                       | Status                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [ADR-001](ADR-001-shared-supabase-auth.md)                 | Shared Supabase Auth project and per-app sessions                                                           | Accepted (Phase 0)                                          |
| [ADR-002](ADR-002-modular-monolith-api.md)                 | Single modular-monolith API for privileged writes                                                           | Accepted (Phase 0)                                          |
| [ADR-003](ADR-003-participants-independent-of-accounts.md) | Participants independent of account identities                                                              | Accepted (required by spec)                                 |
| [ADR-004](ADR-004-immutable-rulesets.md)                   | Versioned, immutable rulesets pinned per meet/session                                                       | Accepted (required by spec)                                 |
| [ADR-005](ADR-005-fixtures-vs-court-scheduling.md)         | Fixture/match model separated from court scheduling                                                         | Accepted (required by spec)                                 |
| [ADR-006](ADR-006-outbox-and-realtime-projections.md)      | Transactional outbox and realtime read projections                                                          | Accepted (Phase 0)                                          |
| [ADR-007](ADR-007-fastify-and-kysely.md)                   | Fastify over NestJS; Kysely as the query layer                                                              | Accepted (Phase 0)                                          |
| [ADR-008](ADR-008-guest-redemption-and-claim.md)           | Guest redemption proof and claim verification                                                               | Open (before guest release)                                 |
| [ADR-009](ADR-009-fixture-tie-and-scoring-policy.md)       | 2-2 fixture outcome, win-by-two and point cap                                                               | Open (product confirmation)                                 |
| [ADR-010](ADR-010-hosting-retention-backups.md)            | Hosting region, data retention and backup policy                                                            | Partly decided: Vercel + Supabase eu-west-1; retention open |
| [ADR-011](ADR-011-rls-and-read-models.md)                  | Row level security and read-model strategy                                                                  | Accepted (Phase 0)                                          |
| [ADR-012](ADR-012-api-deployment.md)                       | API deployment shape and migration pipeline                                                                 | Accepted: Vercel Function                                   |
| [ADR-013](ADR-013-web-first-clients.md)                    | Web-first clients, one Next.js codebase, two hosts                                                          | Accepted (Phase 1)                                          |
| [ADR-014](ADR-014-realtime-transport.md)                   | Realtime transport: Supabase Realtime now, Ably as the designated swap                                      | Accepted (Phase 2)                                          |
| [ADR-015](ADR-015-design-system-foundations.md)            | Design system foundations: Paper & Path tokens, marks, components                                           | Accepted (design pass, first version)                       |
| [ADR-016](ADR-016-public-boards-and-qr-join.md)            | Public boards and QR registration: opt-in slugs, redacted projection, members-only join                     | Accepted (Phase 4)                                          |
| [ADR-017](ADR-017-personal-workspace-and-owner-scope.md)   | Rally personal workspaces and session owner scope                                                           | Accepted (Addendum 1.1 step 1)                              |
| [ADR-018](ADR-018-community-model-and-rally-link.md)       | General-purpose community model (interests, public groups, activities, RSVPs) and the Rally attendance link | Accepted (Addendum 1.1 step 3)                              |
