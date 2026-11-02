# Native library browser acceptance — frozen9f runtime

**PASS for the single bounded full local journey:** `test/integration/emailNativeLibraryWorker.database.test.ts` executed **1 test / 1 file passed**, exit0, **26.48 seconds**, Node24.18.0. This used the actual matching native41465049486 WASM, frozen9f full builder/store/flows, actual private Workerd, Miniflare R2, canonical renderer, and an owned disposable PostgreSQL schema. No product source was changed in this execution.

The previously failing final same-head assertion is retained and passed: detached revision and reload → Edit in FigFlow revision are both **`478a8458-c74d-497c-8934-1867ed3c73b4`**. Independent evidence inspection confirms the entire detached and reopened readback snapshots are equal, including metadata. This closes that counterexample for this fixture and frozen source, without asserting hosted or general product acceptance.

## Executed source and supplied provenance

| Input | Exact value |
|---|---|
| Frozen application/workflow commit | `9f09d3f874e37e42bf72594efa0e404c781debf5` |
| Actual native CI checkout | `ec7ac47a551f573389c67787f26aa3df0e492555` |
| CI checkout parents | `052eefaf992b8a6bd419b069f544c6aec7da64bb`, `9f09d3f874e37e42bf72594efa0e404c781debf5` |
| Matching native CI | `41465049486`:32 engine /9 bridge /8 UI;81 named total, all named and summary results successful |
| Frozen source archive | `b6b8c5cb0ed845a7b446c67e76f58c8b8d71acb5bcbcc3b5bf4aeef16033a94c`; all6,851 captured source files rehashed |
| Actual private Worker | `df443e855bca7ef090cef5ff34c50e6da1f688f0ae286165696735b02165f89c`;1,343,769 bytes |
| Actual canonical renderer | `1a095948fe07110d50b4994871c9d381eb2df1454f701e63a5bdfebb3536915b`;733,961 bytes |
| Native ZIP | `d81ccce0f6ada158df8835c8d8872efbc201c213f4024efd42ece58132e8a579` |
| Actual observed WASM response | `18a31d0079c72f0ed07bb678c0ca548098c81d06c8bf05deb94c25c782457c59`;23,508,735 bytes |
| Served native JavaScript | `01b9294e5f8eefc6cedbeed9be1210385080b2b102da2051abd2ce32009f501c` |
| Served native index | `bc0505ce6062b9fda44459e9bdc2a50a039cc701c3d9aab6b712c0f8aa708dc2` |
| Served relay | `f433cee45f211b8fb21587626c11af07411689cfcf4878f3a958a5beec31ea7d` |
| Actual fixture browser bundle | `9ccee4e7bb7421c17f689519e63a18b114695f10969818f8b202b091f1c644a2` |
| Combined runtime/package receipt | `6cb7cdbe789e82e40c8327f782f5b0632c7072f262bcf7d71852b2795f6fa1cb` |
| Read-only pointer/keyboard plan | `3ade0f3859a71f6891d02a90848b7f5bdced4fb23b5e7452e4712afb44bd3a56` |

The matching [package receipt](../../.verification/ci-followup-9f09d3f87/package-directory.json), [checkout provenance](../../.verification/ci-followup-9f09d3f87/checkout-provenance.json), [native summary](../../.verification/ci-followup-9f09d3f87/native-test-summary.json), native46/46 and package56/56 hash-validation records were read and checked. Actual ZIP/WASM and all frozen runtime bytes were independently hashed. These are supplied CI results, not native tests rerun here; the parent22-check private Worker admission receipt was validated, not recounted as browser acceptance.

Package: `.verification/ci-followup-9f09d3f87/browser-package/unpacked/figcraft-web-0.11.2-edm2`. Worker and renderer: `.verification/frozen-email-runtime-9f09d3f87/`. The [combined receipt](../../.verification/figflow-native-library-browser-9f09d3f87/inputs/receipt.json) includes native provenance-file hashes, six migration hashes and frozen-source receipt hashes. Browser source is compiled from committed9f files, excluding ongoing dirty backend review fixes. Actual runtime [source receipt](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/source-receipt.json) records77 committed input files,22 real email components and23 SFCs. The reviewed builder SHA remains `8b9944cd231e475be8160f4af92c45e0eedfeaff616e197d41c3c5aa0a2b3af3`; composable SHA remains `2000b0bb37b598505313de2c0a85330cbcc11983458e34d422b481464fb97ebe`.

