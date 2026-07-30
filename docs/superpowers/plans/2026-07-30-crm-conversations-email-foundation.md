# CRM Conversations and Email Gateway Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the additive, tenant-safe database and TypeScript contracts required for threaded CRM email without enabling inbound or outbound production behavior.

**Architecture:** Neon stores canonical conversations, messages, lifecycle events, attachments, reply routes, sender identities, and compatibility credential metadata. Focused pure TypeScript contracts define canonical delivery states and monotonic projection rules. Existing lead capture, `crm_communications`, Resend marketing, and the current Email Worker remain unchanged in this slice.

**Tech Stack:** Nuxt 4, Nitro, TypeScript, Vitest, Neon PostgreSQL, Cloudflare Email Service contracts

## Global Constraints

- All tables and unique constraints are tenant-scoped.
- Migrations are additive, idempotent, and executed twice against configured Neon.
- New production behavior is disabled; this slice adds no route, Worker binding, Queue binding, or UI.
- Provider payloads never become frontend or persistence contracts.
- Direct Cloudflare account API tokens are never client credentials.
- Existing `crm_communications` rows and bridges are not rewritten.
- Server imports use the `~~/server/` alias.
- `DATABASE_URL` in `.env` points to production; inspect every statement before execution.

---

## File structure

- `server/database/migrations/288-crm-conversations-email-foundation.sql` — additive canonical relational schema and constraints.
- `server/utils/crm/emailContracts.ts` — provider-neutral message/delivery types and pure monotonic state projection.
- `test/config/crmConversationsEmailMigration.test.ts` — executable migration contract.
- `test/server/utils/crm/emailContracts.test.ts` — pure contract/state-transition tests.
- `docs/prd/crm-conversations-email-gateway-prd.md` — product source of truth and checkbox ledger.

### Task 1: Migration contract and canonical schema

**Files:**

- Create: `test/config/crmConversationsEmailMigration.test.ts`
- Create: `server/database/migrations/288-crm-conversations-email-foundation.sql`

**Interfaces:**

- Produces tables `crm_conversations`, `crm_messages`, `crm_message_events`,
  `crm_message_attachments`, `crm_email_routes`, `crm_email_sender_identities`,
  and `crm_email_credentials`.
- Produces enum-like check constraints using text values documented in the PRD.
- Produces unique keys `(client_id, provider, provider_message_id)` and
  `(client_id, provider, provider_event_id)` where external identifiers are
  present.

- [ ] **Step 1: Write the failing migration contract test**

Create a Vitest test that reads the exact migration path and asserts:

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_conversations')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_messages')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_message_events')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_message_attachments')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_email_routes')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_email_sender_identities')
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_email_credentials')
expect(sql).toMatch(/UNIQUE INDEX[\s\S]+client_id[\s\S]+provider_message_id/i)
expect(sql).toMatch(/CHECK \(delivery_status IN \('draft','queued','sending','sent','delivered','deferred','bounced','failed','rejected','complained','cancelled'\)\)/)
expect(sql).not.toMatch(/api[_ ]?token|cloudflare[_ ]?token/i)
```

- [ ] **Step 2: Run the test and observe the expected failure**

Run:

```bash
pnpm exec vitest run test/config/crmConversationsEmailMigration.test.ts
```

Expected: failure because the migration file does not exist.

- [ ] **Step 3: Implement the additive migration**

Define UUID primary keys, `client_id` foreign keys to `agency_clients(id)`,
timestamps, checks, and indexes. Store email address arrays as JSONB, threading
references as `TEXT[]`, provider payload summaries as sanitised JSONB, and
secret material only through `token_hash` or `secret_hash`. Use
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and guarded
constraints so execution is repeatable.

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm exec vitest run test/config/crmConversationsEmailMigration.test.ts
```

Expected: all assertions pass.

- [ ] **Step 5: Inspect and apply the migration**

Read the full SQL file, then run:

```bash
export DATABASE_URL=$(grep DATABASE_URL /Users/paulgiurin/Documents/Projects/dashboard/.env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/288-crm-conversations-email-foundation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/288-crm-conversations-email-foundation.sql
```

Expected: both executions succeed.

- [ ] **Step 6: Verify live catalog constraints**

Run a read-only catalog query proving all seven tables, the delivery constraint,
and tenant/provider idempotency indexes exist.

- [ ] **Step 7: Commit**

