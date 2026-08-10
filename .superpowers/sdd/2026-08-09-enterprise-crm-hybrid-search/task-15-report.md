# Task 15 Report — Evaluation, Retention, and Promotion Governance

## Result

Task 15 is complete. CRM search now has content-bound redacted evaluation fixtures, deterministic server-computed ranking evidence, fail-closed promotion checks, sealed holdout execution, organisation-scoped ADMIN evidence endpoints, and a bounded daily retention coordinator that delegates governed deletion to migration 350's existing authority.

No Task 15 code changes rollout state. No caller-supplied pass flag, aggregate metric bundle, organisation scope, or policy transition is accepted.

## Evaluation and Promotion Boundary

- The checked-in constitution contains 180 development queries across three clients and a sealed 360-query holdout manifest with the approved per-client, entity-type, and query-stratum minima.
- Corpus, development, preregistration, and adjudication artifacts carry SHA-256 values recomputed from deterministic canonical redacted content. A content mutation without a new digest fails validation.
- The runner freezes preregistration before requesting the sealed holdout, requires exact checked-in and deployment bindings, and projects granular judgements/result digests into server-computed per-query nDCG, MRR, and no-result evidence.
- The migration 350 recorder remains the only persistence authority. Its 32-argument contract recomputes aggregate metrics, the exactly 1,000-sample paired bootstrap, safety/load/capacity/shadow gates, immutable evidence hashes, and the 14-day run lifetime. The repository sends neither a pass flag nor a metric bundle.
- Promotion checks fail closed on missing or non-finite quality, latency, capacity, false-positive, shadow, or actor evidence. Approval checks enforce expiry, revocation, single-use, actor separation, and exact evidence/deployment/schema/revision binding.
- ADMIN POST requires a stable write-session identity and strict Zod input. ADMIN GET resolves the server-owned organisation scope and queries by both run ID and organisation scope. Responses are private/no-store and failures are sanitized.

## Retention and Erasure Boundary

- The approved defaults are pinned: detailed events 30 days, daily aggregates 180 days, usage/rate cards 400 days, confirmed operations 90 days, resolved dead letters 180 days, confirmed teardown evidence 90 days, and evaluation/policy/security evidence two years.
- Detailed events aggregate before expiry. All single-approver tables accepted by `crm_search_expire_governed_rows` are explicitly allowlisted, including schema versions, rate cards, and rate-card revocations.
- Candidate manifests use the same ordered IDs and projection-hash input as migration 350. Every batch delegates deletion, legal-hold filtering, high-watermark CAS, immutable authorization, and chained attestation creation to the existing SECURITY DEFINER function.
- Retired analytics HMAC keys are destroyed only when the retained detailed-event reference count is exactly zero; missing key-management authority fails closed at destruction.
- Client erasure remains incomplete until both database teardown state and provider absence are confirmed. The coordinator targets 15 minutes, warns at one hour, pages at four hours, and emits a privacy-incident page at 24 hours. Missing alert transport fails closed.
- The cron endpoint authenticates before work with a bounded timing-safe secret check, requires a server-owned UUID executor, uses a fixed 1,000-row pass, and returns counts only. The existing Pages cron worker now calls it on the daily 03:35 schedule.

## Strict TDD Evidence

The initial six Task 15 suites failed at module resolution before implementation. Incremental RED-to-GREEN slices then established fixture privacy and constitution rules, deterministic metrics/bootstrap, complete promotion gates, freeze-before-unseal ordering, migration delegation, retention sequencing, key destruction, erasure SLAs, ADMIN authorization, sanitized responses, and cron registration.

Deep review added focused RED cases for four gaps discovered before commit:

1. missing governed schema/rate-card retention targets;
2. evaluation reads not yet constrained by the server-owned organisation scope;
3. missing numeric or actor evidence being able to bypass pure promotion checks; and
4. fixture digests not yet cryptographically bound to their checked-in redacted content.

All four are closed and covered by green regressions.

## Verification

Final frozen gate:

```text
Task 15 + telemetry/cron + migration delegation contracts: 150 passed, 1 guarded DB case skipped
Post-lint promotion focus:                                  24 passed
Node 24 ESLint over all Task 15 source/test paths:           0 diagnostics
Repository server TypeScript owned-path filter:              0 diagnostics
```

The guarded PostgreSQL case was intentionally skipped without `CRM_SEARCH_TEST_DATABASE_URL`. A disposable local PostgreSQL 14 startup was attempted under `/private/tmp`, but the sandbox denied shared-memory creation; a later escalated startup was aborted after exceeding the five-minute command ceiling. No cluster remained running. Task 15 does not modify migrations 350–352, and it relies on the accepted Task 5/12 PostgreSQL 14 apply/reapply, role, retention, and provider-lifecycle evidence plus its own static function-delegation and exact repository-contract tests.

