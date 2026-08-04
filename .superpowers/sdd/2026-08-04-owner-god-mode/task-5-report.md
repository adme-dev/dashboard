# Task 5 — Execute Owner Actions Directly

## Status

DONE_WITH_CONCERNS

Active God mode now executes registered application write tools directly through one audited coordinator. The exact enabled mutation family is `POST /api/agency/ai/chat/conversations/:id/messages`; Task 3 continues to deny every other owner mutation route. Ordinary users retain the existing proposal and confirmation path unchanged.

The implementation is complete and verified locally. Migration 347 could not be applied from this isolated worktree because it has neither an `.env` file nor a `DATABASE_URL`; no database was modified. This is the sole concern.

## Execution contract

The direct-write sequence is:

1. `requireAuth()` derives the actor, then the fresh Task 2 authority resolver must return active, actor-matched, non-emergency-disabled God mode.
2. A durable application-ledger row is claimed from a stable persisted message ID plus SDK tool-call ID.
3. A tool-specific immutable attempt is committed before schema validation, scope validation, proposal preparation, or mutation dispatch.
4. Server-owned Zod schema and tenant/client/assignment boundaries are revalidated.
5. The existing registered executor performs the mutation using the server-resolved pending payload; caller-supplied actor/role/email values are never authority.
6. Exactly one immutable terminal outcome and one bounded ledger state are recorded. A succeeded replay returns only the recorded result reference; failed, in-progress, and ambiguous keys never repeat the action.

Task 4 route-level attempt/bypass evidence remains mandatory before the Task 5 coordinator can be reached. Read tools use an audited read coordinator without entering the mutation ledger.

## Durability classification

All 18 registered executors now declare a durability class.

`local-transactional` (3):

- `propose_knowledge_article`
- `propose_team_memory`
- `link_social_conversation_task`

These executors receive the coordinator's Postgres transaction. Proposal claim, local mutation, proposal completion, success terminal, and ledger success commit or roll back together.

`internal-http` (15):

- `create_task`
- `propose_schedule_post`
- `propose_budget_alert`
- `propose_budget_change`
- `assign_task`
- `propose_status_change`
- `propose_brief_convert`
- `propose_opportunity`
- `log_crm_activity`
- `propose_quote`
- `propose_expense_approval`
- `propose_eom_generate`
- `propose_expense_classify`
- `propose_proof_status`
- `create_social_case_task`

These executors are protected by a durable pre-dispatch ledger claim and are never passed a fake database transaction. No current registered executor talks directly to an external provider, so `external-provider` is defined but presently unused. Provider-capable executors can receive the same stable idempotency key when one is added.

## Reconciliation and Queue fallback

- Internal-HTTP/provider success followed by terminal persistence failure stores a bounded `ambiguous` result and sends the terminal through the strict direct Cloudflare Queue producer. That producer intentionally bypasses the ordinary DB job ledger.
- Queue delivery is at-least-once: an existing immutable terminal is treated as success; malformed payloads and other persistence failures throw for retry/DLQ visibility.
- The reconciliation worker scans at most 25 stale rows by default (hard cap 100), checks for an existing terminal first, and performs lookup-only reconciliation. It never redispatches the action.
- Unknown outcomes remain blocked and alertable.
- `/api/cron/god-mode-reconciliation` fails closed unless `CRON_SECRET` is defined and exactly matches `x-cron-secret`.
- The route was added to the existing `*/5 * * * *` pages-cron schedule without changing any existing routes or schedules.

## Ordinary confirmation behavior

Executor lookup, permission recheck, rich-confirm gating, atomic claim, result mapping, and legacy action audit were centralized in `executeRegisteredPendingAction()`. The existing confirmation endpoint delegates to it and preserves the backward-compatible `{ taskId, resultRef }` success response. God-mode coordination does not weaken or reuse the ordinary human-confirm policy.

## TDD evidence

### RED

The direct-execution and reconciliation tests were created before implementation. Their initial run failed because the coordinator and reconciliation modules did not exist while the three existing focused files remained green (28 tests). Subsequent focused RED runs proved the missing direct SDK routing, shared ordinary confirmation behavior, exact chat-family registration, and sanitized duplicate-correlation failure before each production change was made.

### Final GREEN

Focused Task 5 plus adjacent catalog/confirmation/executor suite:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run \
  test/ai/godModeDirectExecution.test.ts \
  test/ai/godModeReconciliation.test.ts \
  test/ai/godModeCatalog.test.ts \
  test/ai/toolLoop.test.ts \
  test/ai/pendingActions.test.ts \
  test/ai/executors.test.ts
