# Native library full-builder acceptance — 3 November 2026

**Actual matching 08a runtime executed; the full case failed its final exact-head reopen assertion. The product counterexample is preserved, and the authorized UI/composable fix now passes 71 focused tests. A fixed committed/frozen snapshot is still required for a full runtime pass.** No hosted, public-delivery, full-CI or release acceptance is claimed.

Final bounded runtime: **1 file / 1 failed test / 0 skipped**, 26.15 seconds, [attempt-10.log](../../.verification/figflow-native-library-browser/attempt-10.log). It passed the earlier library/image/recovery/update/conflict/detach assertions described below before failing. This must not be relabelled as a passing 08a gate. Historical preparation is retained in [prepared-report.md](../../.verification/figflow-native-library-browser/prepared-report.md).

## Concrete product counterexample and fix

Evidence: [same-head-counterexample.json](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/same-head-counterexample.json), [raw network/receipt journal](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/browser-network.json), [final failure](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/failure.json), [screenshot](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/failure.png).

After successful reviewed detach, a full page reload followed by **Edit in FigFlow**, with unchanged blocks and metadata, advanced the same draft twice:

| Event | Revision |
| --- | --- |
| Saved detached head | `aec85f01-a1b6-4045-89cb-f2fffd9bd11e` |
| Identical `save-draft` PATCH | `cd5055ab-3f0c-4dca-8d6f-515154153115` |
| Identical metadata PATCH | `f4cb5033-60cd-4d6e-b935-dfcb70407d56` |
| Reopened native baseline | `f4cb5033-60cd-4d6e-b935-dfcb70407d56` |

The evidence independently compares submitted/saved blocks, subject, preview text, pins and locks: all are identical. There was no content loss or authority bypass observed, but the exact-head/no-write reopen contract was violated. This is product behavior in frozen source956, not a stand-in host state machine: `beginFigflow` at frozen `EdmFlyhubBuilder.client.vue:886` called `save()` unconditionally, and its structured branch at lines782–784 called `saveStructured` plus `saveMetadata`, each appending a revision.

The coordinator explicitly expanded ownership to those two product files and focused regression tests. The resulting fix:

- Reuses existing `canonicalSaved` (current projection, semantic block equality, exact workspace snapshot) to skip saves only for a confirmed unchanged structured workspace.
- Checks the same template/client and a current projection. Dirty content or metadata still uses the existing save/readback owner before opening the resulting head. Legacy initialization/conversion/new-copy continues through `start`.
- Extends the existing composable `open` with an explicit saved baseline. A saved reopen sends the existing `open` command with **draftId + expectedRevisionId**, in content or designer mode. It never merely skips save and sends unbound `start`.
- Validates owner/client/document/head/projection before network, checks receipt identity and exact-head readback before adoption, and retains original pending payload/mode/readback semantics. Stale remote heads are refused while local content remains.
- Does not optimize explicit Save, infer saved metadata from canonical source, change server/native/SQL, or relax the runtime assertion.

The coordinator relayed independent Opus review of builder hash `8b9944cd…` and composable hash `2000b0bb…`: no P0/P1 finding. An already-issued handoff can remain unadopted when newer readback is refused; pending receipt/readback stays fail-closed rather than silently adopting that head.

The fix is **unit/component verified, not yet actual-runtime verified**: the harness deliberately continues compiling committed956, while these authorized product edits are based on current root `bc8a3ba961c117b4a27efc61cd486af237339bac`. The failed attempt and snapshots remain intact. [Fix file fingerprints](../../.verification/figflow-native-library-browser/reopen-fix-source.json).

## Actual runtime provenance

The supplied [CI/package report](../../.verification/ci-followup-956330e9b/REPORT.md) records native run41453139103 success at workflow956330e9b1131b50b368e8c236dea1e166f53a2f. Actual CI checkout was synthetic merge `2c4200953f597ee76bf3c499d96c4e4c1016ee86`, parents052eefaf9 and956, with **32 engine / 9 bridge / 8 UI**, 81 named tests, 47 native and56 package checks. These CI results are retained upstream evidence, not tests rerun by this worker.

