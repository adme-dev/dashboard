# Task 8 Report — Durable CRM Search Repositories

## Result

- Status: `DONE_WITH_CONCERNS`.
- Intended commit: `feat(crm-search): add durable search repositories`.
- Scope: the ten Task 8 repository modules, eight repository suites, and this report only.
- No route, provider, queue, deployment, Cloudflare/Neon resource, network, migration, shared database, or production mutation was performed.

## Implemented Contracts

- `repository.ts` exposes the only repository dependencies: `queryOneFresh`, `queryRowsFresh`, and `transactionWithoutRetry`. It also owns strict canonical UUID/date/timestamp, bounded string/enum, digest, HMAC, safe-integer, affected-row, and monotonic-intent validation. No cached read helper is imported.
- `policyRepository.ts` performs fresh control/policy/schema/current-rate-card reads and resolves the most restrictive effective mode. Missing, malformed, revoked, expired, wrong-model, unready, or revision-incoherent evidence fails closed. Mutation admission locks the current authority rows; upserts require ready schema evidence, ordinary deletes remain independent of sentinel query readiness, and delete-only work may continue from the durable teardown snapshot after the ordinary policy row is gone, including partially confirmed resumptions.
- `sourceRepository.ts` claims bounded dirty rows with `FOR UPDATE SKIP LOCKED`, increments lease generation, and completes or releases them only by revision, event-sequence, claim-token, and generation CAS. Persisted errors are bounded redacted classes rather than provider bodies.
- `operationRepository.ts` serializes entity/schema intent, preserves an already admitted operation, coalesces only one replaceable successor, rejects mixed revision/event regressions, returns exact terminal work idempotently, claims with bounded leases, and requires lease/state CAS around both completion and the governed database admission function.
- `documentRepository.ts` separates explicit zero-high-watermark insert from monotonic update, rejects regression in either source watermark, and applies confirmation only when document ID, lease token/generation, expected state/revision, and provider mutation ID still match.
- `usageRepository.ts` locks current control/policy/rate-card authority plus global and client UTC-day ledgers in deterministic order. It validates both scopes' immutable caps, reserves calls/tokens/query/insert/stored dimensions and micro-USD independently, uses exact `BigInt` multiplication for the 512-token cap, requires exactly one full 512-token reservation per Workers AI attempt, charges once after send including late discard, releases only explicit no-call evidence, and rolls back unless both daily scopes settle.
- `teardownRepository.ts` authorizes provider deletion from the independent teardown/vector snapshot without consulting the deleted ordinary policy, allows only enabled/delete-only control and active teardown deletion states, claims bounded vector batches with `SKIP LOCKED`, and confirms provider absence only by teardown/vector/schema/state/mutation CAS.
- `namespaceRepository.ts` derives the namespace identity server-side, takes globally ordered advisory locks, detects cross-owner/digest/revision collisions, proves full active/candidate/retiring/sentinel/deletion-pending Vectorize inventory remains strictly below the pinned 80% ceilings, and permits deterministic reactivation only after provider-confirmed emptiness.
- `approvalRepository.ts` locks and validates exact approval type, environment, scope/client, revisions, implementation/artifact/pages/worker/binding/evidence digests, deployment link, schema/action, maximum cost, distinct actor, issuance/expiry, and absence of revocation or consumption in the same transition transaction.
- `telemetryRepository.ts` rejects non-allowlisted event/rank fields, raw queries, provider errors, unkeyed entity identifiers, unbounded counts/latencies, and unsafe JSONB evidence size before starting a transaction. It atomically writes structured HMAC-scoped events and low-cardinality bounded daily aggregates without query/correlation/actor identifiers in the aggregate.

## Behavioral TDD Evidence

### Initial RED

All eight repository suites were written before their implementation modules. The exact Task 8 command failed as intended: eight suites could not resolve the absent repository modules and no tests were collected.

### Incremental and adversarial RED→GREEN

Implementation proceeded repository-by-repository. The first consolidated green was 56/56 tests. Fresh failing regressions then pinned and repaired:

- exact approval revocation/consumption foreign-key joins;
- policy reads bound to current time, client, and pinned model;
- server-derived namespace ownership/collision evidence, global allocation locking, capacity ceilings, and confirmed-empty reactivation;
- operation source revision/event monotonicity and exact terminal idempotency;
- explicit document insert/update CAS and dual high-watermark monotonicity;
- exact one-call/512-token Workers AI reservation, exact token-cap arithmetic, current rate-card/daily-cap attribution, two-scope settlement, and UTC reservation time;
- privacy deletion independent of sentinel readiness and ordinary policy survival;
- resumed partially confirmed teardown deletion; and
- conservative PostgreSQL JSONB text-size enforcement before telemetry persistence.

Final owned repository gate:

```text
PASS: 8 files, 71 tests
```

Migration compatibility gate:

