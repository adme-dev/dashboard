# Task 5 Report — Add the Search-Domain Expand Migration

## Result

- Base and pre-task HEAD: `0dd947392f4cdc2ed28f7ff07f5534aa51565ca6`.
- Intended commit: `feat(crm-search): add search-domain schema`.
- Scope: Task 5 only. No source-capture trigger, provider call, Neon resource action, shared/production database connection, deployment, or use of `DATABASE_URL` occurred.
- Final focused gate: 19 tests passed and the guarded Postgres block skipped because `CRM_SEARCH_TEST_DATABASE_URL` was absent.
- Relevant migration regressions: 32 tests passed and 13 unrelated/environment-gated database tests skipped.

## Implemented Schema

- Added `search_revision BIGINT NOT NULL DEFAULT 0` with a non-negative constraint to people, companies, and opportunities. Revision ownership/capture remains deliberately deferred to Task 6.
- Added the installation/organisation scope registry, halted global control, per-client policies, namespaces, immutable schema contracts, immutable rate cards and revocations, zero-default provider-call/dimension/cost budgets, and bounded semantic controls.
- Added the schema-neutral latest-intent dirty set, global source-event sequence, per-schema operations, and no-content document ledger. Search identities do not reference or cascade from client/source rows.
- Bounded operations with separate partial unique indexes for one replaceable pre-admission row, one provider-pending mutation, and one coalesced successor per organisation/client/entity/schema, plus explicit transition and terminal-state checks.
- Added global/client daily usage, per-call reservations, privacy-safe partitioned detailed events, bounded daily aggregates, and explicit 30/180/400-day retention defaults where applicable.
- Added immutable evaluation runs, query-level evidence, approvals/revocations, change approvals/revocations, and a `SECURITY DEFINER` recorder that accepts query-level evidence and recomputes the gate and metric bundle server-side. No caller-supplied aggregate or pass flag exists.
- Added append-only partitioned audit evidence, origin-separated dead letters and legal transition functions, independent client teardown snapshots/vectors, legal holds/releases/targets, retention high-watermarks, and partitioned chained deletion attestations.

## Deterministic Projection Contract

- Added NFKC normalization, Unicode control/bidi removal, whitespace collapse, per-field code-point limits, a 1,000-code-point canonical cap, and PostgreSQL 14 built-in SHA-256 hashing.
- Added allowlisted v1 projections for people, companies, and opportunities. Email, phone, notes, raw provider bodies, vector values, and unapproved source fields are structurally absent.
- Added one shared fixture with four normalization/omission cases. PostgreSQL output matched every canonical string and SHA-256 digest byte-for-byte.
- During the PostgreSQL 14 runtime pass, the initial schema-qualified `normalize(..., NFKC)` form failed because PL/pgSQL treated the bare form as an identifier. The final migration uses PostgreSQL's accepted `normalize(..., 'NFKC')` form. SHA-256/encoding behavior was checked against the PostgreSQL 14 binary-string documentation.

## Governance and Security Boundaries

- All privileged functions pin `search_path` to `pg_catalog, pg_temp` and schema-qualify application objects.
- Dynamic retention/hold SQL accepts only an exact table allowlist, validates identifier shape, quotes identifiers with `%I`, verifies a requested partition is the target or its direct child, locks the high-watermark row, checks an expected hash, bounds each batch, and attests before deletion.
- Active direct or attached holds block retention; release is append-only and requires two distinct actors. Expiry of retention attestations themselves requires a distinct secondary approver.
- Governed evidence rejects ordinary update/delete/truncate statements. All `SECURITY DEFINER` entry points are revoked from `PUBLIC` in the same transaction, as are ordinary governed mutation paths.
- Dead-letter origin is constrained to `cloudflare_transport` or `provider_confirmation`; transport retry and provider reconciliation states cannot cross origins, and resolved evidence becomes immutable.
- The database URL guard reads only `CRM_SEARCH_TEST_DATABASE_URL`, requires a direct non-pooled `ep-*.neon.tech` endpoint, TLS, exactly one dedicated application name, and rejects production/shared-like identities before constructing a client. Absence skips cleanly.

## Behavioral TDD Evidence

The migration contract and fixture were written first. The required RED run produced 10/10 intended failures because migration 350 did not exist. The migration was then implemented until the static contract became green.

A later isolated PostgreSQL 14 runtime check found the NFKC call incompatibility described above. The failing runtime projection was preserved as the diagnostic, the call was corrected, and projection/retention behavior was rerun green.

## Verification

### Focused Task 5 gate

```text
PASS: 2 files, 19 tests
SKIP: 1 guarded Postgres test (CRM_SEARCH_TEST_DATABASE_URL absent)
```

