# Task 11 Report — Publish Coalesced Index Operations

## Result

- Status: `DONE_WITH_CONCERNS`.
- Intended commit: `feat(crm-search): publish coalesced index operations`.
- Scope: the Task 11 dirty-expansion, publication, binding, publisher, repair-route, Pages producer/cron configuration, confirmation helper, focused tests, and this report only. Task 8's accepted `usageRepository.ts` surface and its tests were not modified.
- No provider, database, Queue, Cloudflare resource, network, migration, deployment, or production mutation was performed.

The remaining concerns are intentional rollout dependencies: an authorized workflow must provision and bind the dedicated queue and confirmation keyring; Task 12 must consume the confirmation helper while performing the provider mutation and reconciliation work. Missing bindings or authority keep publication fail-closed.

## Implemented Contracts

- `bindings.ts` resolves only `CRM_SEARCH_INDEX_QUEUE` and `CRM_SEARCH_CONFIRMATION_KEYRING`. The producer has only the identifier-message `send(..., { contentType: 'json' })` shape. A present-but-malformed deployed secret never falls back to process state, and there is no `JOBS_QUEUE`, `agency-jobs`, Vectorize, generic consumer, or provider fallback.
- `dirtyExpansionRepository.ts` claims bounded dirty sources with `FOR UPDATE SKIP LOCKED`, takes the accepted shared-client advisory lock before fresh global/policy/schema/namespace/source/ledger authority, and preserves one replaceable pre-admission operation through the Task 8 operation repository. Claim completion/release is exact revision/event/token/generation CAS.
- Expansion is bounded to eight schemas per source. Halted/off upserts are skipped; delete-only emits only deletion intent; active teardown evidence can authorize deletion independently of the ordinary policy row. Enabled-mode deletes cannot use stale/off-policy authority. Source regressions are released, newer source state supersedes an old dirty claim, and no provider call runs inline.
- Upsert operations contain deterministic namespace/vector identifiers, schema/source revision, the PostgreSQL projection content hash, and a confirmation tag/key version. They do not contain raw CRM source or projection text. Delete operations require no confirmation secret.
- `publicationRepository.ts` exposes a transport-only lease API distinct from processor claims. It claims only `pending_transport` operations under current global/policy/schema or teardown authority, increments only transport attempts, and uses exact lease/generation/state CAS to confirm `queued` or reschedule `pending_transport` with a bounded error class.
- `publisher.ts` validates and sends only the shared canonical protocol-v1 identifier envelope: `operationId`, `correlationId`, and `enqueuedAt`. Queue absence, send failure, or invalid publication evidence reschedules by CAS; success becomes queued only after the send resolves and confirm CAS succeeds. Dependency injection covers clock, UUIDs, expansion, transport claims/CAS, and the queue binding.
- `crm-search-index-repair.post.ts` uses an exact 256-byte-bounded cron credential, SHA-256 plus timing-safe comparison, a fixed limit of 25, dependency injection, generic failure responses, and a fresh plain-object projection of five bounded result counts.
- The root Pages `wrangler.toml` producer is exactly `CRM_SEARCH_INDEX_QUEUE -> agency-crm-search-index`; Pages remains a producer only. The consolidated cron worker calls the repair endpoint every five minutes. `.env.example` documents the dedicated secret keyring and explicitly gives the queue binding no string fallback.

## Confirmation Contract Pulled Forward from Task 12

Task 11 needs confirmation evidence when it creates an upsert operation, so the planned `confirmation.ts` dependency was intentionally pulled forward with parent approval. Task 12 should consume this module rather than define a second format.

- The strict versioned keyring accepts one to eight unique canonical unpadded base64url 32-byte secrets and selects only `activeKeyVersion` for signing.
- Confirmation is WebCrypto HMAC-SHA-256 over the exact UTF-8 byte-length-framed tuple: organisation scope, client, vector ID, schema version, source revision, and PostgreSQL content hash.
- Only `hmac-sha256:<64 lowercase hex>` and the key version enter an operation row. Secret material never enters rows or logs.
- Plain/null-prototype and descriptor-only parsing rejects extra roots, malformed versions, duplicate secret aliases, missing active keys, accessor-backed material, and noncanonical keys without evaluating hostile accessors.

## Behavioral TDD Evidence

### Initial RED

The publisher, repair endpoint, root binding/config, publication repository, confirmation helper, and dirty-expansion suites were written before their implementation slices. Each failed for its absent module or contract. Required initial publisher/route tests failed because the modules did not exist.

### Incremental and adversarial RED→GREEN

Incremental greens established exact envelope publication, queue failure rescheduling, disabled/delete-only behavior, repeated-repair coalescing, transport lease CAS, confirmation golden evidence, and operational default dirty expansion. Fresh failing regressions then reproduced and closed:

- enabled-mode deletion incorrectly surviving a disabled ordinary policy without teardown authority;
- publication claims that did not re-prove current global/policy/schema or teardown authority;
- dirty expansion and route results exceeding the eight-schema-per-source bound;
- oversized cron credentials being hashed rather than rejected; and
- accessor-backed confirmation key material being evaluated during parsing.

Final Task 11 focused gate:

```text
PASS: 6 files, 63 tests
```

Required publisher/cron/migration/observability gate:

```text
PASS: 4 files, 37 tests
```

Combined Task 8 repository, Task 9 protocol/auth/MCP, Task 10 consumer/config, and Task 11 compatibility gate:

```text
PASS: 33 files, 402 tests; 1 guarded external-PostgreSQL case skipped
```

## Static, Type, and Deep-Review Evidence

- Strict isolated TypeScript with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` over every owned TypeScript source/test: exit 0. The temporary config/shim used only for this isolated check was removed.
- Node 24.18.0 ESLint over all owned TypeScript source/test files: exit 0. `.env.example` is outside the configured lint targets and was verified by config tests and static scans.
- The full Nuxt server typecheck was also run. It remains red on the repository's documented unrelated baseline diagnostics and reported no Task 11-owned diagnostic; the strict isolated Task 11 check is green.
- `git diff --check` passed. Exact config drift tests pin the Pages producer, consumer queue, worker package identity, dry-run-only script, and root/worker Wrangler version.
- Static privacy/security scans found no Task 11 production raw CRM body/source/provider-error logging, no generic queue/provider fallback, and no newly committed secret material. The only modified cron logging is the pre-existing allowlisted cron/path/status behavior.
- Every owned implementation and test was reread end-to-end. The review covered server aliases, lock order, fresh authority, operation/dirty/transport CAS, monotonic revisions, delete-only and teardown independence, queue durability boundaries, exact envelope projection, count/credential bounds, keyring parser side effects, confirmation tuple/key selection, and the absence of provider/deploy/resource side effects.

## Remaining Integration Concerns

1. The dedicated queue and secret bindings must be provisioned and supplied by an authorized release workflow. This task only freezes and tests their exact names; it deliberately creates no resource.
2. Task 12 must reuse the confirmation helper, re-prove current authority at processing time, and preserve the operation/document confirmation CAS. Task 11 performs no provider mutation or reconciliation.
3. The repository-wide Nuxt typecheck retains unrelated baseline diagnostics; all Task 11-owned TypeScript is clean under the stricter isolated pass.
