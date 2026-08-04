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

## Fix round 2 — authority-safe replay, generic submissions, and atomic social cases

### Findings addressed

1. Persisted submission lookup now runs for every authenticated owner of the conversation before any new-turn rate or authority-dependent behavior. Completed submissions replay their bounded stored response and processing/failed/request-mismatched submissions fail closed. A retry of a turn created in active God mode therefore never re-enters the model or tools after an owner downgrade or emergency disable. Only a new active-owner turn is recorded with `execution_mode = 'god_mode'`; all other new authenticated turns are recorded as `ordinary`.
2. Submission durability is now generic rather than God-mode-only. Every production chat caller already creates a UUID before its first POST; the route now claims a single actor+conversation+token row, reserves one persisted user-message ID, completes one bounded response, and replays it for ordinary users as well. Route concurrency tests invoke the production claim/lookup/completion SQL through a serialized transactional seam that enforces the advisory-lock and unique-key decisions instead of replacing the claim with an in-memory route fake.
3. `create_social_case_task` is now `local-transactional`. Task insertion, creation activity, conversation row lock, native link, and native-link event commit or roll back in one server-owned Postgres transaction. The same executor is used by ordinary confirmation and God-mode direct execution; God mode supplies its existing ledger transaction while ordinary confirmation opens the transaction in the executor. Progress-checkpoint failure can no longer split the operation, link failure leaves no task, and a subsequent confirmation retry commits exactly one linked task. Legacy reconciliation remains link-only and refuses to infer success from a task ID without the durable conversation/link metadata; it never calls the task-create endpoint.
4. Migration 347 now binds every ambiguous or terminal insert to the exact immutable attempt identity: actor, correlation, session digest, channel, route/tool, null-safe tenant/client/entity scope, normalized attempt-plus-bypass controls, and emergency state. Direct execution freezes its attempt identity before later scope resolution so its terminal is admissible under the same exact guard. The generic submission table also records bounded `ordinary`/`god_mode` execution mode.

### TDD evidence

RED cycles were observed before each production change:

- Route durability: 4 intended failures out of 7 tests for active-to-downgraded replay, active-to-disabled replay, ordinary response-loss replay, and ordinary concurrent duplicate execution.
- Atomic social case: 2 intended failures out of 2 tests because checkpoint failure produced ambiguity and no atomic create+link service existed.
- Reconciliation: 1 intended failure because a social task reference without link metadata could still be treated as success.
- Exact audit producer identity: 1 intended failure because later scope resolution changed terminal tenant/client scope relative to the immutable attempt.
- Migration structure: 1 intended static failure because generic submission execution mode was absent; ten disposable-schema cases were environment-gated.

Final verification:

- Focused route, concurrency, direct execution, social atomicity, reconciliation, ordinary pending actions, catalog, and schema suite: 8 files passed; 90 tests passed; 10 live-database cases skipped; 0 failed.
- Combined Task 1–5 security, audit, route/concurrency, ordinary confirmation, executor, inventory, and schema suite: 24 files passed; 240 tests passed; 10 live-database cases skipped; 0 failed.
- Full Node 24 Nuxt typecheck retains the inherited repository baseline. Filtering the complete output to all eleven changed source/test paths produced no diagnostics.
- `git diff --check`: passed before report append; it is rerun at the final commit boundary.

### Migration review boundary

Migration 347 remains unapplied per controller instruction. The disposable-schema suite now includes separate ambiguous and succeeded cases that reject mismatched actor, session digest, channel, route/tool, tenant, client, entity type, entity ID, normalized controls, and emergency state, then accept the exact identity. Those ten live-database cases remain skipped because `GOD_MODE_AUDIT_TEST_DATABASE_URL` is unavailable in this worktree; static migration checks and all non-database regressions pass.

### Fix-round commit

- This scoped fix commit — `fix(ai): make chat retries authority safe`

## Fix round 3 — replay-first ordering, immutable reconciliation identity, and creator auto-watch

### Findings addressed