Every owned implementation, endpoint, worker change, test, schema, and fixture was reread. The 1,944-line generated development fixture was additionally checked structurally and by its canonical content digest. The final review found no remaining import-alias, raw-query/PII persistence, caller-authority, automatic-rollout, mutable-evidence, unbounded-batch, or external-provider path.

## External-State Boundary

No external database, provider, network request, Cloudflare/Neon resource mutation, deployment, or production migration was performed. Concurrent Task 16 component and admin-endpoint RED files were not edited or staged.

## Acceptance Review 1 — Governance Gap Closure

The bounded acceptance review found seven gaps in the initial Task 15 delivery. This follow-up closes each one without changing rollout state or calling a provider:

1. Retention targets now run every known FK child before its parent, including usage/provider/operation, evaluation approval/query evidence/run, change approval, teardown, audit/dead-letter, and rate-card relationships.
2. The holdout manifest has its own recomputed canonical SHA-256. Sealed R2 objects are read as exact bounded UTF-8 bytes, reject BOM/non-canonical encodings, derive rather than trust the judgement digest, and recursively reject sensitive keys and email/phone-like values under arbitrary fields.
3. Production defaults resolve only exact Cloudflare bindings: bundled checked-in fixtures plus a strict `CRM_SEARCH_EVALUATION_CONFIG`, the `CRM_SEARCH_EVALUATION_RUNNER` service, `CRM_SEARCH_SEALED_HOLDOUTS` R2, `CRM_SEARCH_RETENTION_ALERTS` Queue, and the `CRM_SEARCH_ANALYTICS_KEY_MANAGER` service. Missing, malformed, oversized, non-JSON, non-2xx, or unexpected response shapes fail closed. Evaluation and key-manager calls have explicit deadlines.
4. The retention definer counts active direct and target legal holds. A blocked row keeps the batch incomplete, keeps the cutoff pending, prevents high-watermark advancement, and returns `legalHoldBlockedCount` to the coordinator and count-only endpoint.
5. Analytics key retirement is no longer a count-then-destroy race. A transaction-scoped exclusive advisory fence covers the last-reference check, mandatory idempotent manager destruction, and durable receipt recording. Event insertion takes the matching shared fence and rejects every retired key version, so no reference can appear between the check and retirement or after retirement.
6. Runner identity is checked in the runner, immutable evaluation-row constraints, and the recorder; an implementation or fixture author cannot execute the sealed run.
7. The bounded operator reason is now the recorder's 32nd parameter and query evidence the 33rd. The SECURITY DEFINER recorder inserts `evaluation.executed` audit evidence with the original trimmed reason in the same transaction as the run and granular evidence.

Migration 350 was intentionally updated because the legal-hold watermark, durable retirement fence, actor constraint, and transactional audit cannot be made authoritative in application code alone. The new table, triggers, named constraints, definer function, changed evaluation recorder signature, privileges, and function replacement are guarded for apply/reapply. The previous report's statement that Task 15 did not modify migrations applied only to the initial commit and is superseded by this review section.

### Review TDD and Verification

The acceptance RED was captured before production edits:

```text
Task 15 focused RED:        61 passed, 13 failed (74 total)
Task 15 focused GREEN:      90 passed (5 files)
Bounded compatibility:      82 passed (6 files)
Post-review focused checks:  4 passed (new binding/fence/idempotence slices)
Node 24 targeted ESLint:     0 diagnostics
Strict server TS filter:     0 Task 15-path diagnostics
```

The strict server project still reports unrelated pre-existing diagnostics and concurrent Task 16 operation diagnostics; none resolve to Task 15 paths. Static migration tests cover function replacement, idempotent named constraints, legal-hold count/completion/watermark behavior, event shared locking, permanent retirement evidence, mandatory definer access, runner separation, and transactional audit reason preservation. Canonical digest recomputation independently matched the checked-in holdout manifest.

An isolated PostgreSQL 14 `initdb` under `/private/tmp` was attempted for local apply/reapply evidence. The sandbox denied SysV shared-memory creation and removed its partial data directory. The required escalated retry was interrupted after 709 seconds; no PostgreSQL server started, no database was contacted, and it was not retried per coordination direction. This review therefore relies on the passing static/idempotence contracts plus the accepted earlier PostgreSQL 14 migration evidence recorded by Tasks 5/12.

All changed Task 15 source, migration, fixture, and test diffs were reread. Exact-path diff checks, secret scans, legacy event-context shim scans, process-environment scans, logging scans, and raw-query/source/provider-body scans were clean. Task 16's concurrent agency layout, operations, admin UI/API, and tests remained untouched and unstaged.