**Local route mapping only:** the real returned handoff URL was `https://creative.xeroflow.io/figflow/0.11.2-edm1/`. The fixture derived its mapping from that URL and served the supplied edm2 package under that intercepted edm1 prefix. This proves local package acceptance; it does not activate or verify a hosted edm2 URL. All app/creative requests were intercepted locally, unknown HTTP/WebSocket requests blocked, and no production request was permitted. CDP independently hashed actual WASM response bytes before native edits and at completion, matching the served artifact hash.

## Full executed journey

The native status actually advertised `edm_designer_import`, `edm_designer_snapshot` and `edm_designer_context`. Native edits used visible canvas selection and the native inspector through pointer/keyboard. The test never used native apply/history/private Session commands or JS state writes. Read-only bridge queries verified selection and preserved raw operation logs; the real host handoff panel performed review and explicit Apply.

1. Open the canonical preexisting template with nonempty registered assets, retained module pin and locked CTA. Verify empty native operation log. Capture/cancel library review, retaining the mounted designer and exact post-open canonical snapshot.
2. Edit Heading text through native controls to `Hello {{first_name}} native library`. Preserve the literal merge token. Capture desktop/mobile compiled previews, show proposal review without persistence, then explicitly Apply and save through the existing owner.
3. Publish the selected section as a module without changing the draft head. Insert that exact immutable version twice with distinct instance IDs. Inject one precommit503 reopen and one committed-open/lost-response transport failure; actual reconciliation reused the complete original operation payload/ID and did not append another draft revision. Both blocked states have screenshots/readbacks.
4. Publish registered imageB, insert it, then replace the original standalone registered imageA through real library/picker controls. Check registered references, original non-URL props, template/document identity, subject/preheader, module pins and locks.
5. Perform a second native Heading edit, compiled desktop/mobile capture/review and explicit Apply. Revise the selected library module, update only one inserted instance to that immutable version, retain the other older pin, and cancel a prepared update without persistence.
6. Open a second complete builder and make a competing native edit with explicit review/Apply. Attempt the first builder’s stale module update: actual Worker409 `REVISION_CONFLICT`, winning canonical snapshot unchanged, first builder local old snapshot preserved.
7. Explicitly reload after that known conflict. Review/detach the second module instance, retaining rendered blocks, original IDs/lineage, owner/provenance, locks and unrelated fixture pin. Reload again and reopen FigFlow: assert **exact same canonical revision**, equal store/readback and empty native operation log.

Raw untouched native operations for the three edits are retained as [initial edit](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/02-raw-native-operations.json), [module revision](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/06-revision-raw-native-operations.json) and [competing edit](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/08-concurrent-raw-native-operations.json). Each is exactly one Heading `set-props` text operation; no normalization or structural-op substitution occurred. No Undo/Redo, native move/duplicate/remove/mobile style, native image editing, or full OEM design fidelity is newly claimed from these text edits.

The final readback retains schemaVersion1, subject `Metadata retained`, preview `Synthetic preheader retained`, null campaign-only base/render metadata, locked block `cta`, shared client scope, composer provenance, retained original module pin and the explicitly updated first instance. All owner/revision metadata and canonical body projection checks ran on each database readback.

## Evidence and checks

All new runtime output is exclusively under `.verification/figflow-native-library-browser-9f09d3f87/`. [Runtime audit](../../.verification/figflow-native-library-browser-9f09d3f87/runtime-audit.json), SHA `9ec34d80ea0009378708e85f4c2528e8e074cc6f68592aff0e58112707b537dc`, records exact checkpoint equality, identical retry payloads, raw operations, hashes and all37 screenshot fingerprints. [Result](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/result.json), [network](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/browser-network.json) and [test log](../../.verification/figflow-native-library-browser-9f09d3f87/attempt-01.log) are retained.

Representative screenshots (inspected compiled mobile review and final actual native canvas):

- [Desktop compiled review](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/03-compiled-review-desktop.png) / [mobile compiled review](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/03-compiled-review-mobile.png).
- [Real stale update refusal](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/08-real-stale-update-blocked.png).
- [Exact-head final native reopen](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/07-full-builder-reopened.png).

