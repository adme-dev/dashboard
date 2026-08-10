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
