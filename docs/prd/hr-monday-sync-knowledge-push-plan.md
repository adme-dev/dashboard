# HR Monday Sync and Knowledge Push

## Objective

Move existing Monday operational data into a governed, incrementally synchronized HR/process knowledge layer without making embeddings the system of record.

## Task list

### Phase 1 — Sync foundation

- [ ] Define sync cursor/state per approved scope and board.
- [ ] Add idempotent incremental sync for boards, groups, items, subitems, and approved structured fields.
- [ ] Reconcile renamed, archived, deleted, and reassigned Monday records.
- [ ] Preserve source IDs, source URLs, timestamps, scope ID, and migration session provenance.
- [ ] Add bounded retries, failure states, and resumable batches.

### Phase 2 — Governed evidence and retention

- [ ] Apply scope allowlists and retention windows during every sync, not only at preview time.
- [ ] Keep updates, files, private messages, and unrestricted communications excluded by default.
- [ ] Add audit events for sync start, completion, failure, and scope changes.
- [ ] Add owner-facing sync status and reconciliation counts.

### Checkpoint A

- [ ] Approved-scope sync completes twice without duplicate records.
- [ ] Changed and deleted source records reconcile correctly.
- [ ] Security tests, scoped typecheck, and production build pass.

### Phase 3 — Private knowledge-base indexing

- [ ] Store structured task/KPI data relationally as the source of truth.
- [ ] Create private process-document records from approved narrative fields only.
- [ ] Add embedding jobs with source provenance, scope, retention, and access policy.
- [ ] Support re-indexing and deletion when source records change or expire.
- [ ] Keep contracts, questionnaire answers, private messages, and unrestricted mail outside the index.

### Phase 4 — Process intelligence

- [ ] Derive recurring workflows, handoffs, blockers, rework, and ownership gaps.
- [ ] Attach confidence and evidence coverage to every finding.
- [ ] Require human review before any finding enters an employee scorecard.

### Checkpoint B

- [ ] Search returns only authorized private HR/process content.
- [ ] Every result has provenance and retention metadata.
- [ ] No vector-only KPI or performance decision is possible.

## Risks

- Monday API limits → bounded batches, cursors, and resumable retries.
- Scope drift → evaluate the active approved scope on every batch.
- Sensitive-content leakage → field allowlists, private index isolation, and fail-closed defaults.
- Duplicate or stale records → source-ID uniqueness and reconciliation states.