1. The message route now performs only authentication, bounded body/token validation, and an independent conversation-ownership check before looking up the persisted actor+conversation+token submission. Completed responses replay and processing/failed/token-conflicting rows fail closed before the fresh God-mode resolver, rate policy, new submission claim, model, or tools are reached. Only a lookup miss resolves current authority and selects the new turn's `ordinary`/`god_mode` execution mode.
2. Reconciliation now loads the immutable `attempt` audit row by correlation before provider lookup or link repair. It verifies the ledger's stable actor/correlation/session/channel/route identity, while deliberately allowing mutable operational tenant/client scope to differ. The provider lookup still receives the ledger scope; the immutable terminal is constructed exclusively from the attempt's actor, session, channel, route, tenant/client/entity scope, controls, and emergency state. Missing or conflicting attempts are alertable failures and cannot cause lookup, mutation repair, or terminal append.
3. The shared atomic social-case service once again auto-watches the creating user when their `auto_subscribe_on_participation` preference permits it. The standard subscription utility now exposes the same preference check and idempotent insert through a caller-supplied Postgres transaction. Ordinary confirmation uses the service-owned transaction and God mode supplies its ledger transaction, so task, activity, subscription, conversation link, and native-link event commit or roll back together.

### TDD evidence

RED was observed before production changes:

- Replay ordering: 5 intended failures out of 10 tests. Downgraded, emergency-disabled, and resolver-error completed retries still invoked authority; persisted processing/failed rows also reached authority instead of blocking first.
- Reconciliation identity: 3 intended failures out of 13 tests. An inferred ledger client leaked into terminal identity, while missing and conflicting attempts still allowed provider lookup and terminal append.
- Creator auto-watch: 1 intended failure out of 2 tests. A successfully linked social task committed without the creator's standard item subscription.

Focused GREEN after implementation: 3 files passed; 26 tests passed; 0 failed. This includes ordinary transaction rollback, exact-one retry, preference-based subscription insert, and the supplied God-mode transaction path.

Combined Task 1–5 security/audit, route/concurrency, ordinary confirmation, executor, schema, subscription-adjacent, and inventory verification: 26 files passed; 256 tests passed; 10 live-database cases skipped; 0 failed.

The final Node 24 Nuxt typecheck retains the inherited repository baseline; filtering its complete output to every changed production and test path produced no diagnostics. `git diff --check` passed.

### Migration review boundary

Migration 347 is unchanged in this round and remains unapplied per controller instruction. Reconciliation now emits terminals from the immutable attempt identity required by its existing exact insert guard; operational ledger scope is retained only for bounded outcome lookup.

### Fix-round commit

- This scoped fix commit — `fix(ai): replay chat submissions before policy`

## Fix round 4 — deterministic disposable-Neon identity matrix

### Diagnosis and harness fix

The controller's live disposable-Neon RED run passed 11 of 13 cases. The `ambiguous` identity row exceeded Vitest's default five-second timeout while a network-backed query still owned the suite-level `pg.Client`. Vitest then ran the suite `afterEach` rollback against that executing client, producing the `client.query() when client already executing` warning. The following `succeeded` row began on the same overlapping/aborted transaction and failed with `current transaction is aborted`. This is a test-lifecycle failure, not evidence of a migration defect.

The database regression suite is now explicitly sequential. Each `ambiguous` and `succeeded` identity row is also explicitly sequential and owns a fresh client plus transaction instead of using the suite-level client. Every expected rejected insert resets its savepoint from `finally`; the row transaction is rolled back and its client closed from an outer `finally`. Both real network-backed rows have a 60-second Vitest timeout. The matrix still independently rejects mismatched actor, session digest, channel, route/tool, tenant, client, entity type, entity ID, controls, and emergency state before accepting the exact attempt identity.

### Verification boundary

- Focused local migration suite: 3 static tests passed; 10 environment-gated live tests skipped; 0 failed.
- Combined Task 1–5 verification: 26 files passed; 256 tests passed; 10 environment-gated live tests skipped; 0 failed.
- Full Node 24 Nuxt typecheck retains the inherited repository baseline; the complete log contains no diagnostic for `test/config/godModeAuditMigration.test.ts` or this report.
- Live rerun remains controller-owned because `GOD_MODE_AUDIT_TEST_DATABASE_URL` is unset in this worktree. Exact command:
  `GOD_MODE_AUDIT_TEST_DATABASE_URL="$DISPOSABLE_NEON_DATABASE_URL" pnpm exec vitest run test/config/godModeAuditMigration.test.ts --reporter=verbose`
- Migration 347 is unchanged and remains unapplied.

### Fix-round commit

- This scoped fix commit — `test(ai): isolate live audit identity cases`

## Controller database verification

- The deterministic disposable-Neon suite passed 13/13 in 91.18 seconds with no overlapping-client warning.
- Migration 347 was applied to the configured Neon database and reapplied successfully to prove idempotency.
- Live verification confirmed `ai_chat_submissions`, `god_mode_tool_call_claims`, and `god_mode_execution_ledger`; their uniqueness/check/foreign-key constraints; hidden God-mode proposal state; the ambiguous audit index; and the exact immutable audit guard functions.