```bash
git add test/config/crmConversationsEmailMigration.test.ts server/database/migrations/288-crm-conversations-email-foundation.sql
git commit -m "feat(crm): add conversation email data foundation"
```

### Task 2: Provider-neutral message contracts

**Files:**

- Create: `test/server/utils/crm/emailContracts.test.ts`
- Create: `server/utils/crm/emailContracts.ts`

**Interfaces:**

- Produces `CRM_EMAIL_DELIVERY_STATES`, `CrmEmailDeliveryState`,
  `CrmEmailDirection`, `CrmEmailParticipant`, `CrmEmailEnvelope`, and
  `projectEmailDeliveryState(current, incoming)`.
- `projectEmailDeliveryState` returns `{ state, changed }` and never regresses a
  terminal negative state or `delivered`.

- [ ] **Step 1: Write failing delivery-contract tests**

Cover:

```ts
expect(projectEmailDeliveryState('queued', 'sending')).toEqual({ state: 'sending', changed: true })
expect(projectEmailDeliveryState('sent', 'delivered')).toEqual({ state: 'delivered', changed: true })
expect(projectEmailDeliveryState('delivered', 'deferred')).toEqual({ state: 'delivered', changed: false })
expect(projectEmailDeliveryState('bounced', 'delivered')).toEqual({ state: 'bounced', changed: false })
expect(projectEmailDeliveryState('failed', 'failed')).toEqual({ state: 'failed', changed: false })
```

Also prove the exported state list exactly matches the SQL check values.

- [ ] **Step 2: Run the test and observe the expected failure**

Run:

```bash
pnpm exec vitest run test/server/utils/crm/emailContracts.test.ts
```

Expected: module resolution failure because `emailContracts.ts` does not exist.

- [ ] **Step 3: Implement the minimal contracts**

Use an `as const` state tuple and an explicit state-rank record. Treat
`delivered`, `bounced`, `failed`, `rejected`, `complained`, and `cancelled` as
terminal. Do not add provider-specific fields.

- [ ] **Step 4: Run focused and existing CRM tests**

Run:

```bash
pnpm exec vitest run test/server/utils/crm/emailContracts.test.ts test/crm/comms.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add test/server/utils/crm/emailContracts.test.ts server/utils/crm/emailContracts.ts
git commit -m "feat(crm): define canonical email delivery contracts"
```

### Task 3: Documentation ledger and slice verification

**Files:**

- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify: `docs/superpowers/specs/2026-07-30-crm-conversations-email-gateway-design.md`
- Modify: `docs/superpowers/plans/2026-07-30-crm-conversations-email-foundation.md`

**Interfaces:**

- Consumes the exact verification evidence from Tasks 1 and 2.
- Produces the resumable implementation state for the next session.

- [ ] **Step 1: Perform the pre-commit deep-dive review**

Re-read every changed file. Verify:

- no server alias mismatch,
- no empty select values or UI duplication (no UI is expected),
- no secret or Cloudflare account token column,
- every idempotency key includes `client_id`,
- all foreign-key delete behavior is intentional,
- provider payload JSON is not treated as canonical data,
- migration syntax and constraints match TypeScript states.

- [ ] **Step 2: Run focused verification**

```bash
pnpm exec vitest run test/config/crmConversationsEmailMigration.test.ts test/server/utils/crm/emailContracts.test.ts test/crm/comms.test.ts
git diff --check
```

Expected: all tests pass and no whitespace errors are reported.

- [ ] **Step 3: Update the PRD ledger**

Check off A1 and A2 only after their database and test evidence is complete.
Append the migration executions, live catalog proof, test totals, commit hashes,
and any baseline limitation to the progress log.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/prd/crm-conversations-email-gateway-prd.md docs/superpowers/specs/2026-07-30-crm-conversations-email-gateway-design.md docs/superpowers/plans/2026-07-30-crm-conversations-email-foundation.md
git commit -m "docs(crm): add conversations email implementation ledger"
```

## Plan self-review

- Spec coverage: Tasks 1 and 2 cover only Phase A1-A2, intentionally leaving
  routes, Workers, Queues, UI, credentials, and AI disabled.
- Placeholder scan: no placeholders or implied implementation steps remain.
- Type consistency: SQL and TypeScript use the same 11 canonical delivery
  states and the same provider/idempotency terminology.
- Rollback: the migration is additive; rollback is disabling future feature
  flags and leaving unused tables in place until an explicitly reviewed cleanup.

