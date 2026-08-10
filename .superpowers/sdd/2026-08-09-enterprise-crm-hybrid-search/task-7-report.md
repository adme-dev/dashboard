# Task 7 Report — Deterministic Search and Index Primitives

## Result

- Status: `DONE_WITH_CONCERNS`.
- Intended commit: `feat(crm-search): add deterministic search primitives`.
- Scope: Task 7 pure modules, tests, and this report only. Migration 350 and its Task 5 tests remained under the concurrent Task 5 writer's ownership.
- No Cloudflare resource, provider, database, network, migration-application, deployment, or production mutation was performed.

## Implemented Contracts

- `contracts.ts` pins schema v1, `@cf/baai/bge-base-en-v1.5`, explicit `cls` pooling, 768 dimensions, 512 input tokens, the 1,000-code-point canonical cap, domain enums, and the injected exact-tokenizer/rate-card interfaces.
- `identity.ts` derives deterministic 43-byte SHA-256 base64url namespace/vector IDs from UTF-8 length-framed, domain-separated server-owned tuples. Provider IDs remain below the 64-byte limit. A separately domain-separated tuple digest makes registry collision checks independent of the provider-ID digest; literal golden IDs and evidence digests pin encoding/revisions.
- `documents.ts` owns one frozen source of truth for the exact v1 field order, labels, and bounds. It performs NFKC normalization, whitespace-boundary preservation/collapse, C0/C1 and bidi-control stripping, Unicode-code-point caps, post-lowercase domain rebounding, 1,000-code-point canonical capping, SHA-256 content hashing, and deterministic field-priority prefix truncation using only an explicitly injected schema-pinned tokenizer. Provider metadata is projected to exactly five routing/confirmation fields; only entity type and schema version are declared indexed.
- `policy.ts` resolves the most restrictive global/policy/surface mode and fails closed on unknown, halted, or unready state. Provider mutation admission respects enabled/delete-only/halted controls, schema roles, and a durable teardown-snapshot authorization path that survives deletion of the ordinary client/policy row without permitting upserts.
- `usage.ts` meters query, inserted, billable queried, and stored dimensions without a `topK` multiplier; reserves all 512 model-input tokens for every possible Workers AI call; validates immutable current/non-revoked pinned-model rate-card evidence; ceiling-rounds micro-USD costs with exact `BigInt` arithmetic; independently caps provider calls/dimensions/cost; and forecasts active/candidate/retiring/sentinel/deletion-pending namespaces/vectors strictly below 80%. Missing limits and operator caps above the pinned 50,000-namespace/20,000,000-vector provider maxima fail closed.
- `telemetry.ts` derives scoped, domain-separated HMAC-SHA-256 query and entity-ID digests with golden query evidence; bounds event counts/ranks/latencies and conservative JSONB text size to migration 350's 8,192-byte ceiling; accepts only HMAC entity rank evidence, pinned threshold/reason enums, and allowlisted low-cardinality metric labels. Ordinary search events must compute HMAC context from the live normalized query; late completions must use validated precomputed digest/key/bucket context and cannot require raw-query retention.
- `ranking.ts` pins RRF v1 (`k=60`, weights `1.0/0.7`, pools `50/30`, one-based best-rank source dedupe), fuses complete pools before the caller limit, assigns zero absent contribution, ignores caller-provided keys, and deterministically breaks ties by keyword rank, semantic rank, entity type, then entity ID.

The shared `test/fixtures/crm-search-documents.json` fixture did not require modification.

## Source-Driven Provider Contract

Official Cloudflare documentation was rechecked on 2026-08-10:

- BGE base model: 512 maximum input tokens, 768-dimensional output, explicit `cls` pooling, and the recorded current USD 0.067/million-input-token price: <https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/>
- Vectorize identifiers and capacity: 64-byte vector IDs/namespaces, 20 million vectors per index, and 50,000 Workers Paid namespaces: <https://developers.cloudflare.com/vectorize/platform/limits/>
- Vectorize usage formula: queried plus inserted vector dimensions and stored vector dimensions; `topK` is not a price multiplier: <https://developers.cloudflare.com/workers/platform/pricing/#vectorize>
- Vectorize client behavior and metadata/query controls: <https://developers.cloudflare.com/vectorize/reference/client-api/>
- Workers WebCrypto HMAC/SHA support and Worker runtime guidance: <https://developers.cloudflare.com/workers/runtime-apis/web-crypto/> and <https://developers.cloudflare.com/workers/best-practices/workers-best-practices/>