The static portion covers transaction boundaries, Task 6 trigger absence, all required domain objects, zero defaults, source revisions, non-cascading identities, partial operation bounds, dead-letter origins, fixture privacy/projections, evaluation recomputation, immutability, and retention function contracts. URL guard cases execute even when the database block is skipped.

### Isolated PostgreSQL 14.19 verification

An ephemeral local PostgreSQL cluster under `/private/tmp` was used only through its Unix socket; no environment URL or network database was used. It was stopped and deleted after the checks.

```text
PASS: migration applied twice
PASS: all four fixture projections and hashes
PASS: halted/off/zero defaults and no source triggers
PASS: one-provider-pending/one-successor bound
PASS: disjoint dead-letter transition rejection
PASS: immutable governed evidence rejection
PASS: legal hold, release, two-link attestation chain, and bounded expiry
PASS: privileged function PUBLIC grants absent
```

### Regression and static gates

- Relevant migration/config regressions: 6 files, 32 tests passed, 13 environment-gated tests skipped.
- ESLint over both owned TypeScript test files: clean.
- Full Node 24 `pnpm run typecheck`: remains broadly red in unrelated existing application/server files; no owned-path diagnostic was observed, and the owned TypeScript is exercised by Vitest and ESLint.
- Final `git diff --check`: recorded after exact-path staging.

## Deep Review

- Re-read all 2,590 migration lines, both tests, and the fixture end-to-end.
- Confirmed the migration starts with `BEGIN`, ends with `COMMIT`, is idempotent under a second PostgreSQL application, and creates no trigger on a CRM source table.
- Confirmed every client/source identity is non-cascading, no `ON DELETE CASCADE` exists, canonical projections persist no content, default provider controls cannot spend or issue calls, and all state enums/checks are explicit.
- Confirmed `SECURITY DEFINER` functions have pinned search paths, no caller-controlled relation reaches dynamic SQL without allowlisting and identifier quoting, high-watermark updates use compare-and-swap, and attestation rows precede governed deletion.
- Confirmed no test or migration reads `DATABASE_URL`, no Neon/shared/production connection was attempted, and the disposable-schema database block remains safely skipped without its dedicated guarded variable.

## Task 5 / Task 6 Boundary

Migration 350 is intentionally provider-dormant. It adds only revision storage and pure projection/governance helpers. Fixed installation/schema/rate-card seeds, source revision backfill/validation, source/client capture functions, advisory locking, and trigger-last activation remain exclusively Task 6 work in migrations 351/352.

## Remaining Concern

- The guarded Neon disposable-schema block still needs one run after the parent provisions an isolated branch and supplies `CRM_SEARCH_TEST_DATABASE_URL`. The same behaviors were validated against isolated PostgreSQL 14 locally, but this task correctly did not manufacture or infer a Neon target.

---

## Review Round 1 — Schema Governance Closure

### Result

- Commit target: `fix(crm-search): close schema governance gaps`.
- Scope remained Task 5 only. Migration 350 still installs no capture trigger on people, companies, or opportunities; source capture remains Task 6.
- The dedicated Neon database block skipped because `CRM_SEARCH_TEST_DATABASE_URL` was absent. No `DATABASE_URL` value was read or inferred, no Neon resource was created or deleted, and no shared/production database or deployment was touched.

### Consolidated RED

Review behavior/contract tests were added before the production SQL changes. The first consolidated run was intentionally red:

```text
Test files: 1 failed, 1 passed
Tests:      7 failed, 20 passed, 1 skipped
```

The failures covered server-owned evaluation evidence, frozen provider admission, exact retention authority, blue/green schema governance, approval serialization/PG14 NULL identities, auditable dead-letter actions, recursive JSON privacy, and the narrow role model. Follow-up RED checks also caught the missing governed retiring-schema completion contract, an omitted recursive JSON key for its audit record, and role-hardening expectations before each corresponding SQL change.

### Review Findings Closed