Exact actual runtime command, exit0:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered \
FIGFLOW_NATIVE_LIBRARY_RECEIPT="$PWD/.verification/figflow-native-library-browser-9f09d3f87/inputs/receipt.json" \
FIGFLOW_NATIVE_LIBRARY_UI_PLAN="$PWD/.verification/figflow-native-library-browser/inputs/plan.json" \
FIGFLOW_DESIGNER_CHROMIUM=/Users/paulgiurin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell \
pnpm exec vitest run test/integration/emailNativeLibraryWorker.database.test.ts --cache=false --maxWorkers=1 \
> .verification/figflow-native-library-browser-9f09d3f87/attempt-01.log 2>&1
```

The input plan stayed immutable/read-only; actual matching-package context/operation assertions validated its selection and edits. No fresh fixture recalibration or product fix was needed. The prior956 Attempt10 failure remains preserved as historical failure, followed by this corrected9f pass; no claim that the old attempt now passes.

Fresh scoped checks, each exit0 with Node24.18.0 and existing dependencies:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint test/helpers/figflowNativeLibraryBrowser.ts test/integration/emailNativeLibraryWorker.database.test.ts
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node /tmp/figflow-native-library-harness-types.cjs
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec esbuild test/integration/emailNativeLibraryWorker.database.test.ts --bundle --platform=node --packages=external --outfile=/tmp/figflow-native-library-9f-integration.mjs --format=esm
```

[Lint](../../.verification/figflow-native-library-browser-9f09d3f87/runtime-lint.log): no diagnostics. [Scoped TypeScript](../../.verification/figflow-native-library-browser-9f09d3f87/runtime-scoped-types.json): both owned TS files, ESNext/Bundler/non-strict/noEmit/skipLibCheck, zero owned/transitive diagnostics. [Node compile](../../.verification/figflow-native-library-browser-9f09d3f87/runtime-node-compile.log): fixture integration compile only, no full Nuxt/native build. Runtime log contains baseline Vite `__dirname` future-loader and pg concurrent-query deprecation warnings; neither is a hidden test failure.

## Cleanup, preservation and limits

[Cleanup receipt](../../.verification/figflow-native-library-browser-9f09d3f87/figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98/cleanup.json): schema `figflow_native_browser_66ebda9c9263475cab28ddc7ebb88e98` created and **dropped**, proxy connections0, outbound `[]`, cleanup errors `[]`; runtime disposed and browser closed. Only local assigned socket55483 / figflow_test / figflow_design_test was used. Exact six committed migrations491/492/493/495/496/498 were verified/applied in that unique schema;498 SHA `e8fdd367968efe31eba4efb9af8bc4ecb381e16769efdbe12f88fedaca08e1fb`. No configured database was accessed.

Browser journal has220 entries:218 status200, one injected503 and one real409. Lost-open response was committed200 then deliberately aborted in the browser transport. Unexpected requests/errors are both `[]`. The only classified instrumentation diagnostics are30 exact Playwright sandbox `navigator.serviceWorker` injection errors with exact stack and recorded coreBundle fingerprint; this existing narrow exception was not widened. Native scripts/previews keep their existing sandbox/referrer checks.

The24 CI-repair,400 prior failed08a and94 accepted-core manifest entries were freshly rehashed and all match; manifest digests are in the runtime audit. The old failed Attempt10 snapshots and manifests were never overwritten. [Prior956 report](../../.verification/figflow-native-library-browser-9f09d3f87/956-runtime-report.md) and [preparation report](../../.verification/figflow-native-library-browser-9f09d3f87/preparation-report.md) remain historical records, including their then-pending statuses.

Fixture boundaries remain: a shared-scope admin actor, bounded Heading/module/image data, simplified15 NuxtUI leaf components and Nuxt plumbing, synthetic read-only Pages list/projection adapters. Canonical mutations still execute actual private Worker and previews actual renderer. Registered R2 imagesA/B are the same valid68-byte1×1 PNG under distinct IDs: replacement proves publication/reference/preservation, not changed-image visual fidelity. Registered fixture bytes are served directly by the local adapter; **public signed Pages delivery is unproved**. Library publication covered a selected section, not whole-template publication or broad library coverage.

This run does not close ordinary hosted employee acceptance, public signed asset delivery, campaign08b, full OEM fidelity, M06/public links, all native/library goals, general CI, deployment, or release. No provider, real email, live production browser, configured498, deployment, Git mutation, native/Cargo build, install or CI action occurred. Parent retains integration, migration, binding-budget, hosted/client acceptance and release ownership. There is **no new product counterexample in this executed subset**.
