# Task 12 Report — Confirmed CRM Search Provider Lifecycle

## Result

- Status: `DONE_WITH_CONCERNS`.
- Intended commit: `feat(crm-search): add confirmed indexing lifecycle`.
- Scope: the Task 12 provider, processor, reconciliation, backfill, teardown, dead-letter, and reconciliation-cron modules and tests; the bounded Task 9 process/dead-letter default wiring; and the approved normalized provider-attempt repair in migration 350 plus the Task 8 operation/usage repositories and their tests.
- Concurrent Task 13 search, retrieval, ranking, candidate, join-back, shadow, and public-endpoint changes were not modified or staged.
- No provider call, external/shared database access, network request, Cloudflare/Neon resource mutation, deployment, or production migration was performed.

The remaining concern is an explicit integration dependency: exact BGE tokenization is accepted only through the pinned `CrmSearchExactTokenizer` contract. No word/byte estimate is represented as exact tokenization, and no tokenizer asset was downloaded. Upserts fail closed before provider admission when the exact tokenizer is unavailable; deletes remain independently processable.

## Implemented Lifecycle Contracts

- `provider.ts` resolves only the exact `AI` and `CRM_SEARCH_VECTORIZE` bindings, pins `@cf/baai/bge-base-en-v1.5`, `cls` pooling, one document, and exactly 768 finite dimensions, and projects only the canonical ID, namespace, values, and five allowlisted routing/confirmation metadata fields. Provider errors are reduced to bounded internal classes.
- Provider readiness requires exactly the `entityType` and `schemaVersion` string metadata indexes plus a non-CRM sentinel upsert, exact read, filtered namespace query, delete, and exact absence confirmation. Mutation acceptance never claims confirmation.
- `processor.ts` follows claim/lease, fresh shared-lock context, supersession/document check, per-call reservation, sent CAS, provider call, acceptance/ambiguity, and reconciliation-only confirmation. It re-runs durable usage authority immediately before Workers AI and Vectorize. Deletes never call Workers AI.
- Every provider call has a distinct durable normalized attempt linked one-to-one and `ON DELETE RESTRICT` to its usage reservation. Query and indexing attempts have disjoint identities; Workers AI embedding and Vectorize query/mutation calls cannot collide under one correlation/operation.
- Provider attempts begin only as `precommitted`, stamp `sent` by exact correlation/revision or operation/lease CAS, and terminate as released, settled, accepted, or ambiguous with immutable identity/evidence. Accepted state is restricted to Vectorize upsert/delete mutations; query attempts cannot forge mutation acceptance.
- An ambiguous Workers AI send is never replayed because the provider exposes no safe lookup/idempotency contract. It remains conservatively charged for operational recovery. An ambiguous Vectorize mutation is never blindly resubmitted; reconciliation performs an exact read and converges only from matching metadata or exact absence.
- `recordCrmSearchProviderAcceptance` atomically advances the sent attempt, admitted operation, and exact document ledger to provider-pending state. Reconciliation alone advances provider-pending documents and operations to confirmed state by lease/revision CAS.
- `usageRepository.ts` retains Task 8's shared advisory fence, fresh action/surface/lifecycle authority, exact server-derived `BigInt` pricing, active immutable rate-card revision, independent global/client budgets, full 512-token Workers AI charging, and durable teardown cap evidence. It now precommits, reloads, settles, or releases the linked provider attempt in the same non-retry transaction as usage accounting.
- `reconciliation.ts` claims bounded exact document/operation pairs, discards returned vector values, confirms only canonical ID/namespace/schema/revision/key/tag or exact absence, applies bounded retry/dead-letter policy, and keeps provider-confirmation dead letters disjoint from Cloudflare transport dead letters.
- `backfill.ts` schedules bounded candidate-only operations only with fresh policy revision, exact approval, ready metadata/sentinel evidence, canonical namespace, proven capacity, and no prior retiring schema.
- `teardown.ts` schedules every snapshotted active/candidate/retiring vector after ordinary client/policy loss under enabled or delete-only global authority. Namespace reuse remains blocked until every exact provider absence is durable.
- `deadLetters.ts` persists Cloudflare delivery exhaustion with an allowlisted error class, preserves one immutable origin per operation, and permits only the origin-specific audited recovery action.
- The reconciliation cron uses an exact bounded credential with SHA-256/timing-safe comparison, a fixed 25-item pass, generic failures, and a fresh count-only response. Task 9's signed process and dead-letter endpoints now consume the Task 12 defaults while preserving their existing authentication, byte bounds, replay projection, and privacy-safe logging.

## Provider-Attempt Schema Repair

