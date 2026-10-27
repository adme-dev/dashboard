# Protected Dissector flow guards

Status: implemented and locally verified in the shared original workspace on 28 October 2026. This report covers the dispatched project/copy/history/template/publishing guard slice and the coordinator's subsequent project-delete, catalogue, asset mutation, compliance and public-review additions. No Git, sibling checkout, deployment, provider request, live database, browser action, customer message or new repository DDL was used. Current-main and release acceptance belong to the coordinator.

## Authority and supported operations

`server/utils/banner/scopedCanvasAccess.ts` exports:

- `assertScopedCanvasAccess(actorId, canvas, projectId?, mode = 'read'): Promise<void>`.
- `withScopedCanvasAccess(actorId, canvas, projectId, mode, callback, target?)`: the callback runs once in `transactionWithoutRetry`, under the same source and authority locks.
- `assertScopedCanvasAccessInTransaction` for already-owned nonretry transactions.
- `assertScopedCanvasLineage` to prevent managed saves/snapshots from stripping immutable source dependencies.
- `assertScopedProjectUnchanged` to fence the preflight project canvas, creator, client and revision before mutation.

The shared detectors select the protected path; they never grant access. The helper reads every actual `banner_dissections` row, locks all jobs in sorted ID order before actor/project locks, checks exact uploader equality, invokes `assertDissectionAccess`, validates persisted source and ingestion schemas, and requires frozen `owner.kind` client/project. A marker must match the persisted source SHA. Each image locator must be canonical and match the exact registry asset/key/attempt and `banner_assets` uploader/client/key/URL/MIME/length. No storage or remote URL is read by this helper. Missing/malformed/legacy ingestion cannot establish scoped ownership. Personal-project scoped sources with `clientId: null` are supported.

An existing target uses fresh `resolveDissectionContext` and source/target client equality. A new protected project resolves the requested client context in the same transaction and cannot copy client-scoped content to personal ownership. Uploader, role, assignment, session, source-project ownership and client changes are checked afresh. The existing authority helper remains the single policy implementation.

| Boundary | Implemented behavior |
| --- | --- |
| Project detail/list | Source gate before canvas/text/thumbnail projection; protected thumbnail suppressed; private no-store. Existing list SQL scope is retained. Any selected protected source denial fails the whole response; rows are never silently dropped after LIMIT/OFFSET. |
| Project creation/duplication | Protected source authorization and insertion in one nonretry transaction; copy preserves canonical locators and markers, creates no public thumbnail and never rebinds original ownership. Duplicate fences the observed source project under lock. Legacy audited creation and QR validation remain. Protected TheBrief deduplication reuse is explicitly rejected. |
| Project PATCH | Preserves omitted per-format markers, rejects conflicting markers or removed lineage, denies client movement and public thumbnails, clears prior thumbnail; source checks, project fence, snapshot/prune and update share one nonretry transaction. Protected snapshot failure aborts the transaction. Legacy write path is retained. |
| Version detail/list | Fresh selected snapshots receive source checks before response; no-store. List reads canvas internally for authorization and removes it from returned summaries. Legacy unprotected version sharing remains unchanged. |
| Named version creation | Compares saved and supplied lineage, reauthorizes both source sets, fences target, then snapshots/prunes in one nonretry transaction. |
| Version restore | Any protected current or selected snapshot rejects with 409 before snapshot or update. Protected restore remains explicitly unsupported. |
| Templates | Supplied markers/locators, saved source projects and preexisting protected template content reject before shared template writes. |
| Schedule / Google / Meta | `assertProjectAllowsUnprotectedFlow` checks saved and supplied content before credentials or effects. Meta loads the published record and performs this gate before the connection. Rechecks precede subsequent provider/storage/mutation steps; guard denials do not create error-intent rows. |
| Project deletion | Fresh write target/source authority; sorted union of source and imported job locks; observed-project fence; changed import set rejects. Detaches `banner_dissections.project_id` and deletes the project in one nonretry transaction. Source/ingestion/delivery metadata survives unchanged. Deleting a frozen source project correctly revokes later access. |
| Email asset catalogue | Fresh no-store query excludes private Dissector/export namespaces and canonical job asset URLs in WHERE before LIMIT. Legacy and QR assets retain their existing client policy. |
| Generic asset PATCH / asset, font, export DELETE | Fresh persisted key/URL checks reject protected namespaces with 409 before metadata mutation, object deletion or row deletion. |
| Creative compliance | Fresh banner asset lookup includes key and URL. Protected target, reference rows and direct model URLs reject before storage/presigning/provider work. Legacy approved-video-source behavior remains. |
| Public review links | Mint requires write access, fresh target authority and guarded insert in one nonretry transaction. Public token GET fresh-loads token/project, sets no-store and rejects protected canvas before comments or response, including previously minted tokens. |

