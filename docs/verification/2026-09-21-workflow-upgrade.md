# Explicit workflow schema upgrade — implementation and verification

Date: 2026-09-21. Implemented locally; no deployment, remote migration, tenant provisioning, runtime rollout, or scheduled email activation performed.

## Contract and reachable execution

Workflow setup has a separate strict `workflow-upgrade-v1` operation. It binds the original native actor/login, complete content scope, account, ready database UUID/name, workflow operation ID, and the installed `collectionOperationId` predecessor. Pins:

- Source collection catalogue: `0feb591f4c5fcb82c9b10204f7e387e83b4eb52eb634ce772f8cad8716ca0cee`.
- Target workflow catalogue: `60631223175cb7e8bf9dca5b08347a192844b8600bd8687e1caa8b60c9f337ae`.

The baseline and collection catalogues and existing migration bytes are unchanged. An existing collection grant cannot authorize workflow DDL.

Dashboard agency/portal `POST /api/{agency|portal}/page-studio/sites/:siteId/workflows/setup` accepts only `{requestId: UUID}`. It derives all authority, discovers the ready database and installed predecessor through the private coordinator, and appends the distinct `content.workflow-upgrade.requested` / `workflow_upgrade` audit intent. Retry the same request ID and original login. Native expiry, logout, actor/membership/site/package changes deny the original operation. The current package policy is the existing schema-manager `builder.collectionSchemas: true`, with business-content module admission and staff editor / portal admin-or-manager plus editor membership. This is installation authority, not authorization for individual booking/email actions.

The endpoint invokes `ProvisioningCoordinator.executeWorkflowUpgrade` -> private executor -> original native `/internal/page-studio/workflow-upgrades/authorize` -> pinned runtime verification -> durable workflow operation -> physical installation. GET reads retained status only, without creating an intent or DDL. Internal and public setup bodies use the existing observed bounded stream reader. Client-provided actor, scope, catalogue, account, database or approval booleans are rejected.

## Durable and physical guarantees

`provisioning-migrations/0008_workflow_upgrades.sql` adds separate immutable identity/request/history and terminal receipt state. Claims last 300 seconds. Original native admission and predecessor ownership are rechecked at provider boundaries. Completion checks the lease token, both application and SQLite clocks, current database reservation, and installed collection predecessor. Unknown provider outcomes retain reserved state; lease-expiry replay reads exact schema and receipt rather than repeating committed DDL.

The customer migration is one D1 atomic batch. A CHECK assertion fences the exact baseline ownership, original migration history, collection predecessor receipt and full pre-migration sqlite_schema. It installs only the reviewed workflow catalogue plus a `workflow_schema_upgrade` singleton receipt with update/delete/replace rejection triggers. Unknown, partial, foreign or altered schemas fail closed; completed readback never recreates missing objects.

Collection upgrade readback recognizes the exact subsequent workflow schema only with a private coordinator callback proving an installed workflow request hash, exact scope/account/database/name, predecessor operation ID and matching immutable physical receipt. No public boolean, arbitrary object list or receipt can opt in. Old baseline/collection-only reads never query the new workflow coordinator table.

## Verification

Focused tests cover:

- Real SQLite/workerd: competing operation IDs; single durable owner; lost provider response and Miniflare restart; lease replacement and SQL-clock expiry; cancellation while provider mutation is in flight; forged receipt; unknown/raced schema rollback; immutable physical/coordinator receipts; missing provenance and disabled predecessor denial; collection replay after owned extension.
- Real D1/R2 runtime preflight and integrated private execution: exact already-active artifact and route receipt; replay without a second DDL batch; no runtime upload; changed native completion, revocation and route linkage denial.
- Real workerd service bindings: coordinator discovery/status/execution -> private executor -> native control transport; environment/account substitution; no unauthenticated HTTP entrypoint; missing workflow policy fails before provider access.
- Golden protocol and native client tests verify exact canonical identity and separate pins.
- Dashboard native PostgreSQL: 82 tests passed against a new disposable localhost database, using isolated per-test schemas. Includes original JWT/portal session ownership, simultaneous retries, package/role/site revocation, loss of acknowledgement and transactional expiry rollback.
- Dashboard HTTP/native unit checks: 21 tests passed, including installed receipt success, substituted receipt failure, original-login reconciliation, bounded-body handler and machine-auth ordering.
- Business-content and sandbox-worker TypeScript checks pass. Protocol/control-client/private provisioning builds pass. Dashboard focused server typecheck traverses existing unrelated Nitro errors; no errors reference the new workflow files (log `/private/tmp/dashboard-workflow-typecheck.log`).

Studio final combined result: **46 tests passed across 6 files**, 36.40 seconds. Targeted Biome (18 files), Dashboard ESLint, and both worktree diff checks pass. Full repository gates belong to parent integration review.

