# Template successor publication UI — 3 November 2026

Task `task_f5dcac939ee7`, dispatch `ctx_591bdd08ca9a`. This is the bounded visible 08c publication slice against the ready strict `revise-template` contract. It adds an explicit choice and review to the existing library panel and adapts the existing builder publication handler. It does not close 08c or claim actual same-T/R2, native, hosted or release acceptance.

Read the approved publication/successor reports and the stable-template/review requirements in the original spec. The frontend-design skill was read at the coordinator's official fallback path before form changes. The existing dashboard hierarchy, semantic colors, Nuxt UI v4 fields, container grid and bounded scroll owner were retained; no new modal or visual redesign was introduced.

## Behavior and existing owners

- **New template** remains the default and still sends the existing `publish-template` command. The existing full-template action now opens inline compiled review before explicit publication.
- **New version of existing template** loads the existing authorized `/api/email/templates` catalog. Choices require published template kind, schema 1, complete UUID owner/document/head and exactly the saved source's stored client scope. A client source cannot revise a shared target, and a shared source cannot revise a client target. There is no scope reassignment control.
- The selected template name and immutable revision are captured from the displayed catalog selection. Refreshing choices does not substitute a newer head into that selection or its review. If a newer version is listed, the panel explains how to clear/reselect it for a new review. Pending actions disable target browsing and catalog refresh.
- **Review full template** reads the saved source's exact current UUID through the existing `preview-revision` history path, with matching document/head/revision and equivalent canonical source required. The inline review displays destination identity/name/reviewed current revision, saved source head, publication name, compiled preview and included overrides. The preview iframe keeps the existing empty sandbox and no-referrer policy.
- All local override paths must be explicitly checked before review. A further checkbox confirms the compiled preview and included overrides before **Publish new version** or **Publish full template**. Changes to metadata, source or selection invalidate review; local dirty/blocked state and stale preview responses cannot publish. Cancel and browsing issue no publication request.
- The local event carries the exact reviewed request and a client-only saved-source snapshot. The builder rechecks publisher discovery and exact source document/head/snapshot, then passes only the strict request to the existing `flow.template`. The snapshot, canonical policy, actor, HTML and document payload are not sent to the publication API.

The successor request is exactly:

```ts
{
  command: 'revise-template',
  draftId, expectedRevisionId,
  templateId, expectedTemplateRevisionId,
  name, category, includedOverridePaths
}
```

The unchanged flow adds its original `version`/`operationId`, uses the existing `/api/email/design/templates` endpoint, and verifies the exact immutable published receipt. The server continues to derive all canonical content and enforce fresh source/target rights, CAS, asset/dependency readiness, scope and atomicity. No second publication engine, endpoint or store was added. The new helper is types only and emits no runtime code.

Both the ordinary library slideover and the native library slot use the same publication adapter. Both send reconciliation through the existing `reconcileDesignAction`, preserving receipt handling and native reopen behavior. The main slideover additionally refuses dismissal while a result is pending. New fields and actions stay disabled during busy/unknown outcomes; a denied replay still retains the exact original payload/operation. Reconciliation never promotes to a newer catalog/source head or creates a new owner/operation automatically.

Publishing a library version does not apply blocks or metadata to the composer, advance its campaign/source head, change its pin or add an Undo. Existing module, copy, native capture/Apply/save and ordinary staff behavior retain their original owners. Staff without trusted publisher discovery see no publication choice. The panel displays the existing flow's actionable refusal message locally.

## Intentional source deltas and protected freeze

Exactly two existing UI files changed:

- `EdmDesignLibraryPanel.vue`: inline choice, catalog selection snapshot, compiled review/override confirmation, pending reconciliation surface and refusal display.
- `EdmFlyhubBuilder.client.vue`: validate/forward the reviewed strict command, bind both panel instances to existing reconciliation, and retain the library panel while pending.

The builder previously frozen at `a897ff8119aebb6b1fdc2b4b2035592fd0e1637defee0fecd5cd9f7642df7035` is intentionally superseded only by these UI changes. Its exact before-copy and bounded diff are retained. The panel before-hash was `9c8c0bd68f16c0a945b55effc594876bead3a22a96609e70a2bb3c331f38e38f`. One types-only helper and one new focused test are the other owned source paths.

All **141** recorded protected paths match before/after: prior evidence/reports, all five P2 review-fix source/test files, shared/server template publication contracts, template metadata service and migration 499. The old freeze manifests/evidence were not rewritten. In particular, `useEdmDesignRoundtrip`, design handoffs/content route, campaign PG/app tests and the backend successor files were not edited. `protected-before.json`, `protected-after.json`, `source-deltas.json` and `source.diff` record the boundary.

Migration 499 remains a separate parent gate. The observed protected repair source is `94e9c1fe811e532dc3bc1d9602ebdfaafca1acbb2eff378346acb6502094ea93`; this worker neither independently accepts it nor applies it to any database. No configured 499 or activation claim follows from this UI work.

## Verification

Evidence is under `.verification/template-successor-ui-20261103/`. Node `24.18.0` and existing dependencies were used read-only.