Task 12 exposed a cross-task durability gap: a single operation/correlation reservation identity could not independently pre-admit and reload both Workers AI and Vectorize calls. With explicit parent approval, migration 350 gained `crm_search_provider_attempts` rather than overloading the operation identity.

- `usage_kind='indexing'` attempts bind operation, provider, sequence, immutable control/policy/lease evidence, and one reservation.
- `usage_kind='query'` attempts bind correlation, provider, sequence, immutable control/policy evidence, and one reservation, allowing Task 13 to reserve Workers AI and Vectorize independently.
- Trigger-backed state transitions, insertion guards, terminal immutability, provider/action/usage compatibility, partial unique identities, and runtime ACLs are enforced in PostgreSQL.
- The pre-production migration remains idempotent, and migrations 350–352 still apply/reapply together on PostgreSQL 14.

## Source-Driven Contracts

Only official Cloudflare documentation was consulted, read-only:

- Workers AI BGE model/pooling/input/output contract: https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/
- Vectorize mutation identifiers and asynchronous mutation behavior: https://developers.cloudflare.com/changelog/product-group/developer-platform/18/
- Pages/Workers runtime bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Workers AI plus Vectorize usage shape: https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-retrieval-augmented-generation-ai/
- Queue message lifecycle and consumer semantics: https://developers.cloudflare.com/queues/configuration/javascript-apis/
- Wrangler binding/configuration contract: https://developers.cloudflare.com/workers/wrangler/configuration/
- Pull-consumer distinction used to avoid inventing a consumer API: https://developers.cloudflare.com/queues/configuration/pull-consumers/

No documentation lookup caused provider, queue, resource, or deployment mutation.

## Strict TDD Evidence

### Initial RED

The seven lifecycle suites were written before implementation. The initial command failed at module resolution for the absent provider, processor, reconciliation, backfill, teardown, dead-letter, and cron modules, collecting no passing lifecycle tests.

### Incremental RED→GREEN

Incremental slices established the provider shape, ordered per-call admission, kill-switch reread, schema/source supersession, delete conversion, exact confirmation/absence, candidate isolation, post-policy-loss teardown, dead-letter origin separation, and cron boundary. Fresh failing tests then reproduced and closed:

- absent durable provider-attempt identities for distinct Workers AI and Vectorize calls;
- illegal operation-transition shortcuts and missing lease/revision sent CAS;
- query attempt collisions under one correlation;
- blind replay after Workers AI or Vectorize ambiguity;
- reservation leakage when a pre-call admission/lease CAS loses;
- missing runtime-role/trigger coverage for attempt insertion, sent transition, terminal immutability, and query mutation forgery; and
- accepted-state compatibility that was initially broad enough to include a Vectorize query.

Final bounded behavior gate:

```text
PASS: 12 files, 143 tests; 1 guarded PostgreSQL case skipped without its opt-in DSN
```

## PostgreSQL 14 Runtime Evidence

A fresh isolated PostgreSQL 14.19 cluster under `/private/tmp` listened only on credential-free private Unix sockets. The test guards rejected generic/remote/shared targets. No application `.env` or external database was used.

```text
Task 8/12 operation, runtime-role, trigger, provider-attempt suite: 17/17 passed
Migrations 350–352 apply/reapply/concurrency compatibility:          9/9 passed
```

The live cases cover legal pending-transport/queued/processing flow, indexing/query precommit and sent CAS, immutable attempt identity, terminal evidence, rejection of forged terminal insertion, rejection of query mutation acceptance, narrow runtime completion authority, and the shared/exclusive client advisory fence.

## Static, Type, and Deep-Review Evidence

- Node 24.18.0 ESLint over every owned TypeScript source/test file: exit 0.
- The targeted strict server TypeScript pass reports no diagnostic in an owned Task 12/repair file. Its only six diagnostics are the already documented imported `server/utils/db.ts` ambient `useEvent` and `PoolClient` transaction typing issues.
- `git diff --check` passes on the exact Task 12/repair scope.
- Every owned implementation/test was reread end-to-end; migration 350's complete changed sections were reread in their surrounding table, trigger, ACL, and idempotent-apply context. The final review checked server aliases, provider binding isolation, raw CRM/provider-error privacy, exact tokenizer fail-closed behavior, no external call in a retryable transaction, advisory-lock order, authority rereads, legal operation/attempt transitions, lease/revision CAS, immutable rate-card/cost evidence, dual budgets, ambiguity handling, confirmation ownership, teardown independence, dead-letter origin separation, endpoint authentication/projection, and exclusion of concurrent Task 13 files.

## Remaining Integration Concerns

