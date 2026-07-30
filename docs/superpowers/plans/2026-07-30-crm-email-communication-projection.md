# CRM Email Communication Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project each newly-created canonical CRM email message into the
existing `crm_communications` timeline exactly once when its conversation is
linked to a person or company.

**Architecture:** A small transaction-client projection helper inserts from
`crm_messages` joined to its tenant-owned `crm_conversations` row. The existing
partial unique index on `(client_id, source, external_id)` provides
idempotency, using `source = 'email_bridge'` and
`external_id = 'crm_message:' || message.id`. `createMessage()` invokes the
helper inside the same database transaction only after the canonical message
and conversation timestamp are durable.

**Tech Stack:** TypeScript, Neon PostgreSQL, existing
`crm_communications` schema, Vitest

## Constraints

- Every source and destination predicate includes `client_id`.
- Projection is skipped when the conversation has neither a person nor a
  company; later identity-linking work may explicitly retry it.
- Only plain text is projected into the legacy timeline; HTML remains in the
  canonical message and must be sanitised before future display.
- The bridge metadata contains canonical IDs only, never provider payloads,
  raw MIME, credentials, or tokens.
- Manual communication rows and existing marketing/lead bridge rows are not
  changed.
- A duplicate message retry does not create or update another timeline row.
- No feature flag, API, Worker, portal UI, outbound send, or marketing-page
  change is part of A5.

### Task 1: Projection contract

**Files:**

- Create: `test/server/utils/crm/emailCommunicationProjection.test.ts`
- Create: `server/utils/crm/emailCommunicationProjection.ts`

- [ ] Write failing tests for tenant-scoped insert-select, stable external ID,
      linked-target requirement, safe metadata, plain-text body, and duplicate
      conflict handling.
- [ ] Run the test and observe the expected missing-module failure.
- [ ] Implement the transaction-client projection helper and canonical row
      mapping.
- [ ] Run focused tests and ESLint.
- [ ] Commit as `feat(crm): project email messages to timeline`.

### Task 2: Atomic repository integration

**Files:**

- Modify: `test/server/utils/crm/emailRepository.test.ts`
- Modify: `server/utils/crm/emailRepository.ts`

- [ ] Write a failing repository assertion that a newly-created message
      projects inside the same transaction after the conversation timestamp
      update.
- [ ] Confirm duplicate and provider-race recovery paths do not emit another
      projection.
- [ ] Invoke the projection helper only for a successfully inserted canonical
      message.
- [ ] Run repository, projection, token, contract, migration, and legacy
      communication tests.
- [ ] Re-read all changed files, run focused ESLint, typecheck, and
      `git diff --check`.
- [ ] Commit as `feat(crm): atomically bridge email activity`.

### Task 3: Live rollback proof and ledger

**Files:**

- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify:
  `docs/superpowers/plans/2026-07-30-crm-email-communication-projection.md`

- [ ] Run a rollback-only Neon transaction with a linked CRM person or company.
- [ ] Prove one canonical message creates one `email_bridge` communication,
      a retry creates none, IDs/tenant/content map correctly, and rollback
      leaves zero rows.
- [ ] Run final focused verification and typecheck.
- [ ] Check off A5 and record commands, counts, commits, and live evidence.
- [ ] Commit as `docs(crm): record timeline projection verification`.
