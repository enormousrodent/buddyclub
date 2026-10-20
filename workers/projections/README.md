# workers/projections

Placeholder. Outbox consumers are implemented from Phase 2 (ADR-006). Each worker is an
idempotent handler keyed on `platform.outbox_events.dedupe_key` with backoff and dead-letter
handling. No package.json yet so the workspace graph stays minimal.
