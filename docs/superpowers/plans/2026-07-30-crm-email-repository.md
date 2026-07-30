# CRM Email Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist tenant-scoped CRM conversations, messages, and provider events idempotently while projecting only valid delivery-state advances.

**Architecture:** A dependency-injected Postgres repository runs every mutation inside the existing dedicated transaction helper. Message idempotency uses `(client_id, idempotency_key)` and provider events use `(client_id, provider, provider_event_id)`. A locked message row and the pure delivery projector prevent out-of-order events from regressing canonical state.

**Tech Stack:** TypeScript, Neon PostgreSQL, existing `server/utils/db.ts` transaction helper, Vitest

## Global constraints

- Every select, insert, update, and conflict recovery query includes `client_id`.
- Input client IDs are supplied only by authenticated or server-owned callers in later API/Worker slices.
- Repository methods return canonical rows, not provider payloads.
- Message and event duplicates return the existing canonical row.
- A provider event ID already attached to a different message returns `event_conflict`.
- Event insertion and delivery projection occur in one transaction.
- `delivered` accepts only a later complaint; terminal negative states never regress.
- Existing `crm_communications` projection remains A5 and is not changed here.

### Task 1: Conversation and idempotent message writes

**Files:**

- Create: `test/server/utils/crm/emailRepository.test.ts`
- Create: `server/utils/crm/emailRepository.ts`

- [x] Write failing tests for tenant-scoped conversation insertion, new message
      insertion, duplicate idempotency recovery, provider-message race
      recovery, and conversation timestamp update.
- [x] Run the test and observe module-resolution failure.
- [x] Implement `createConversation()` and `createMessage()` using injected
      transactions and canonical row mapping.
- [x] Run the repository and existing email-contract tests.
- [x] Re-read implementation/tests and run focused ESLint.
- [x] Commit as `feat(crm): persist idempotent email messages`.

### Task 2: Idempotent event append and state projection

**Files:**

- Modify: `test/server/utils/crm/emailRepository.test.ts`
- Modify: `server/utils/crm/emailRepository.ts`

- [x] Write failing tests for appended, duplicate, event-conflict, message
      not-found, delivery advance, stale event, and delivered-to-complained
      behavior.
- [x] Run the tests and observe the expected assertion failures.
- [x] Implement `appendMessageEvent()` with `FOR UPDATE`, event conflict
      recovery, and canonical delivery projection in one transaction.
- [x] Run focused repository, token, contract, migration, and legacy
      communication tests.
- [x] Run focused ESLint and `git diff --check`.
- [x] Commit as `feat(crm): project idempotent email events`.

### Task 3: Live transaction smoke and ledger

**Files:**

- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify: `docs/superpowers/plans/2026-07-30-crm-email-repository.md`

- [x] Execute a rollback-only live Postgres transaction that creates a
      conversation/message/event, repeats both idempotency keys, proves tenant
      mismatch rejection, projects delivery, and leaves no rows behind.
- [x] Run final focused tests and lint.
- [x] Check off A4 and record commands, counts, commits, and live evidence.
- [x] Commit as `docs(crm): record email repository verification`.

## Verification record

- Repository implementation commits: `4d22421a`, `ce07bd73`.
- Focused verification: 5 test files, 29 tests passed.
- Static verification: focused ESLint and `git diff --check` passed;
  `pnpm run typecheck` completed without reported errors.
- Live Neon transaction: one canonical conversation, message, and event inside
  the transaction; message retry `existing`; event retry `duplicate`; delivery
  projected to `sent`; real cross-tenant reference rejected.
- Rollback proof: post-transaction counts were zero conversations, zero
  messages, and zero events for the smoke identifiers.
