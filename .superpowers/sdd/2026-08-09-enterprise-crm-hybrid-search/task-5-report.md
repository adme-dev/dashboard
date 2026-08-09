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