| Runtime bytes | SHA-256 |
| --- | --- |
| ZIP, 9,157,547 bytes | `cadc8ea9e0b6e2088b8d339adce8a38f91b7d3e482254f2fc5bc4956118a2deb` |
| WASM, 23,508,735 bytes | `18a31d0079c72f0ed07bb678c0ca548098c81d06c8bf05deb94c25c782457c59` |
| Frozen private Worker, 1,338,198 bytes | `a663c9f70dd48ac1850539de43b960b744c8e5e5ee46c8ab7c1d111073417941` |
| Frozen renderer, 733,961 bytes | `1a095948fe07110d50b4994871c9d381eb2df1454f701e63a5bdfebb3536915b` |
| Browser fixture bundle actually served | `f9ccc26f10a8fc8795207e016e3b4ac5bd4074948246ac6938833e03f88e1c9a` |

The ZIP was independently hashed before receipt generation. WASM was checked both on disk and from actual browser response bytes, before any UI edits. A dedicated CDP Network session retains a64MB per-resource/128MB total response buffer; its response bytes, not just the route’s supplied buffer, are hashed. All three native designer import/snapshot/context actions were actually advertised in [status](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/00-native-status.json).

Native engine SHA `530a33cf1d2b5e7a7c102ec9fa257a720ef18592f54ebe5bd62728c64f2f2d47`, bridge SHA `f6c14f7e9442fbac5ac4a82def700fdf3c554c7b96d2e059565dfc3a218d457d`, tracked patch SHA `b4db2b0d4e97e8440a78d952d9a67efe84a80a760411e1220995c4d9dfc102b6` match supplied receipts. The old accepted core WASM is explicitly refused by the new harness.

Browser components and runtime source are exactly frozen956. The fixture compiles22 real registered email components/23 complete SFCs from77 committed inputs, including the full builder, handoff, library, image picker, actual composer store and canonical flows. The parent’s frozen Worker/renderer archive was reverified across all6,849 captured files; archive SHA `77d96d6687d3e172fa1fe2f964aeeacedd086d710f821745c60b03e2ef24cd4f`. [Combined receipt](../../.verification/figflow-native-library-browser/inputs/receipt.json), [actual run source receipt](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/source-receipt.json). No bc8 foundation source or configured498 was built/run as956.

The actual handoff URL was `https://creative.xeroflow.io/figflow/0.11.2-edm1/`. Supplied edm2 package bytes were intercepted and served under that **local** older prefix, with served hashes retained. This is isolated package acceptance work; no hosted URL/version was changed or activated.

## Executed journey before the blocker

These are assertions that executed successfully in the failed full case, not separately passing acceptance tests:

| Actual control journey | Evidence/check |
| --- | --- |
| Open, native selection, library read/cancel | Same connected iframe and unchanged post-open canonical baseline; initial opening’s existing autosaves are recorded separately |
| Nonempty native Heading edit | [raw operations](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/02-raw-native-operations.json), merge token retained; actual pointer/keyboard property control |
| Captured desktop/mobile → compiled proposed review → explicit Apply | [mobile screenshot](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/03-compiled-review-mobile.png), [desktop screenshot](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/03-compiled-review-desktop.png), [compiled HTML](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/03-compiled-review.html); no revision before Apply |
| Selected-section publication, same-owner reopen | Real publisher controls/Worker receipt; source head unchanged by publication |
| Exact immutable version inserted twice | [checkpoint](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/04-exact-version-inserted-twice.json); distinct instance IDs, both pinned to v1 |
| Failed-before-commit reopen, committed-but-lost reopen | [failed](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/failed-open-blocked.png), [unknown](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/unknown-open-blocked.png); original full request/operation ID replayed, no extra draft revision |
| Registered image publish, insert and replacement | [checkpoint](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/05-registered-image-replaced.json); real picker, R2 byte verification, old references/non-source props/pins/locks retained |
| Second native edit/Apply, revised immutable module, update one instance | [raw revised ops](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/06-revision-raw-native-operations.json), [one-instance update](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/07-one-instance-updated.json); other instance stayed on v1 |
| Cancel prepared update; second complete builder makes competing native edit/Apply | Cancel caused no draft write; [concurrent raw ops](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/08-concurrent-raw-native-operations.json) |
| Real stale update refused with409 | [screenshot](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/08-real-stale-update-blocked.png), [checkpoint](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/08-real-stale-update-blocked.json); winning canonical content and first builder’s local content both retained |
| Explicit reload after known rejection, reviewed detach | [checkpoint](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/06-detached-content-retained.json); rendered blocks retained, original pin/locks/assets/identity/lineage preserved |
| Final unchanged reload/Edit in FigFlow | **Failed exact head preservation**, as above |