```text
PASS: 8 tests; 1 dedicated external-PostgreSQL integration test skipped without its opt-in DSN
```

## Static and Deep-Review Evidence

- Node 24.18.0 ESLint over all 18 owned source/test files: exit 0.
- Full Node 24 Nuxt typecheck completed and remains red on the repository's existing baseline diagnostics. It identified one Task 8 inference issue in `operationRepository.ts`; that issue was fixed.
- A targeted server TypeScript pass over all ten Task 8 modules reports zero Task 8-owned diagnostics. Its only six diagnostics are inherited from imported `server/utils/db.ts` (`useEvent` ambient resolution and existing `PoolClient`/transaction typing).
- The exact owned repository suites and migration compatibility suite were rerun after the final fixes and passed as recorded above.
- Every owned source and test file was reread end-to-end. The review covered server import aliases, fresh-vs-cached reads, lock order, bounded claims, revision/lease CAS, monotonic intent, post-admission coalescing, rate-card and dual-scope budget authority, exact 512-token charging, namespace collision/capacity/reactivation behavior, teardown survival, approval revocation/consumption, privacy field allowlists, JSONB sizing, and malformed-row fail-closed behavior.
- The final staged-scope, whitespace, cached-path, and secret checks are recorded in the commit handoff.

## Remaining Concerns

1. Repository-wide Nuxt typecheck is still red on unowned baseline diagnostics; the Task 8 modules have no owned diagnostic under the targeted server pass.
2. The guarded PostgreSQL integration portion of `crmSearchMigrationPostgres.test.ts` requires its dedicated opt-in DSN and was intentionally not run because Task 8 forbids external/shared database access. Its eight static/guard assertions passed.
3. These repositories deliberately perform no provider call, routing, queue processing, or rollout. Downstream orchestration must preserve their fresh-read, same-transaction authority and CAS boundaries.

---

## Review Round 1 — Authority and State-Machine Alignment

### Result

- Status: `DONE`.
- Commit target: `fix(crm-search): align repository authority contracts`.
- Scope: migration 350's pre-production runtime surface; Task 8 operation, policy, source, and usage repositories; their focused tests; the migration 350 static contract; and this report. Task 6, Task 9, Task 10, routes, providers, queues, deployment, network, and external/shared databases were not modified or contacted.

### Strict TDD Evidence

The five combined-review findings were first captured in one consolidated RED run: 17 failures, 86 passes, and one guarded PostgreSQL test skipped. A credential-free local PostgreSQL 14.19 run then reproduced the actual migration trigger rejecting the illegal `pending_transport -> processing` transition.

Incremental GREEN slices closed:

1. legal `pending_transport -> queued -> processing` claims and legal retryable coalescing without resetting queued/processing work to pending transport;
2. one `SECURITY DEFINER` dirty-claim completion function with fixed `pg_catalog, pg_temp` search path, exact revision/event/token/generation CAS, PUBLIC revocation, runtime-only execute, and no runtime table DELETE;
3. the canonical shared client advisory fence before global, policy, schema, operation, and provider authority reads, including a live two-connection exclusive-promotion wait;
4. usage-kind/action/surface-aware query, indexing, and durable teardown authorization, with missing, malformed, downgraded, wrong-schema, wrong-operation, off-surface, revoked, or expired evidence failing closed; and
5. server-owned rate-card pricing using Task 7 exact `BigInt` ceiling arithmetic. Caller-controlled USD and revision inputs are rejected; the derived micro-USD amount, immutable rate-card ID, and immutable revision are persisted.

The final rate-card revision assertion was independently RED in both the repository and migration contracts before the schema/repository stamp was added.

### PostgreSQL 14 Behavioral Evidence

An isolated temporary cluster under `/private/tmp` was reachable only through a credential-free Unix socket. No generic `DATABASE_URL`, TCP endpoint, shared database, or external resource was used.

The live Task 8 case passed for trigger-backed operation transitions, processing-intent coalescing, direct runtime DELETE denial, successful narrow-function completion, and a two-connection shared/exclusive client advisory fence. The independent 350–352 compatibility case applied the migrations, exercised capture/runtime behavior and concurrency, and verified idempotent compatibility.

### Final Verification

```text
Task 8 repository + modified migration gate:  9 files, 104 passed
Migration 350–352 PostgreSQL 14 compatibility: 4 files, 53 passed
Node 24.18 Nuxt typecheck:                     passed
Node 24.18 ESLint on all modified TS files:    passed
git diff --check:                              passed
```

The final reread covered every modified repository, test, migration delta in context, and this report. The security pass rechecked fixed definer search paths and ownership, exact runtime function ACL, canonical advisory-lock order, row-lock scope, legal operation transitions, revision/lease CAS, teardown independence from deleted policy state, strict reservation shape, active-rate-card validity/revocation/model evidence, exact cost arithmetic, dual-scope caps, and the absence of caller-provided cost authority or provider/network side effects.