1. The deployment must inject the pinned exact tokenizer implementation into `event.context.crmSearchExactTokenizer`; without it, upsert processing intentionally fails closed before Workers AI. No approximate fallback is permitted.
2. Dedicated `AI`, `CRM_SEARCH_VECTORIZE`, service-keyring, cron-secret, queue, and confirmation-key bindings remain release-time responsibilities. This task validates exact names/shapes but creates or changes no Cloudflare resource.
3. The repository-wide Nuxt typecheck retains unrelated baseline diagnostics; the stricter targeted pass is clean for every owned file.

## Acceptance Review Repair — Provider Lifecycle Fences

- Status: `DONE_WITH_CONCERNS`; the remaining concerns above are release-time integration responsibilities, not acceptance defects.
- Repair commit: `fix(crm-search): fence provider lifecycle transitions`.
- Each Workers AI or Vectorize call now runs inside its own non-retryable outer guard transaction. That transaction acquires the canonical shared client advisory lock and fresh global-control, client-policy, schema, and applicable teardown authority, then holds them continuously until the provider callback and its durable settlement finish. Attempt precommit/reservation, sent evidence, operation admission, acceptance, and settlement remain separate committing transactions.
- A source-missing, source-deleted, or source-moved upsert is CAS-converted durably to `delete`—including clearing its content hash and confirmation evidence—before any delete reservation. Vectorize acceptance now CAS-matches the persisted operation action and attempt action.
- A Workers AI error after sent evidence is durably marked ambiguous and conservatively charged. A later claim detects sent/ambiguous evidence before any provider work, settles it idempotently, and returns retryable without replaying the ambiguous call.
- Readiness now bounded-polls exact sentinel visibility, filtered-query visibility, and exact post-delete absence. Poll attempts and delay are validated and bounded.

### Repair RED→GREEN Evidence

Strict RED-first tests independently reproduced all four findings: immediate sentinel reads failed under delayed visibility; delete conversion was absent and then not invoked before admission; post-sent Workers AI failures were not ambiguous; and provider calls ran without a continuously held authority guard. A mutation check that bypassed the authority reread failed the focused guard regression before the implementation was restored.

Final evidence after the repair:

```text
Bounded Task 12 unit/API gate:                              147 passed, 1 guarded PostgreSQL case skipped
Migration static gate:                                      53 passed, 1 guarded PostgreSQL case skipped
Task 8/12 PostgreSQL 14 lifecycle/race/evidence gate:        18/18 passed
Migrations 350–352 PostgreSQL 14 apply/reapply gate:          9/9 passed
Node 24 ESLint over the eight repair source/test files:       exit 0
Strict server TypeScript owned-path diagnostic search:        0 diagnostics
git diff --check over the repair scope:                       exit 0
```

The live two-connection PostgreSQL test proves that candidate-promotion's exclusive client fence and a global halt update both block while a provider callback holds its shared advisory/row authority, then complete only after the callback releases. It also proves persisted upsert-to-delete conversion and a sent Workers AI attempt converging to `ambiguous` plus a `charged` failed reservation with the expected token and USD-micro accounting evidence.

All repair validation used disposable local PostgreSQL 14 clusters under `/private/tmp`. No external database, provider, network, Cloudflare resource, deployment, or production migration was touched. Concurrent Task 13 retrieval, ranking, analytics, shadow-search, and public search-route files remained outside the repair scope and staging set.

## Final Acceptance Repair — Source Authority at Provider Calls

- Repair commit: `fix(crm-search): revalidate source authority at provider calls`.
- This section supersedes the prior statement that every finalization occurs before its guard closes. The final contract holds source and policy authority continuously through the external provider call; Vectorize acceptance and usage settlement then apply exact durable CAS after the guard releases so they do not conflict with the intentionally locked document ledger.
- Every Workers AI and Vectorize guard now fresh-reads the exact claimed operation and locks it `FOR KEY SHARE`, validating organisation/client/entity/schema, source revision/event, desired action, namespace/content evidence, state, lease token, and lease generation. It also locks the exact dirty intent, current source row when present, and exact document ledger row `FOR SHARE`.
- The callback receives the locked fresh source/document/ledger snapshot. A newer same-client revision supersedes before a provider call; a delete or client move CAS-converts the operation and re-enters Vectorize under a fresh delete guard; an exact already-indexed ledger completes without a redundant call. Fresh document text, rather than the earlier context copy, supplies Workers AI.
- Reservation, operation admission, and sent evidence remain independently committed before provider dispatch while the outer guard is live. The operation admission path uses lock-compatible `FOR NO KEY UPDATE`; sent transition locks only the attempt while retaining exact operation lease/generation CAS.
- The only authorized migration change replaces the internal `crm_search_admit_operation` operation-row `FOR UPDATE` with `FOR NO KEY UPDATE`. All identity, state, revision, authorization-trigger, SECURITY DEFINER, search-path, and runtime privilege contracts remain unchanged.
- Provider readiness defaults to 40 attempts at 250 ms intervals, covering approximately 9.75 seconds per visibility phase. One sentinel upsert and one sentinel delete are issued; exact visibility, filtered-query visibility, and post-delete absence are polled without oscillating mutations. Tests retain an injected zero-delay clock.

