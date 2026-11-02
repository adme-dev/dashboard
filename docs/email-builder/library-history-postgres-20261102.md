# Canonical library/history: PostgreSQL integration evidence

Date: 2 November 2026 (Australia/Melbourne). Worker task: `task_0c9462fb0b28`, dispatch `ctx_763e48631ee0`.

Seven integration tests executed and passed against the assigned disposable PostgreSQL fixture; none were skipped. No production defect was observed within these cases.

## Source and ownership

- Target candidate: `2636b6fafab212c6ca9f7736ae7fa6257427f911`.
- Workspace: `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`.
- Observed branch/HEAD: `adme-dev/figflow-authoring-20261102`, `f6148340322de2ce7d067f22cba121e07a3cfa31` (candidate is present as parent-owned staged changes).
- A working-tree comparison against the candidate returned no differences for `designTemplates.ts`, `designHistory.ts`, `designLibraryOperations.ts`, `designModules.ts`, their shared template/history contracts, or migrations 491–496.
- This worker created only `test/integration/emailDesignLibraryHistory.database.test.ts` and this report. Existing roundtrip integration tests, production files, index/staging, branches, native files, providers and deployments were not changed by this worker.
- This is local candidate evidence, not a current-main integration or release receipt. No fetch, merge, commit, install, full build or deployment was performed.

## Isolation and migration execution

Connections use only `FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered`, port `55483`, user `figflow_test`, database `figflow_design_test`. The test rejects any other supplied socket and never resolves a configured application database connection.

Each run creates a UUID-suffixed schema below PostgreSQL's 63-byte identifier limit. Every connection's search path contains only that schema, without a `public` fallback. Minimal synthetic owner tables include the actual library SQL columns/defaults: template UUID default, `name`, `folder_name`, `created_by`, subject/preview, body projection and owner scope; equivalent module/asset/campaign prerequisites are included.

The test reads and executes the real migration files 491, 492, 493, 494, 495 and 496 in order, twice (12 executions). It uses real PostgreSQL transactions, advisory/row locks, foreign keys, immutable triggers and the deferred committed-head constraint. Teardown drops only this run's schema and verifies its absence in `pg_namespace`.

Final run schema: `figflow_library_history_1793606035213_97674875a8df4574`; teardown confirmed removal. No customer rows or configured database were accessed.

## Covered behavior

1. **Migration repeatability:** all six real migrations execute twice; immutable, parent and deferred committed-head triggers exist with the expected deferral settings.
2. **Publish → immutable template → draft copy:** real module publication/insertion, verified synthetic registered PNG publication, and template publication/copy preserve the entire canonical payload, block/node/field lineage IDs, policy/locks, brand snapshot, module instance IDs, asset descriptor, subject and preview. The module's head advances before template publication; both published template and copy retain the older exact pin. Owner name/category/kind/creator and rendered projections are checked; publication/copy replay is exact, source revisions remain unchanged, stale source-head CAS fails and direct published HTML tampering is rejected by the real trigger.
3. **Successor restore:** restores historical content and metadata as a new revision parented to the former head, keeps all prior rows byte-for-byte equivalent at SQL readback, maintains the current owner projection and lists the actual parent chain. Direct revision update/delete, head rewind and an orphan INSERT reaching COMMIT are rejected with PostgreSQL `55000`; the failed transaction leaves no revision behind.
4. **Concurrent stale restores:** a barrier makes both independent PostgreSQL connections begin before either command executes. Exactly one succeeds; the other receives `REVISION_CONFLICT`. There is one successor, one additional receipt and no effect from a subsequent stale command.
5. **Unknown commit reply reconciliation:** an injected transaction wrapper performs a real COMMIT and then throws before returning its result. After another restore advances the head, replaying the original operation returns its original immutable receipt without appending or rewinding. Changed command reuse fails, receipt deletion is trigger-blocked and revoked authority prevents replay.
6. **Current policy:** restoring historical content retains current restricted grants and current brand snapshot. A preview of incompatible protected content reports `EDIT_FORBIDDEN`, and the corresponding restore leaves snapshots, receipts and head unchanged.
7. **Shared actor/action namespace:** actual asset and revision receipts reject action reuse in both directions. Barrier-synchronized asset publication versus restore yields exactly one committed effect and one `IDEMPOTENCY_CONFLICT`; SQL confirms one receipt across both tables. Another authorized actor may independently reuse an action UUID.

## Reproduction and final output

Node: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node --version` → `v24.18.0`. Existing dependencies were used.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered \
pnpm exec vitest run test/integration/emailDesignLibraryHistory.database.test.ts \
  --cache=false --maxWorkers=1 --reporter=verbose
```

Final result (exit 0):

```text
✓ applies migrations 491–496 twice and retains real immutable/deferred triggers
✓ publishes and copies the exact immutable design, IDs, policy, old module pin, asset and metadata
✓ restores as a new successor with historical metadata, immutable snapshots and a current projection
✓ allows only one concurrent restore from a shared head and rolls back the stale contender
✓ reconciles a committed restore with a lost reply after a later head without another append
✓ enforces current grants/brand on restore and leaves no effect when policy blocks history
✓ rejects cross asset/revision action reuse in both directions and serializes a concurrent collision
Dropped isolated PostgreSQL schema figflow_library_history_1793606035213_97674875a8df4574; migration executions: 12

Test Files  1 passed (1)
     Tests  7 passed (7)
  Start at  18:53:52
  Duration  3.35s
```

Scoped lint also passed (exit 0, no output):

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
pnpm exec eslint test/integration/emailDesignLibraryHistory.database.test.ts --no-cache
```

Vitest printed the existing Vite warning about `__dirname` in `vitest.config.ts` and the future native config loader; this did not fail execution. Development attempts exposed and corrected only new-fixture syntax/schema-name-length/style issues before the final successful run.

## Limits and next owner

- PostgreSQL SQL and transaction behavior is real, using the injected `pg.Client` adapter rather than the deployed Neon transport. This does not establish hosted database/transport behavior.
- Reply loss is simulated immediately after a confirmed real COMMIT; a severed socket or genuinely ambiguous server COMMIT outcome was not induced.
- Namespace exclusion is exercised through the production library command boundaries and advisory-lock protocol, not asserted as a database-wide cross-table constraint against arbitrary direct writes.
- Authority callbacks and asset storage are synthetic. The existing real local renderer fixture runs, but this does not prove employee RBAC, HTTP route behavior, R2 delivery, native/WASM behavior, browser UX, send/schedule behavior or customer acceptance.
- Fixture successor setup uses the production append/render helpers plus a trigger-validated owner UPDATE to create deliberately different metadata and policy states. It does not claim coverage of every editor command that could produce those states.
- The suite is opt-in and skips when the socket environment variable is absent; the recorded acceptance command supplied it and executed all seven tests.
- Full production-schema migration compatibility, global lint/typecheck, production deployment and release verification remain with the parent. Both new files are left unstaged and uncommitted for parent review/integration.
