# Task 13 Report — Authorized Semantic Retrieval and Deterministic Fusion

## Result

Task 13 is complete. Agency CRM POST search now runs the authorized keyword path first, admits semantic providers only behind fresh policy and durable usage reservations, validates the untrusted provider response, joins candidates back through confirmed ledger and current Postgres authority, and applies deterministic weighted RRF. Portal search remains keyword-only. Agency-global shadow work never changes visible ordering and is bounded by sampling, concurrency, the request lifecycle, and the caller limit.

Semantic retrieval fails closed to the authorized keyword result for missing/malformed analytics configuration, policy, budget, provider, deadline, ledger, join-back, authorization, validation, or fusion failures. A primary keyword database failure remains request-fatal.

## Implemented Contracts

- Pinned Workers AI model/pooling/dimensions and a strict data-only embedding response parser compatible with the Task 12 provider interface, including `Float32Array` responses.
- Pinned Vectorize `topK = 30`, score threshold `0.75`, canonical namespace, active schema, allowed entity filters, and no values/metadata.
- Dropped malformed, duplicate, non-finite, below-threshold, foreign, pending, tombstoned, deleted, stale, or unauthorized candidates before fusion.
- Fresh-revalidated session/client/permission/owner authority and projected titles/subtitles only from current CRM rows.
- Added versioned weighted RRF (`k = 60`, keyword `1.0`, semantic `0.7`) with per-source entity-key deduplication, complete-pool fusion, caller limiting, and stable tie breaks.
- Independently reserved, sent-fenced, and settled Workers AI and Vectorize query attempts using the unchanged Task 12 query-facing repository APIs.
- Applied one 500 ms semantic deadline (hard ceiling 750 ms), fenced timeout abandonment before late work can resume, discarded late output, and retained only correlation/accounting data in request-lifecycle continuation.
- Added agency-global shadow sampling capped at 10%, four concurrent tasks, synchronous binding capture, generic redacted failure logging, and exact visible keyword ordering/limit.
- Wired the agency POST endpoint to the retrieval coordinator; portal POST retrieval remains untouched and provider-free.

## Analytics and Security Adapters

- Added the dedicated `CRM_SEARCH_ANALYTICS_KEYRING` binding with strict shape, key-count, version, UTF-8 secret-length, uniqueness, and active-key validation.
- A malformed deployed binding never falls back to process state. Missing or invalid analytics readiness returns authorized keyword results before policy admission or any provider reservation/call.
- Query digests use only the active dedicated analytics key and persist through the durable CRM search event repository; raw query text and analytics secrets are not persisted or retained by background settlement.
- Join-back security rejections use the default durable event adapter with bounded reason classes and no provider metadata, titles, raw query, or provider error body.

## Task 12 Reconciliation

Reconciled against Task 12 repair commit `a07c0c91a4f0706418b77e4e0a61f17e976a29fa`. The query-facing signatures for `reserveCrmSearchUsage`, `markCrmSearchProviderAttemptSent`, and `settleCrmSearchUsage` remain compatible. Task 13 does not call the indexing-only `recordCrmSearchProviderAcceptance` API whose action is now required.

## Strict TDD Evidence

The implementation was developed and acceptance-repaired through explicit RED→GREEN cases, including:

- missing semantic modules and retrieval coordinator;
- Task 12 data-only/typed-array embedding response compatibility;
- shadow public-limit enforcement and background-registration failure isolation;
- deadline-coordinator rejection fallback and correct Vectorize timeout attribution;
- timeout before sent CAS (`released_no_call`) and while sent CAS is in flight (`late_discarded`) without invoking a provider;
- timeout callback ordering, proving abandonment is established before late work can resume or advance to Vectorize;
- dedicated analytics keyring absence keeping policy, reservation, Workers AI, and Vectorize idle.

The final Task 13-focused gate passes 7 files and 138 tests. The combined Task 4/search and Tasks 7–13 compatibility gate passes 54 files and 716 tests, with 3 opt-in PostgreSQL/environment tests guarded and skipped.

## Static, Type, and Deep-Review Evidence