1. Evaluation runs and query evidence are no longer directly insertable by the runtime role. `crm_search_record_evaluation_run` is the only runtime write path; it computes the canonical JSONB evidence SHA-256 server-side and stores the computed value.
2. The recorder derives the gate from granular evidence: at least 80 queries per client, entity minima of 60 across all three entity types, per-client/entity NDCG and MRR regression ceilings, off/shadow digest equality, three disjoint load strata with observed concurrency, convergence and telemetry checks, seven consecutive shadow days, and a deterministic 1,000-sample paired bootstrap interval. Caller labels and normal-approximation shortcuts are not accepted.
3. Provider admission now stamps an immutable admission marker and identity hash. Advisory-locked admission and partial unique indexes enforce one pre-admission root, one accepted in-flight identity, and one same-key successor; cross-key successors, unrelated roots while a successor exists, and mutation after admission are rejected.
4. Legal-hold attachment and governed expiry use compatible advisory/table/row locking. A concurrent hold cannot attach after expiry has selected and deleted the target.
5. Retention authorization binds backend PID, transaction ID, exact target relation OID, exact partition OID, exact candidate UUID array, computed manifest, and attestation. Authorization is transaction-local and cannot be reused for a different governed relation.
6. Retention no longer uses `SKIP LOCKED`. A pending cutoff is continued in bounded batches; the high watermark advances only after no eligible rows remain, so an attestation cannot jump over locked or unprocessed work.
7. Every default evidence partition has its own statement immutability trigger for PostgreSQL 14, and parent/child row guards validate exact authorized UUIDs for deletion. Direct child `DELETE`, `UPDATE`, and `TRUNCATE` are rejected outside the retention function.
8. `teardown_pending -> off` is bound to the policy's current teardown cycle, exact policy revision, provider-confirmed absence, completed vectors, and completed operations; historical teardown evidence cannot authorize the transition.
9. Generic policy transitions cannot rewrite schema fields or self-transition. Dedicated configure, promote, and retiring-completion functions use the shared canonical client advisory key, require schema/sentinel readiness and fresh approvals, verify captured/confirmed source high watermarks and provider work, atomically swap active/candidate, mark the prior active schema retiring, and require provider-confirmed retirement completion.
10. Change approval revocation and promotion serialize on the approval and advisory fence. Consumption is append-only and revocation rechecks it, preventing a revocation from committing behind a stale promotion snapshot.
11. PostgreSQL 14 expression/partial unique indexes reserve query usage identity when `operation_id` is null and global daily aggregate identity when `client_id` is null.
12. Terminal operation rows permit only a true no-op update; identity, attempts, timestamps, errors, and expiry cannot be rewritten after confirmation, supersession, or terminal dead-lettering.
13. Operator dead-letter retry, reconcile, resolve, and dismiss actions go through a definer transition that creates an audit event and writes its validated composite audit linkage. Callers cannot provide an optional audit ID.
14. `rank_evidence` and audit details use a recursive allowlist with normalized keys and bounded typed scalar values. Nested or renamed raw query/source text and provider payload fields are rejected.
15. The migration creates only `NOLOGIN NOINHERIT` governor/runtime roles, validates existing roles against privilege escalation flags, transfers search-domain ownership to the governor, revokes deployer membership after installation, revokes `PUBLIC`, and grants the runtime only explicit table/function paths. No unsafe login is created.
16. The guarded database contract uses only dedicated CRM-search variables, requires explicit project/branch/endpoint identities, a direct non-pooled TLS Neon endpoint with the exact test application name, and a non-empty explicit forbidden shared-URL set. Equivalent endpoints and production-like identities are rejected before connection; schema/source emptiness is checked before migration mutation.

### PostgreSQL 14 Behavioral Evidence

The final SQL was applied and reapplied successfully in the isolated local PostgreSQL 14.19 database before the final test-only URL-guard tightening. Manual two-connection and savepoint checks covered:

- legal-hold attachment waiting behind expiry and then failing after deletion;
- approval revocation waiting behind promotion and then rejecting consumed approval;
- valid accepted-operation retry plus cross-key/third-root/successor rejection;
- exact retention manifests, same-cutoff continuation, and final-only watermark advancement;
- direct default-partition mutation rejection and authorized child expiry;
- recursive JSON rejection, audited dead-letter actions, PG14 null identities, and terminal immutability;
- server-computed evaluation evidence and the full paired-bootstrap gate;
- candidate configure/promote/retire flow and provider-confirmed retiring completion;
- `NOLOGIN NOINHERIT` roles, governor ownership, runtime evaluator denial, and definer execution grants.

A later redundant final reapply was interrupted while waiting on leftover local test-database activity. It made no source edit and is not used as evidence; the earlier application/reapplication and behavioral checks above were already green. No further local PostgreSQL inspection was performed after the interruption.

### Final Verification

```text
Vitest focused + relevant regressions: 7 files passed
Tests:                               47 passed, 13 skipped
Guarded database block:              skipped (dedicated URL absent)
ESLint on both owned TypeScript tests: clean
git diff --check:                    clean
```

The repository-wide Node 24 typecheck remains red in broad pre-existing, unowned application/server files; neither owned TypeScript test produced a diagnostic. All commands for this round used the explicit Node 24.18 path.

The final deep read covered all 3,840 migration lines, both test files, the shared fixture, and this report. The security pass specifically rechecked pinned `search_path`, object ownership and grants, dynamic identifier allowlisting/quoting, approval and client advisory fences, immutable evidence triggers, retention authorization consumption, operation/dead-letter transitions, and the Task 5/Task 6 no-capture boundary.
