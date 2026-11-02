# General CI remediation — 2 November 2026

Scope: the fourteen failures in run `41414219523`, job `125174220707`, at
`1b73ccff82e411d5ed583bdbcc330c4c2d302c2d`. Only the five assigned test files
and this evidence note were edited by this worker. No production/native source,
prepared browser acceptance file, external inventory fixture or existing inventory
document was edited. Coordinator approved the audited fixture corrections in
`msg_d8a2ce88b097`.

## Failure before and proof after

Runtime: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node` (`v24.18.0`).
Existing shared `node_modules` only; no install or dependency mutation.
Commands ran in `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node node_modules/vitest/vitest.mjs run \
  test/components/emailEditorBlockWrapper.test.ts \
  test/unit/emailComposerClientSave.test.ts \
  test/server/api/emailClientScope.test.ts \
  test/config/godModeGateInventory.test.ts \
  test/config/godModeIsolationInventory.test.ts --cache=false --maxWorkers=1
```

Before any edits: **5 files failed; 14 tests failed, 41 passed (55 total)**.
All failure classes matched the retained actionable CI log: three missing store
`document.value` failures, eight missing composer auto-import failures, one invalid
request fixture reaching fresh publisher authentication, and two stale inventory
snapshots. Local before log: `.verification/general-ci-remediation-20261102/general-ci-remediation-before.log`.

After repair: **5 files passed; 62 tests passed**. The seven added cases comprise
one container condition-label case, five fresh publisher denial cases, and one
complete authoring route/authority inventory case. Local after log:
`.verification/general-ci-remediation-20261102/general-ci-five-after.log`.

Expanded run included those five files plus:

- `test/unit/emailDesignAccess.test.ts`
- `test/unit/emailDesignLegacyModulePublisher.test.ts`
- `test/server/api/emailConditionDefinitions.test.ts`
- `test/server/api/emailMergeDefinitions.test.ts`
- `test/unit/emailDesignConditionRoutes.test.ts`
- `test/server/emailDesignConditions.test.ts`
- `test/components/edmConditions.test.ts`
- `test/app/edmConditions.test.ts`
- `test/app/edmMergeAuthoring.test.ts`

Same Node/Vitest command and flags: **14 files, 108 tests passed**. This covers
fresh session/role/scope changes, publisher versus designer authority, condition
route denial and save protections, catalog tenancy and reactive authoring.
Local log: `.verification/general-ci-remediation-20261102/general-ci-regressions-after.log`.

Scoped ESLint on the five owned tests and `git diff --check` passed. The existing
Vite warning about `__dirname` and its future native config loader remains;
it is unrelated to these failures.

## Fixture contracts retained

- `emailEditorBlockWrapper.test.ts`: provide the builder's real document-ref shape,
  reset it between cases, stub the rendered Nuxt `UBadge`, and verify a named
  condition appears on a container but does not appear on a Text block.
- `emailComposerClientSave.test.ts`: explicitly inject merge/condition authoring
  dependency fixtures, real Vue `watch`, preview refs and brand action refs into
  the extracted source boundary; dispose watchers through `effectScope` after
  each test. Save/load/client ownership and leave-guard assertions are retained.
  No optional production guard or app-context fallback was introduced. Separate
  authoring suites exercise the real composables in their intended context.
- `emailClientScope.test.ts`: retain the actual production publisher helper and
  `designAccess` implementation; mock only session validation and fresh DB results.
  The success request has a bearer token and a current custom role containing
  MANAGEMENT and CREATIVE, with the same actor and server-resolved assigned client.
  Default current authority stays ordinary client staff. Missing token, revoked
  session, mismatched actor, scoped CREATIVE-only designer and read-only publisher
  each reject before module persistence. Legacy create/update/delete regression
  tests additionally retain stored-target and canonical-row protections.

## Baseline versus branch

Read-only Git-object comparison used current local `origin/main`
`7b8818c83d85a58caa96879a65ddbd0f0660a173` and branch head `1b73ccff8`.
`git diff origin/main...HEAD -- <five assigned tests>` is empty: these five
fixtures were inherited unchanged. `git show origin/main:<path>` confirms the
baseline wrapper has no condition-label document access, baseline composer has
no merge/condition authoring setup, and baseline legacy module POST has no fresh
publisher call. These are branch integration fixture regressions, with intended
production authority retained. No production counterexample was found.

The existing inventory functions were evaluated against Git blobs for each
revision without checkout, touching another worktree, changing the classifier or
altering the exclusion list. Main exactly matches every old snapshot:

| Metric | origin/main | branch head | Delta |
| --- | ---: | ---: | ---: |
| Direct gate rows | 1720 | 1726 | +6 |
| API route files | 2316 | 2336 | +20 |
| Mutation route files | 1263 | 1277 | +14 |
| Inline guarded mutations | 406 | 412 | +6 |
| Inline guarded mutations calling transaction() | 55 | 55 | 0 |

No direct gate row was removed or reclassified. Six exact added rows are the
`const user = await requireWriteAccess(event)` line in conditions and merge-tags
`index.post.ts`, `[id].patch.ts` and `[id].delete.ts`, under
`server/api/agency/email/`. All retain the existing lexical
`application_governance_bypass` classification; that classifier label does not
register an actual God mode mutation bypass. The test pins every full path/line/class.

Class counts, including the inventory's retained historical offsets, are
identity 135, provider 223, application governance **1635** (was 1629), ordinary
301, unrelated configuration 431. Main SHA-256:
`cb41911da1dc0bf50bbad1ddf534de6f8313448d492bedd7d524f600b548e4cb`;
branch SHA-256:
`9f28f7a4004d448a7b9ef6e0f907862d501cb654c94493413beb9bd23767352d`.

## Exact added routes and authority audit

Every added route is pinned in `godModeIsolationInventory.test.ts` together with
its direct or delegated authentication boundary. All have no capability bypass
or mutation-family registration. Full added route set:

| Path | Authority owner / retained gate |
| --- | --- |
| `server/api/agency/email/conditions/[id].delete.ts` | requireWriteAccess + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/conditions/[id].patch.ts` | requireWriteAccess + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/conditions/index.get.ts` | requireAuth + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/conditions/index.post.ts` | requireWriteAccess + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/merge-tags/[id].delete.ts` | requireWriteAccess + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/merge-tags/[id].patch.ts` | requireWriteAccess + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/merge-tags/index.get.ts` | requireAuth + assertEmailClientAccess; persistence uses client scope |
| `server/api/agency/email/merge-tags/index.post.ts` | requireWriteAccess + assertEmailClientAccess; persistence uses client scope |
| `server/api/email/design/assets/publish.post.ts` | designLibrarySession: real token, feature gates, fresh scope; operation-specific designer/publisher authority |
| `server/api/email/design/conditions.get.ts` | Real token + validateSession + assertFreshDesignAccess; mutation origin guard; stored draft scope |
| `server/api/email/design/conditions.post.ts` | Real token + validateSession + assertFreshDesignAccess; mutation origin guard; stored draft scope |
| `server/api/email/design/designer.post.ts` | Real token + validateSession + assertFreshDesignAccess; mutation origin guard; stored draft scope |
| `server/api/email/design/drafts/[id]/brand.get.ts` | designBrandSession: real token, feature gates, fresh scoped designer; policy locks require publisher |
| `server/api/email/design/drafts/[id]/brand.post.ts` | designBrandSession: real token, feature gates, fresh scoped designer; policy locks require publisher |
| `server/api/email/design/drafts/[id]/locks.post.ts` | designBrandSession: real token, feature gates, fresh scoped designer; policy locks require publisher |
| `server/api/email/design/history.post.ts` | designLibrarySession: real token, feature gates, fresh scope; operation-specific designer/publisher authority |
| `server/api/email/design/modules.post.ts` | designLibrarySession: real token, feature gates, fresh scope; operation-specific designer/publisher authority |
| `server/api/email/design/modules/[moduleId]/[revisionId].get.ts` | designLibrarySession: real token, feature gates, fresh scope; operation-specific designer/publisher authority |
| `server/api/email/design/templates.post.ts` | designLibrarySession: real token, feature gates, fresh scope; operation-specific designer/publisher authority |
| `server/api/email/design/templates/[templateId]/[revisionId].get.ts` | designLibrarySession: real token, feature gates, fresh scope; operation-specific designer/publisher authority |

Delegated source owners audited: `designLibraryHttp.ts`, `designBrandHttp.ts`,
`designAccess.ts`, `designModules.ts`, `designTemplates.ts`, `designHistory.ts`,
`designLibraryOperations.ts`, `designBrand.ts`, `designConditions.ts` and
`designHandoffs.ts` under `server/utils/email-marketing/`. They retain stored
owner/scope checks and fresh read/designer/publisher callbacks. Library and brand
mutations check the configured application origin before body effects; publisher
requires ADMIN or MANAGEMENT together with CREATIVE, independently of ordinary
client assignment. Existing legacy module POST/PATCH/DELETE now delegate their
additional genuine-token/current-publisher check through
`designModulePublisher.ts`; their inline write/client checks remain.

The unchanged 55 count is lexical: service-owned transactions and
`transactionWithoutRetry` are outside this inline `transaction()` statistic.
It is not a claim that delegated operations are unguarded or non-transactional.

## Boundaries and remaining work

This is local scoped regression evidence, not a full-suite/hosted/browser/native
acceptance or release receipt. No stage/commit/push, dependency install, build,
deploy, DB/provider/browser operation or CI mutation was performed. Parent owns
integration and the exact merged-head full CI rerun. No remaining blocker exists
inside this assigned fixture scope; re-audit inventory assumptions if parent
integration changes scanned application sources or adds routes.