### Final RED→GREEN and Lock Evidence

Four focused RED failures proved the missing behavior: the guard stopped after four policy reads, a pre-AI source revision still called Workers AI, an inter-call client move still issued a stale upsert, and readiness stopped after six polls. The first live PostgreSQL nested-connection attempt then produced an exact 10-second lock timeout inside `crm_search_admit_operation`; its internal `FOR UPDATE` conflicted with the outer `FOR KEY SHARE`. A static mutation test failed until the authorized lock mode changed to `FOR NO KEY UPDATE`.

Final evidence:

```text
Bounded Task 12 unit/API gate:                              150 passed, 1 guarded PostgreSQL case skipped
Migration static gate:                                      53 passed, 1 guarded PostgreSQL case skipped
Task 8/12 PostgreSQL 14 lifecycle/source-race gate:          18/18 passed
Migrations 350–352 PostgreSQL 14 apply/reapply gate:          9/9 passed
Strict server TypeScript owned-path diagnostic search:        0 diagnostics
```

The live two-connection test proves that source content update, soft delete, and client move are blocked across Workers AI and Vectorize windows; promotion and global halt remain blocked; and separate runtime-role operation admission plus sent-attempt/reservation transitions commit successfully beneath the live outer guard. All live tests used credential-free disposable PostgreSQL 14 clusters under `/private/tmp`. No provider, external database, network resource, deployment, or production migration was touched. Task 14 authorization/tool files remained outside this repair and its staging set.

## Final Indexing/Provider Acceptance Repair — Durable Convergence

- Intended commit: `fix(crm-search): converge indexing and teardown state`.
- Reconciliation now inventories current CRM source, dirty intent, document, operation, retirement, and exact provider state by organisation/client/entity/schema/revision. Exact provider evidence repairs the durable ledger directly; mismatches create only bounded idempotent operations for the normal queue path. Reconciliation never replays provider mutations inline.
- Vectorize admission rejects caller-supplied stored inventory. Under the existing client/rate-card/daily-ledger fences it derives current global/client live vector totals at 768 dimensions, prices the client total, and advances cumulative daily high-watermarks without allowing a later delete to erase prior budget evidence.
- Candidate promotion snapshots every old-active document into durable retirement work before returning. Retiring completion remains blocked until every snapshot is provider-confirmed absent. Terminal/missing retirement operations are repairable without a later CRM write.
- The production teardown scheduler claims exact pending/failed or terminally stranded vectors, creates delete operations under the client fence, records exact absence from reconciliation, advances parent progress, and finalizes the namespace only when every durable vector is absent.
- Workers AI BGE parsing accepts only the documented `{ data, shape?, pooling? }` response, requires optional shape `[1, 768]`, optional pooling `cls`, and exactly 768 finite floats. See the official model contract: https://developers.cloudflare.com/ai/models/%40cf/baai/bge-base-en-v1.5/.
- A malformed Cloudflare DLQ envelope is never acknowledged until the Worker sends a canonical HMAC-signed, identifier-digest-only record to Pages and the new durable table accepts it. Persistence failure retries; raw bodies, source text, provider details, and secrets are structurally absent. This preserves Cloudflare Queues' explicit retry/DLQ semantics: https://developers.cloudflare.com/queues/configuration/batching-retries/ and https://developers.cloudflare.com/queues/configuration/dead-letter-queues/.

Strict RED first produced 8 intended failures across 7 suites (116 existing passes). The final owned gate passed 10 files / 141 tests before the additional production-persistence assertions; the bounded Task 8/11/12 consumer and migration compatibility gate passed 38 files / 443 tests with 2 guarded local-PostgreSQL skips. Node 24 ESLint, the full Nuxt typecheck, Worker TypeScript generation/check, Worker deploy dry-run, and scoped `git diff --check` passed. The Task 13 compatibility rerun passed 152 tests across 5 files and exposed two unowned current-HEAD issues: a retrieval fixture still expects 500 ms while fresh elapsed-budget enforcement supplies 499 ms, and the broad caller scanner exceeded its existing 5-second timeout under parallel load. Neither Task 13 source nor its tests were modified by this repair.

No external database, provider, network, Queue, Cloudflare resource, deployment, or production migration was contacted or mutated. Migration testing remained static/guarded because no explicitly isolated local PostgreSQL harness was active.