Published module `b61e494f-225a-4532-963a-21d53fce206b` moved from v1 `b2d83c39-e9c1-4b61-8387-cb4250282ff3` to v2 `a797e0ad-c67f-43b5-8afa-8c1b09f7b5c9`. Exactly one inserted instance updated; detaching the remaining v1 instance preserved its rendered content. The independent preexisting fixture pin to module `ec4f5d9c-4cf9-40a8-add0-0314d557142b` stayed unchanged.

37 final-attempt screenshots, compiled HTML, raw snapshots and API/receipt bodies are retained. [SHA256SUMS](../../.verification/figflow-native-library-browser/SHA256SUMS) covers400 evidence files across preparation, calibration, the counterexample and fix checks. The initial native scene, mobile review and real conflict screenshots were visually inspected. Final journal:236 local API requests, zero unexpected requests/errors; the three deliberate/expected outcomes were rejected-before-commit open503, committed open with lost acknowledgement, and real stale update409. Thirty exact known Playwright opaque-sandbox injection diagnostics are separately retained with source fingerprint; no other page error was suppressed.

## Fixture limits and isolation

All host state transitions belong to real frozen components/composables/store. Native bridge calls made by test instrumentation are read-only status/snapshot/context; no Session, internal apply/history or direct native mutation shortcut is used. Actual edits, selection, publication, insertion, review/Apply, update and detach use visible controls.

Nuxt request-local state/config/toasts and Nuxt UI leaves are bounded fixtures: controlled values/events/disabled state/labels, native top-layer dialog focus/inert/Escape, native labelled selects and recorded layout CSS. This proves real owner behavior, not full Nuxt UI/Tailwind visual fidelity. Read-only template/client/catalog/image list Pages projections are disclosed SQL adapters; all canonical writes dispatch the actual private Worker, and previews dispatch the actual renderer service binding.

All HTTP and WebSocket requests are intercepted or blocked before navigation. Guarded app/creative origins exercise real origin/source handling, while no request reaches production. Images are registered synthetic R2 bytes; both image IDs use the same valid1×1 PNG, so replacement proves verified identity/URL/reference handling, not a visual pixel change. **Public signed Pages signature/expiry/delivery remains unsupported by this fixture** and is explicitly retained as a remaining acceptance item. No upload/provider/email/hosted employee proof is claimed.

All10 attempt schemas were dropped; all proxy connections closed; outbound count0. A final readonly query independently confirmed all10 schema names absent. [Aggregate cleanup](../../.verification/figflow-native-library-browser/all-attempt-cleanup.json), [final cleanup](../../.verification/figflow-native-library-browser/figflow_native_browser_5f016cbb423241518859c3cf20befb1f/cleanup.json). Target was only the assigned disposable socket, port55483, userfigflow_test, databasefigflow_design_test, random owned schemas. No configured DB/497/498 was accessed or changed.

## Calibration and failure history

All failed attempts are retained separately with cleanup receipts. Attempts1–2 exposed inspector-cache eviction of the large WASM body; the dedicated CDP response capture fixed that without reducing hash requirements. Attempt3 corrected a fixture envelope lookup to the actual `result.supportedActions`. Attempt4 found undefined/null optional preview keys in the fixture RPC adapter; the adapter now matches the renderer’s optional-string contract. Attempt5 corrected Nuxt leaf form-label association. Attempt6 corrected a harness race that saw a transient pending button before the injected reopen request had occurred; it now waits for that exact response/failure. Attempts7–9 calibrated actual post-insertion scene positions and settled native pointer events with two animation frames before read-only status/context. No revision-conflict retry or broad error allowance was added. Attempt10 reached the final genuine product counterexample.

The [calibrated plan](../../.verification/figflow-native-library-browser/inputs/plan.json) records actual canvas/inspector clicks and keyboard input. It is not an old-package proof or an internal state edit. PG emitted a fixture-only warning about simultaneous queries on its shared read client during the two-builder phase; no test error resulted. The existing Vite config-loader warning remains unchanged.

## Red/green fix verification

Node24.18.0, existing dependencies:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/edmSavedReopen.test.ts test/components/figflowLiveSaveWarning.test.ts
# Before product fix: 10 failed /14 passed across2 files.
```

[Red log](../../.verification/figflow-native-library-browser/reopen-red.log). The new unchanged/stale/foreign-bound regressions failed on actual source logic before edits.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/app/edmSavedReopen.test.ts test/components/figflowLiveSaveWarning.test.ts test/components/figflowDraftDialog.test.ts test/app/edmDesignRoundtrip.test.ts test/app/edmNativeLibraryRecovery.test.ts test/components/figflowNativeLibrary.test.ts test/components/figflowNativeLibraryPanel.test.ts test/components/emailDesignLibraryComposerRecovery.test.ts
# After fix: 8 files /71 passed /0 failed /0 skipped, exit0.
```