Lineage removal returns 409 with guidance to keep the protected source artboard/marker. It does not weaken source enforcement or silently transfer provenance to a public image.

## Local verification

Node: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node`.

The initial route regression run had 17 failures, demonstrating missing read/mutation/publish guards. Project-delete regressions failed 3/3 before repair; asset/catalogue/compliance regressions failed 7/8 before repair (the existing legacy case passed); review-link/export-delete regressions failed 4/5 before repair (legacy review passed). Additional Google/Meta tests reproduced a transition to protected content after credential loading. The lineage UX regressions failed on the prior 403, then passed with 409 guidance.

Final focused run: **212 passed; 16 PostgreSQL tests skipped without the explicit owned-cluster opt-in**. It covers helper authority, route denials/no effects, legacy reads/writes, QR preservation, TheBrief deduplication, audited legacy creation, email scope, and compliance compatibility:

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
  test/server/utils/bannerScopedCanvasAccess.test.ts \
  test/server/utils/bannerScopedCanvasPostgres.test.ts \
  test/server/api/bannerScopedCanvasFlows.test.ts \
  test/server/api/bannerScopedProjectDelete.test.ts \
  test/server/api/bannerScopedAssetExclusions.test.ts \
  test/server/api/bannerScopedReviewLinks.test.ts \
  test/server/api/bannerProjectWriteAccess.test.ts \
  test/banner/projectFreshReads.test.ts \
  test/server/api/bannerProjectManagedQr.test.ts \
  test/server/api/bannerScopedLists.test.ts \
  test/banner/managedQr.test.ts \
  test/banner/managedQrProtection.test.ts \
  test/banner/thebriefProjectDeduplication.test.ts \
  test/server/utils/bannerProjectGodModeMutation.test.ts \
  test/server/api/bannerPlatformQr.test.ts \
  test/server/api/emailAssetScope.test.ts \
  test/ai/creativeComplianceSourceTarget.test.ts \
  test/ai/creativeCompliance.test.ts --maxWorkers=1
```

Separately, **16/16 actual PostgreSQL tests passed**, applying existing repository schema/migrations only to a newly created, private loopback PostgreSQL 17 cluster. The suite checks its ownership token, loopback URL and actual `data_directory` before any setup. It verifies protected create/copy/PATCH/version flows, exact registered identity, colleague page denial, role/session/assignment revocation without writes, rollback/no replay, two-connection assignment lock blocking, reversed input ordering for multi-source transactions, concurrent PATCH/delete settlement, preserved job metadata after deletion, fresh read-only review-link denial, and 125 newer protected email assets excluded before LIMIT so an older legacy asset remains visible.

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node /private/tmp/banner-canvas-proof.mjs
```

The final cluster `/private/tmp/banner-canvas-proof-9uRsKg` was positively stopped and removed. The runner is a local evidence helper, not a repository migration or deployment artifact. The test file skips unless `BANNER_CANVAS_PROOF_URL`, `BANNER_CANVAS_PROOF_ROOT` and `BANNER_CANVAS_PROOF_TOKEN` identify the runner's owned cluster; it never takes the application's DATABASE_URL as proof authority.

A strict targeted TypeScript check of `scopedCanvasAccess.ts` and its synthetic-DB test passes via `/private/tmp/banner-canvas-typecheck/tsconfig.json`. It uses the actual Neon Pool type with a declaration of the existing transaction wrapper to isolate the helper from Nuxt globals. This is not a whole-repository typecheck. The earlier direct invocation exposed a closure-narrowing error and a fixture property typing error; both were corrected. The broader focused run initially exposed an exact import whitelist in the audited-creation test; its allowlist now includes the new pure detector/authority imports, and its behavior and no-render/no-publish assertions remain.

Vitest emitted the existing Vite native-config `__dirname` warning. No final focused failure remains. Changed source and test files were reread; server imports use the double-tilde alias. No UI forms were changed.

## Remaining boundaries

- Repository-wide searches for `schedule_status` / `scheduleStatus` found schedule admission/cancellation and schema, but **no scheduled banner execution consumer** in this source tree. Admission is guarded; an external or future consumer must run the saved-project exclusion at execution before credentials/storage/provider effects. This absence was reported to the coordinator early; no new scheduler was invented.
- The full repository suite, full Nuxt typecheck/build, hosted storage privacy, browser behavior, queue/native execution, provider delivery, deployment and release-currentness are outside this worker's evidence. The coordinator owns integration/build/release acceptance.
- Import/export transaction ordering is coordinated with the owning workers. This slice proves its multi-source helper and concurrent PATCH/delete locally; it does not claim a single cross-worker import/export/delete stress suite was run here.
- Scope admission must remain subject to the overall ingestion/delivery/export gates in `INGEST-RESULT-DELIVERY-PLAN.md`. The source helper does not itself enable scoped ingestion.
- An authorized prior download or already decoded browser image cannot be recalled. No DRM claim is made.