No tokenizer asset was downloaded or inferred from byte/word estimates. The repository does not currently contain a proven exact BGE tokenizer asset, so provider-input construction deliberately fails closed unless a caller injects `CrmSearchExactTokenizer` with the exact active-schema revision and special-token-inclusive output. Wiring a reviewed, pinned tokenizer adapter is an explicit downstream integration dependency; no byte/word heuristic is represented as exact BGE tokenization.

## Behavioral TDD Evidence

### Initial RED

Tests for all six pure surfaces were created before any Task 7 implementation module. The required command was then run:

```text
pnpm exec vitest run test/crm/searchIndex/identity.test.ts test/crm/searchIndex/documents.test.ts test/crm/searchIndex/policy.test.ts test/crm/searchIndex/usage.test.ts test/crm/searchIndex/telemetry.test.ts test/crm/ranking.test.ts
```

Result: expected failure — all six implementation modules were absent and the six suites could not resolve them.

### Incremental GREEN and adversarial RED→GREEN

The modules were implemented one thin slice at a time. Initial focused greens were identity 8, documents 11, policy 12, usage 11, telemetry 20, and ranking 12 tests; the first consolidated green was 6 files/74 tests.

Fresh regression tests then reproduced and closed the following issues before each corresponding repair:

- nested allowlist mutability and a zero-token injected tokenizer;
- floating-point `<80%` threshold ambiguity;
- latency values outside PostgreSQL `INTEGER` range;
- collision evidence that merely re-encoded the provider digest;
- Unicode lowercase expansion beyond the 253-code-point domain cap;
- late-completion raw-query retention, unkeyed entity evidence, and caller-controlled rank-evidence strings;
- teardown deletion after ordinary policy-row loss;
- caps above provider maxima, stale/revoked/wrong-model rate cards, provider-call undercount, and a demonstrated one-microUSD floating under-reservation;
- absence of a scoped entity-rank HMAC helper.
- individually bounded rank lists whose combined serialization exceeded the database's rank-evidence byte ceiling.

Final owned Task 7 gate:

```text
PASS: 6 files, 84 tests
```

## Fixture Parity and Deferred Task 6 Gate

After Task 5 committed migration 350 and its readiness-replay repair, the final combined parity gate passed:

```text
PASS: 7 files, 109 tests
```

This gate contains all 84 Task 7 tests plus the 25-test live Task 5 migration projection suite. The company-domain projection matches migration 350's exact normalize/NFKC/control/whitespace cap, Unicode-lowercase, then final 253-code-point cap order. The shared fixture remained byte-identical.

The Task 7 plan names `test/config/crmSearchValidateBackfillMigration.test.ts`, but that Task 6 migration/parity test does not exist yet. Its SQL/TypeScript parity recheck is explicitly deferred until Task 6 creates it.

## Static and Deep-Review Evidence

- Strict standalone TypeScript over all seven owned modules: exit 0.
- Node 24 ESLint over every owned module and test: exit 0.
- Full Nuxt typecheck required inherited `NODE_OPTIONS=--max-old-space-size=16384`; attempts at the default child-process heap OOMed around 4 GB. The completed run retains 864 unrelated repository-baseline diagnostics and exits 2; filtering the complete log for every Task 7 module/test path returns zero diagnostics.
- An initial ESLint attempt under the shell's Node 20.10.0 failed before linting because the installed toolchain uses `Object.groupBy`; rerunning with the repository's available Node 24.18.0 completed cleanly.
- Every owned source/test file was reread end-to-end. The review checked server-only imports, exact tuple/domain framing, Unicode code-point rather than UTF-16 bounds, SQL/TypeScript normalization order, tokenizer revision/special-token enforcement, absence of unrestricted fields/metadata, HMAC scoping, rate/cap overflow behavior, teardown fail-closed semantics, RRF pool/dedupe/tie rules, and raw-query/identifier leakage.
- A separate read-only adversarial agent reviewed the same owned files against the approved design; all blocking findings were reproduced with tests and closed. Its final pass reported no remaining blocking finding and no RRF correctness issue.
- Final exact-path diff, staged-scope, and secret checks are recorded in the commit handoff; the staged set excludes migration 350 and both Task 5 suites.

## Remaining Integration Concerns

1. A reviewed exact BGE tokenizer adapter/asset is not present and must be injected downstream; Task 7 correctly fails closed without it.
2. Task 6's validation/backfill migration parity test is not present and must rerun the fixture contract when created.
3. Repository-wide typecheck remains red on 864 unowned baseline diagnostics, while all Task 7 modules are clean under strict standalone TypeScript.
4. Rate-card prices are accepted only as safe-integer micro-USD-per-million units for exact arithmetic. A future fractional-micro-USD price revision must introduce a versioned exact decimal/integer scaling contract rather than silently using floating-point arithmetic.
