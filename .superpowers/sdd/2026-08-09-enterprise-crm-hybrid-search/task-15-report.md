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