- Focused ESLint under the repository-required Node 24 runtime reports zero source/test errors.
- A strict TypeScript overlay enabled `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. The repository-wide generated program still exits on established unrelated baseline diagnostics; filtering the complete output to every Task 13 implementation/test path reports zero diagnostics.
- Every modified/new Task 13 source, test, and environment-documentation file was reread end-to-end. Imports use the Nitro `~~/server` alias where required; SQL is parameterized; no provider metadata is trusted for authorization; no raw query/provider error is logged or persisted; and no client/correlation identifiers enter metric labels.
- Exact-path staged diff and whitespace/secret audits were run before commit. Task 12-owned paths were not edited or staged by Task 13.

## External-State Boundary and Remaining Concerns

No external provider, network, deployment, production database, or migration action was performed for Task 13. Production remains fail-closed until the dedicated analytics secret and exact Cloudflare AI/Vectorize resources are provisioned and the existing rollout policy authorizes shadow/assist. The guarded PostgreSQL suites require their explicit operator opt-in for live execution.

## Final Acceptance Repair — Assist Authority and Timeout Privacy

- Intended repair commit: `fix(crm-search): preserve assist authority and timeout privacy`.
- Production `agency_ai` join-back revalidation now calls `resolveAgencyAiCrmContext` with the exact previously selected client ID. It reloads the active actor, permissions, assistant assignment set/revision, selected active client, direct assignment, organisation scope, owner visibility, and fixed `agency_ai` surface. The original correlation is preserved after the fresh authority read. Join-back compares the complete canonical authority and fails closed before current-row access when the assignment set or source revision changes.
- The canonical join-back fixture now includes `assistantScope`; a valid indexed/current semantic candidate survives unchanged authority, while a changed assignment revision rejects the entire semantic branch.
- The deadline now bounds each reserved provider attempt against one absolute 500 ms semantic window instead of registering the full semantic branch as late work. The coordinator clears its raw-query invocation closure and full context before any background registration.
- A timeout continuation receives only correlation, reservation/provider-attempt identity, provider, precomputed digest context, timeout timing, sent-at-timeout state, and accounting disposition. Its promise resolves only after the in-flight attempt settles/releases and projects `undefined`; late Workers AI output cannot start Vectorize, and late Vectorize output cannot reach join-back or fusion.
- Provider-attempt settlement is single-flight across timeout callback ordering, pre-sent abandonment, sent-CAS races, provider completion/failure, and deadline-coordinator rejection. Late output is conservatively discarded/charged when sent and released without a call when abandonment wins first.

### Repair RED → GREEN Evidence

The first RED run failed five intended cases across the retrieval, join-back, and context suites. It proved the missing exact-ID AI resolver path, production revalidation adapter, provider-only deadline boundary, safe late provenance, and no-resume settlement promise. The other 54 cases remained green. The minimal implementation then passed all 59 cases.

Fresh final verification on the coordinated Task 14 HEAD:

```text
Focused Task 13 authority/retrieval/context gate:            8 files, 145 passed
Task 13 + Task 14 direct-assist compatibility gate:         11 files, 171 passed
Broad CRM-search compatibility gate:                        51 files, 664 passed, 3 guarded skips
Node 24 ESLint, Task 13 runtime/owned tests:                  exit 0
Node 24 baseline-suppressed context lint:                    exit 0; normal lint has 36 existing findings vs 37 at HEAD
Node 24 Nuxt typecheck:                                      exit 0 (one existing duplicate-import warning)
git diff --check over the exact repair scope:                exit 0
```

All five modified runtime/test files were reread end-to-end. The review confirmed exact-ID selection remains intersected with fresh server-owned assignments; no caller-provided ID bypass exists; join-back still authorizes from Postgres rather than provider metadata; the background continuation carries no query, title, actor, client, permission, assistant-scope, vector, candidate, fused pool, or provider result; and the Nitro aliases and Task 12 query-attempt repository signatures remain valid. No Task 12 provider/indexing implementation or Task 14 tool/inventory path was edited or staged by this repair. No external provider, network, database, migration, deployment, or production action was performed.