```

Result: 8 files passed; 111 tests passed; 0 failed.

Combined Task 1–5 security and adjacent executor regression suite:

```text
21 files passed; 213 tests passed; 6 environment-gated tests skipped; 0 failed.
```

The repository-wide `pnpm run typecheck` retains the inherited project diagnostics. Filtering that complete run to every changed Task 5 source and test path produced no output, so there are no diagnostics in changed paths. `git diff --check` passed.

## Migration concern

Project policy requires applying every migration automatically. The exact isolated Task 5 worktree reported:

```text
.env absent
DATABASE_URL absent
```

Migration `server/database/migrations/347_god_mode_execution_reconciliation.sql` therefore remains unapplied. Once the controller provides the approved database connection, run:

```bash
export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/347_god_mode_execution_reconciliation.sql
```

## Self-review

- Re-read every modified and new file and reviewed the complete final diff.
- Confirmed all server imports use `~~/`; no frontend-only module enters Nitro.
- Confirmed no form or UI surface was changed.
- Confirmed actor authority comes only from `requireAuth()` plus a fresh authority resolver.
- Confirmed tenant/client and assigned-client checks run after immutable attempt and before handler/executor dispatch.
- Confirmed stable identity is derived only from persisted message identity and SDK tool-call identity.
- Confirmed local DB writes use the supplied transaction and HTTP executors do not.
- Confirmed retries and reconciliation cannot repeat in-progress or ambiguous actions.
- Confirmed Queue fallback has no DB-ledger prerequisite and preserves retry/DLQ behavior.
- Confirmed no raw provider/database error, payload, prompt, credential, or secret is written to audit outcomes or returned to callers.
- Confirmed the mutation family is exact and all other owner mutation routes retain Task 3 denial.
- Confirmed existing cron schedules and routes remain present.

## Commit

- This atomic task commit — `feat(ai): execute owner actions directly`

## Fix round 1 — durable transport identity and ambiguous outcomes

### Findings addressed

1. Chat submissions now require an active God-mode caller to supply a UUID transport retry token. The token is generated before the first POST by every production chat-message caller and reused for one connection-level retry. Only its SHA-256 digest is stored, scoped by authenticated actor and owned conversation. The route transaction reserves one immutable submission and user-message UUID; a completed retry replays the persisted response, while processing, failed, or request-mismatched reuse fails closed. The message is inserted after history loading but before model/tool execution, preventing duplicate prompt content.
2. Provider SDK tool-call IDs no longer participate in mutation identity. Every write claims a persisted `(message_id, ordinal)` row containing the bounded tool name and canonical argument digest. The execution-ledger key derives from the immutable message and claim UUIDs. A nondeterministic rerun at the same ordinal fails closed; a matching rerun reaches the existing ledger result and cannot redispatch.
3. Internal-HTTP executor rejection, endpoint response loss, invalid post-response data, and proposal-completion failure are now conservatively `ambiguous` unless explicitly tagged as proven pre-dispatch. The returned reference is captured immediately. Migration 347 adds immutable attempt-bound `ambiguous` evidence that may later be followed by exactly one succeeded/failed terminal.
4. God-mode proposal rows are inserted as server-only `god_mode_preparation` records already bound to the execution key, then transactionally associated with the ledger before dispatch. They are excluded from reload rehydration and the ordinary confirm endpoint at both peek and claim. Preparation failures dismiss them; stale pre-dispatch reconciliation consumes them without dispatch. Ordinary proposal and success response shapes are unchanged.
5. `create_social_case_task` records `task_created` plus the task/conversation/client reference before attempting the link. A link or checkpoint failure carries a bounded ambiguous reference. Reconciliation verifies the existing task and conversation, then performs only an idempotent local link repair; it never calls the task-create endpoint. The ordinary confirmation path also keeps an ambiguous composite claimed and stores its bounded reference instead of re-offering a duplicate create.
6. Queue at-least-once duplicate acceptance now requires an exact bounded terminal identity match: phase, outcome, actor, correlation, channel, route/tool, session digest, tenant/client/entity scope, normalized controls, and emergency state. Any collision mismatch throws for retry/DLQ visibility and emits a bounded alert log.

### TDD evidence

The initial remediation RED run produced 14 intended failures across 6 files while 58 existing tests passed. The failures independently demonstrated double route execution after response loss/concurrent duplicate, provider tool-call identity use, falsely failed HTTP/bookkeeping outcomes, missing hidden-proposal association/dismissal, rehydrated God-mode preparations, lost social composite references, and Queue collision acceptance.

Additional RED cycles proved the missing client transport-retry contract, missing social link-only repair, manual confirmation of server-only preparation, and ordinary composite re-offer behavior before each production change.

Final verification:

- Focused Task 5 and schema suite: 9 files passed; 85 tests passed; 8 live-database tests skipped; 0 failed.
- Combined Task 1–5 security, route/concurrency, executor, schema, and inventory suite: 25 files passed; 240 tests passed; 8 live-database tests skipped; 0 failed.
- Repository-wide Nuxt typecheck retains the inherited baseline; filtering the complete final run to every changed path produced no diagnostics.
- `git diff --check`: passed.

### Migration review boundary

Migration 347 was extended in place because it remains unapplied. It now contains the chat-submission and tool-claim tables, server-only proposal binding/state, ledger proposal/phase/metadata, and immutable ambiguous evidence. Static migration tests pass; eight disposable-schema/live-database cases are environment-gated in this worktree. Per controller instruction, migration 347 was not applied during this fix round and must be disposable-schema reviewed before production application.

### Fix-round commit

- This scoped fix commit — `fix(ai): make owner action retries durable`
