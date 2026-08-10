# Task 6 Report — Seed, Validate, and Activate Durable Capture

## Result

- Status: `DONE`.
- Intended commit: `feat(crm-search): activate durable source capture`.
- Scope: migrations 351/352, the three Task 6 tests, and this report only.
- No provider call, Cloudflare/Neon resource action, network connection, deployment, shared/production database access, or use of `DATABASE_URL` occurred. Runtime database verification used only a disposable local PostgreSQL 14 Unix socket with TCP disabled.

## Implemented Contracts

- Migration 351 transactionally fences installation with finite lock/statement timeouts, backfills only zero source revisions, installs one compile-time installation scope, and seeds an exact immutable `crm-search-v1` schema and conservative Cloudflare rate card.
- The schema/provider and rate-card contracts are SHA-256 validated in SQL. All four shared Task 7 fixture projections and hashes are recomputed by PostgreSQL before commit.
- Global control and every current client policy are validated halted/off/unconfigured, unapproved, unready, and zero-budget. Migration 351 installs no source/client capture trigger and performs no provider or rollout work.
- Migration 352 closes the inter-migration write gap under source/client table locks, reconciles gap clients/revisions, takes canonical shared client advisory fences before governed policy locks, and snapshots current source rows into the schema-neutral latest-intent set.
- Three source-specific pinned `SECURITY DEFINER` triggers own revisions: insert starts at one, relevant projection/client/deletion updates increment, irrelevant/application-supplied revision changes preserve the old revision, soft delete/restores map to delete/upsert, and physical delete emits a surviving delete intent.
- Client moves acquire OLD/NEW shared advisory locks in UUID order and emit distinct OLD-delete and NEW-upsert events at the same new source revision. Intent replacement uses revision/event-sequence CAS, bumps claim generation, and clears stale claim/retry/error state.
- Agency-client deactivation/hard delete takes the matching exclusive client lock, disables the client policy, and writes an independent teardown plus deterministic ledger manifest and durable document/provider-admitted vector snapshot before cascades. Teardown/vector/dirty evidence has no client/source cascade and survives source, policy, and client deletion.
- Trigger installation is last, reapplication replaces exactly four triggers, and pre-commit catalog verification checks relation, events/timing, function identity/schema, `SECURITY DEFINER`, pinned search path, and enabled state.
- Governor membership, schema-create privilege, temporary agency-client read access, and deployer function execution are revoked before commit. Capture entry points are not executable by `PUBLIC` or the runtime role.

## TDD Evidence

The three Task 6 tests were created before either migration. The required RED command failed with 18 expected assertions because migrations 351/352 did not exist; database-target guard tests passed and the guarded runtime block skipped without its dedicated variable.

Incremental GREEN was established for migration 351 first (8/8), then migration 352 (10/10), then the combined guarded/static suite.

## PostgreSQL 14 Behavioral Evidence

An ephemeral PostgreSQL 14.19 cluster was initialized under `/private/tmp`, exposed only on its private Unix socket, and stopped automatically. Migrations ran as a non-superuser `CREATEROLE` source/schema owner; a separate local superuser connection observed governed state so superuser privileges could not mask migration ACL errors.

The 9/9 runtime suite passed:

- migrations 350/351/352 each applied twice where declared idempotent;
- no trigger existed after 351 and exactly four verified triggers existed after 352;
- governor/deployer/runtime ACLs and pinned definer ownership were closed after install;
- rollback removed both source and dirty intent;
- supplied revisions, irrelevant updates, relevant updates, claim reset, revision/event CAS, soft delete, restore, and physical delete behaved exactly;
- client move produced dual ordered intent;
- an exclusive candidate-validation/schema-role-swap transaction blocked a second-connection source write until commit;
- opposite A→B/B→A moves on two independent non-superuser connections completed without deadlock;
- deactivation captured document and provider-pending vectors, disabled the policy, and hard deletion preserved teardown/vector/delete-intent evidence after the ordinary policy and client/source rows disappeared.

## Parity and Quality Gates

- Task 7 fixture/pure parity: 9 files, 106 tests passed.
- Migration 350 plus Task 6 static/guard gate: 4 files, 51 tests passed and one local-database block skipped when its dedicated DSN was absent.
- Final isolated PostgreSQL 14 gate: 9 tests passed.
- Node 24 ESLint over all three owned TypeScript tests: clean.
- No owned-path TypeScript diagnostic was observed; Vitest compiled and executed every owned test.

## Deep Review

Every owned SQL/test file and the shared Task 7 fixture was reread end-to-end across correctness, role/ACL security, lock ordering, idempotency, performance bounds, and rollback behavior.

The review found a privilege-ordering defect that a superuser-only migration test would have hidden: the first 352 draft read governed rows and managed governor-owned function ACLs after leaving the governor role. The migration was reordered so governed reads/ACL changes execute as the governor, trigger creation uses only a temporary narrow deployer grant, and the runtime harness now proves installation as a non-superuser owner.

The review also bound the installation snapshot to advisory-lock-before-policy-lock order, expanded exact zero/off validation, made teardown policy updates semantically idempotent, bound ledger hashes to scope/client identity, verified claim fencing/CAS at runtime, and strengthened the promotion and teardown assertions.

## Remaining Concerns

- None within Task 6. Provider execution and any rollout/activation remain deliberately outside these migrations and stay disabled by the seeded defaults.