Final Studio invocation: `node node_modules/vitest/vitest.mjs run services/business-content-worker/test/workflow-upgrade-operation.runtime.test.ts services/business-content-worker/test/workflow-upgrade-runtime.runtime.test.ts services/business-content-worker/test/workflow-upgrade-native-contract.test.ts services/business-content-worker/test/collection-upgrade-operation.runtime.test.ts services/control-client/test/workflow-upgrade-authority.test.ts services/sandbox-worker/test/workflow-upgrade-bridge.runtime.test.ts`.

## Release prerequisites and limitations

1. Apply the coordinator's **full existing provisioning metadata migration catalogue**, including new 0008, through the normal reviewed release migration step for the exact environment/account/database. Do not apply tenant workflow SQL manually or append it to collection-v1 setup.
2. Release the private coordinator/executor and Dashboard native endpoints. Existing normal calls do not lazily create tables.
3. Admit a tested already-active exact runtime with explicit `WORKFLOW_UPGRADE_RUNTIME_POLICY` JSON: `{version:1, compatibilityDate, runtimeDigest, sourceDigest, targetDigest}`. Store those exact bytes at `content-runtime/<runtimeDigest>/worker.js`. Existing runtime pins do not opt in; this executor neither uploads code nor relabels old receipts. Collection setup must already be installed and durably owned.
4. An authorized user explicitly POSTs workflow setup with a retained request ID. Missing runtime configuration reports setup pending. GET never starts migration.
5. Email/event dispatch and cron policy remain separate. This change does not enable scheduled sending.

PostgreSQL/native authority, coordinator D1 and provider D1 are separate systems: there is no cross-store atomic revocation fence. Cancellation during a provider commit can leave an installed physical schema and a disabled/uncompleted coordinator operation; tests preserve that fact instead of claiming rollback. Recovery requires an exact retained live grant and lease or explicit reconciliation. Disabled predecessor/provenance causes upgrade readback to fail closed; ordinary collection record APIs are unaffected.

## Diff ownership

Final Dashboard integration consolidates collection/workflow implementation in
`schemaUpgradeContract.ts`, `schemaUpgradeAuthority.ts`, `schemaUpgradeIntent.ts`
and `schemaUpgradeSetupHttp.ts`. Existing public helper exports remain wrappers.
Per-kind schemas, audit namespaces, idempotency prefixes, pins and method names
are retained. Independent comparison against the original six files found no
authorization/replay/receipt regression. After consolidation, 164 actual
PostgreSQL tests and 45 focused native/HTTP/isolation tests passed. See the paired
`2026-09-21-builder-completion.md` for final build limitations.

Studio new files: protocol `workflow-upgrade.ts`; business-content `workflow-upgrade{,-catalogue,-provenance,-operation,-runtime,-executor}.ts`; metadata migration 0008; workflow upgrade operation/runtime/native-contract tests and golden fixture; control-client workflow authority tests; sandbox-worker workflow bridge tests; this report.

Coordinated shared hooks: protocol index; collection physical verifier and operation callback; provisioning coordinator and barrel; control-client method; sandbox private executor. Parent's collection execution APIs, final operation reads and collection list/query fixes are preserved.

Dashboard new files: shared workflow protocol mirror; `workflowUpgradeAuthority.ts`, `workflowUpgradeIntent.ts`, `workflowSetupHttp.ts`; internal authorize route; four agency/portal setup routes; native unit/PostgreSQL/HTTP endpoint suites plus matching fixture; mirrored verification report. No Dashboard UI changes in this task.

## P2 review follow-up: workflow cancellation during collection completion

Review reproduced a stale-provenance result after the physical workflow receipt had been accepted. Three deterministic real-D1 tests were red before the fix: cancellation during the later builder receipt query, the physical verifier's final native guard, and the private executor's final native admission. Each incorrectly returned an installed collection result.

The physical verifier now rechecks its accepted extension receipt after its final guard. The collection operation store retains the exact verified workflow identity/request/receipt and includes that installed proof in every subsequent final SQL read. Consequently the existing private executor's final `store.read` checks workflow provenance together with the current collection operation and ready reservation, without weakening or moving its native authorization. The provenance helper itself finishes on a single joined collection/workflow/reservation snapshot after all asynchronous hashing. Unextended schemas still avoid the workflow table entirely.

All three regressions pass after the fix. The broader focused collection/workflow compatibility suite passes **68 tests across six files** (65.91 seconds), including ordinary collection installation/replay without workflow metadata. Business-content TypeScript and the five changed files' Biome checks pass. No runtime policy, migration bytes, endpoint semantics, or activation settings changed in this follow-up.