| Check | Result | Evidence |
|---|---|---|
| New real panel/adapter interaction cases | **11 passed, zero skips**; included in final matrix | `green-reviewed.log`, new focused test |
| Component, selection, toolbar, native panel/reopen/recovery, campaign, template, REST/MCP and audited gate/isolation regressions | **627 passed, 65 files, zero skips** | `regressions-verified.log`, `run-regressions.sh` |
| ESLint across all four owned source/test paths, compared with exact pre-slice copies | **0 new errors/warnings; 0 retained baseline diagnostics** | `lint-verified.log`, `lint-delta.json`, `lint_delta.py` |
| Vue/TypeScript for both changed SFCs, helper and new test with existing Nuxt declarations | **0 owned diagnostics**, tool exit 2 for **70 unowned diagnostics** | `types-verified.log`, `types-summary.json`, `vue-tsconfig.json` |
| Protected source/evidence and exact final source stability | **141 unchanged protected paths**, four source hashes stable across final checks | `protected-*.json`, `source-before-final.json`, final manifest |

The new cases mount the actual panel, interact with rendered fields/buttons and use the real flow. They compile the actual builder publication/execution/acceptance/reconciliation declarations with bounded composer and I/O fixtures; they do not copy those implementations. Nuxt UI rendering and server transport are fixture adapters, so this is neither a full Nuxt shell nor actual API/native/browser acceptance.

The cases cover default new publication, exact successor request and receipt, same-client/shared eligibility with independently valid UUID negative cases, malformed/legacy/draft/incomplete targets, no publisher UI for staff, source/head/metadata review binding, compiled preview identity and canonical key-order equivalence, exact local overrides, cancel/browse without publication, stale target/source/local dirty refusal, unchanged composer content/head and no Apply/Undo. Lost-reply replay keeps the complete original request after catalog/source advance and a later 403, blocks publication/cancel controls, then reconciles through the real existing builder handler.

Meaningful reds are retained:

- `red-component.log`: six cases failed because the publication choice/review did not exist.
- `red-review-binding-clean.log`: malformed catalog identity was admitted, and equivalent canonical preview key order was incorrectly refused; nine other cases passed. Strict catalog identity checks and the existing canonical JSON comparison resolved both.

`red-review-binding.log` additionally records an initial fixture callback's uncaught 403. The test now invokes the actual builder reconciliation handler, which retains/catches the pending outcome correctly; final runs have no unhandled errors. Early unresolved thumbnail/image-picker rendering warnings were removed by declaring those unrelated fixture rendering boundaries. Formatting failures and their fixes remain in lint iteration logs. No tests were excluded, rewritten to bypass a refusal or skipped to obtain the final result.

Reproduce from the actual repository root:

```sh
bash .verification/template-successor-ui-20261103/run-regressions.sh
python3 .verification/template-successor-ui-20261103/lint_delta.py
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  node node_modules/vue-tsc/bin/vue-tsc.js --noEmit --pretty false \
  -p .verification/template-successor-ui-20261103/vue-tsconfig.json
```

Scoped checking is not a clean full-repository typecheck. Existing generated Nuxt declarations were read only; no prepare/install/build occurred. Tests dispose the mounted apps and reset DOM/global fixture state. No database/schema or real HTTP/provider/browser resource was acquired, so no database cleanup was necessary or attempted.

## Review and remaining gates

Reviewed panel review/selection state, metadata/source invalidation, exact expected-head forwarding, both builder mount points, publisher/dirty/pending guards, unchanged capture/Apply/reopen boundaries, immutable receipt use, strict API payloads, form labels, semantic styles and scroll ownership. No frozen P2 source, backend, migration, native/pins, parent harness, workflow, public copy or ledger change occurred. No Git, actual API, SQL/configured DB, browser, CI, native/full Pages build, provider/send, install or deployment command was run.

The exact bytes are ready for independent review. Backend 499 independent recheck and configured application/content-preservation receipt, final integrated CI and raw/gzip budget, matching native package and actual same-T/R2 flow, ordinary employee/client and hosted acceptance remain parent-owned gates. New UI alone does not close 08c, and this report does not activate or release it.

## Final source hashes

The final manifest records these hashes, this report, before/after deltas, protected paths and executed evidence.

| Source/test path | SHA-256 |
|---|---|
| `app/components/email/builder/EdmDesignLibraryPanel.vue` | `0d707dad4b0f10d8395f6aa0d3c4bb12c86089de38f7f9e5fc00123ac58e7129` |
| `app/components/email/builder/EdmFlyhubBuilder.client.vue` | `96b6682bea992189c1aa2b4097357c2519d5c740391a094947315817d0692eeb` |
| `app/utils/edmTemplatePublication.ts` | `068c89205cbb5a43c2c74c4d10716b5cb85a9b1144c3aa85f955909139f7f6f1` |
| `test/components/templateSuccessorPublication.test.ts` | `551f5697a881c277e7b152e347525f723179f30e24f258afd2968d9d7e43a747` |