[Green log](../../.verification/figflow-native-library-browser/reopen-green.log). Tests cover both modes; unchanged no-PATCH bound open; stale remote-head rejection/local retention; newer readback refusal; foreign owner/client/document/head/projection; mismatched receipt identity; pending save/open body/mode preservation; content/metadata save-first; legacy/new-copy and existing library recovery paths. These are mocked-I/O unit/component regressions, not a fixed runtime pass.

Scoped ESLint across the six owned TS/Vue source/test files passes, [lint log](../../.verification/figflow-native-library-browser/lint.log). Isolated TypeScript ESNext/Bundler/non-strict reports zero owned diagnostics and9 transitive diagnostics outside the owned set, [receipt](../../.verification/figflow-native-library-browser/scoped-types.json); not full Nuxt/vue-tsc. Full builder script plus inline template compilation passes, [receipt](../../.verification/figflow-native-library-browser/reopen-sfc.json). Tracked owned diff whitespace check passes. No test/assertion was removed, skipped or normalized to obtain green regressions.

Exact runtime command (attempt10):

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered \
FIGFLOW_NATIVE_LIBRARY_RECEIPT="$PWD/.verification/figflow-native-library-browser/inputs/receipt.json" \
FIGFLOW_NATIVE_LIBRARY_UI_PLAN="$PWD/.verification/figflow-native-library-browser/inputs/plan.json" \
FIGFLOW_DESIGNER_CHROMIUM=/Users/paulgiurin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell \
pnpm exec vitest run test/integration/emailNativeLibraryWorker.database.test.ts --cache=false --maxWorkers=1
```

## Follow-up runtime inputs and boundaries

Parent must review/commit the bounded product fix and supply an explicitly recorded frozen snapshot/artifacts for the follow-up. The current receipt/harness intentionally requires956; it cannot demonstrate the new dirty UI fix. Native package bytes/provenance may remain the supplied exact956 package if parent confirms unchanged native source/pins, but UI/runtime source revisions must be recorded separately or frozen coherently; no mixed source may be labelled956.

If the next coherent snapshot includes committed bc8 foundation498, the follow-up fixture needs the reviewed frozen498 migration/hash and matching backend Worker. Current fixture intentionally rejects498 and models only a minimal campaigns table. Generic new-backend reads also require498 revision metadata columns `base_template_revision_id` and `rendered_html_sha256` even for templates. Its campaigns schema must gain the body_source/body_html/subject/preview_text fields required by the campaign-projection trigger, and canonical projection/metadata readback must be checked against the frozen new owner. Do not apply configured migrations or quietly reuse a new backend with old schema/old provenance. Those fixture adaptations await the parent’s exact committed/runtime checkpoint.

General CI’s separate department/PG failures, configured498 activation evidence, public signed delivery, hosted employee/client use, campaign08b and release remain parent-owned. No Git/stage/commit/push, install, CI action, deploy, Cargo/native build, provider, real email or live production browser action occurred. The local headless fixture browser was explicitly authorized. All94 old accepted core evidence hashes still match, [receipt](../../.verification/figflow-native-library-browser/protected-core-validation.json); old3/3 is not used as08a proof.

Current owned file fingerprints (fix not runtime accepted):

| File | SHA-256 |
| --- | --- |
| `app/components/email/builder/EdmFlyhubBuilder.client.vue` | `8b9944cd231e475be8160f4af92c45e0eedfeaff616e197d41c3c5aa0a2b3af3` |
| `app/composables/useEdmDesignRoundtrip.ts` | `2000b0bb37b598505313de2c0a85330cbcc11983458e34d422b481464fb97ebe` |
| `test/app/edmSavedReopen.test.ts` | `4c8104793f8831e412acf8181101644c04a66c59cfc2c774ceead28aef823b40` |
| `test/components/figflowLiveSaveWarning.test.ts` | `560c3e62736d19da65d1592de4c2e66b0eb24f81be8e2b8df4a4e8bd44533268` |
| `test/helpers/figflowNativeLibraryBrowser.ts` | `5286623963ced39f638d3df6ef049335e90eaaeb17f7c84b540b0b3c91249f94` |
| `test/integration/emailNativeLibraryWorker.database.test.ts` | `59e35116f3970cde87e05aca384f09fcbc55748693cca77e7c798bf92b52421a` |
