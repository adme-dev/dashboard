# Designer core browser acceptance — 2 November 2026

**Corrected core and bounded structural/mobile UI acceptance passed: 3 passed, 0 failed, 0 skipped. This does not accept the full original product scope.**

Task `task_8e0d47ae4ab1`, dispatch `ctx_9abef9b67b73`, application checkout `920b25885acce185798a244691974515329d1360`. Only the two separate acceptance files and this report were edited. Existing tests/fixtures, product/native source, pins, shared URL, configurations and the read-only [goal audit](../../.verification/goal-acceptance-audit-20261102.md) were not changed. No install, product/native build, git mutation, CI request, deployment, configured/provider database, live browser session or email occurred. Existing bounded fixture transpilation/bundling still prepares the local Vue harness and renderer; no full Nuxt or Cargo build is used.

## Evidence preservation and corrected artifact

Before any rerun, the **entire** prior `.verification/figflow-designer-browser` tree was moved to `.verification/figflow-designer-browser-eb561e975`, with its prior report copied alongside. All 49 hashes in its old `SHA256SUMS` were reverified. The older [raw null-column snapshot](../../.verification/figflow-designer-browser-eb561e975/structure/native-edited.json), [failing screenshot](../../.verification/figflow-designer-browser-eb561e975/structure/last-state.png), [1-pass/1-fail log](../../.verification/figflow-designer-browser-eb561e975/actual-vitest.log) and [report text](../../.verification/figflow-designer-browser-eb561e975/prior-report.md) are preserved. They are historical counterexample evidence for the eb561e975 artifact, not the current result.

The supplied [CI report](../../.verification/ci-followup-920b25885/native-41433536391/REPORT.md) records run **41433536391 success**, expected source `920b25885…`, synthetic merge checkout `a8133b84bdfb2930467855263014c7f4bb7233bc`, and **30 engine / 8 bridge / 8 UI** tests. Its 51 native and 67 package receipt checks are all true. Release ZIP and WASM were independently hashed locally, and every actually served file hash was compared to the retained package manifest.

Package: `.verification/ci-followup-920b25885/native-41433536391/browser-package/unpacked/figcraft-web-0.11.2-edm2`.

| Bytes | SHA-256 |
| --- | --- |
| Release ZIP, 9,157,475 bytes | `f8fb86aebc61e1a96df5eb99b847271b4b5ae8db0de21568bedce93513f38e54` |
| Actual served WASM, 23,506,516 bytes | `70bfa31a2d7d0752293a3db7594b722b3bc3da992ad01e7484406fbe365c6b08` |
| Actual served JS | `7eb9e1844905547a52a8aded5b4fdf3131bb589d0c1a9bf6a61ce87ac582675d` |
| Actual served relay | `438b71f2ead434fcb41a60d0c98bff67ba8ba18068cf7f45aee9c185901b7211` |
| Actual served index | `6155c456af7eb8d757a602f683f8cc1265f5a9c00a4076f552abf742e9e5920b` |
| Existing private Worker used | `61e42da8c47cbf360edd50b66cb69faae0ef25ad0e9998bf483e662761604cfa` |

All cases actually advertised `edm_designer_import` and `edm_designer_snapshot`. Routing was derived from the actual handoff's **`https://creative.xeroflow.io/figflow/0.11.2-edm1/`**. New edm2 bytes were served under that old edm1 prefix solely inside the intercepted local fixture. This is not hosted version publication, URL activation, deployment or production-flag evidence.

## Exact passing subset

Initial unchanged two-case rerun: **2/2 passed**, [log](../../.verification/figflow-designer-browser/corrected-two-case-vitest.log). After adding the separate native structural/mobile case, the final combined run: **3/3 passed**, exit 0, no skips, [log](../../.verification/figflow-designer-browser/actual-vitest.log). Final runtime was 60.29 seconds. Calibration-only filtered runs are not the final acceptance result.

| Executed test | Native operations exercised |
| --- | --- |
| `accepts actual native designer props/style through Worker, previews, apply, reload, staff and conflict` | Heading text; desktop font size; actual native Undo/Redo |
| `accepts actual native approved section insertion without weakening its emitted operation` | Same controls plus approved root Spacer insertion, with absent `columnIndex` asserted in the raw snapshot |
| `accepts actual native move duplicate remove and mobile style with compiled review and saved pins` | Same controls plus mobile font-size override, root move, duplicate, and removal of only the newly duplicated identity |

Each case seeds a real nonempty immutable module revision pin via the existing Worker library publish/insert APIs and an explicit `cta` designer block lock via the existing locks API. The returned capabilities mark CTA and pinned module root noneditable. These are persisted fixtures, not empty-array equality assertions.

Every case completes: actual native zero-op snapshot → identical canonical no-op return → compiled desktop/mobile preview → Keep current draft retaining original head/blocks → native editing and native Undo/Redo → Return proposal leaving composer unchanged → compiled desktop/mobile review → explicit Apply → one composer undo step/redo → same-head reload → staff content edit/save → second native reopen with zero phantom operations → second real staff save → stale explicit Apply **409** → reload retaining the newer head and current blocks. Source provenance, scope, policy/locks, original lineage/IDs, assets and nonempty dependency/module pins are checked; subject and preview text are read directly from PostgreSQL.

The additional case emits exactly seven operations through real canvas pointer/keyboard input. Its [raw final snapshot](../../.verification/figflow-designer-browser/structure-mobile/native-edited.json) and intermediate `native-mobile.json`, `native-duplicated.json`, `native-removed.json` retain the unmodified bridge results:

| Index | Operation and asserted target |
| --- | --- |
| 0 | `set-props`: original heading text `Hello {{first_name}} designer` |
| 1 | `set-style`: original heading desktop font size 36 |
| 2 | `add-section`: Spacer at root index 1 |
| 3 | `set-style`: original heading mobile font size 28 |
| 4 | `move-section`: original heading to root index 1, after the new Spacer |
| 5 | `duplicate-section`: heading copy at root index 2 |
| 6 | `remove-section`: deterministic new copy ID `designer-094de157-bac5-4142-93d6-e42f9879738f-5-0` |

Root add/move/duplicate operations **omit** `columnIndex`; no null removal, operation normalization or request rewriting occurs. The original heading ID survives. The returned canonical graph contains the moved heading and added Spacer, and excludes the removed copy. It retains desktop 36/mobile 28; compiled HTML contains both sizes. Compiled previews have measured iframe widths **1000 and 390 pixels**, are script-free, and retain empty sandbox plus `no-referrer` policy.

Native controls are operated via actual pointer clicks, scrolling and keyboard entry. After reflow, the test selects the intended visible layer row again. One font value click was calibrated away from eframe's tiny invisible text-agent input; `native-dom-inputs.json` records its read-only geometry. No `force` click, synthetic native command, bridge apply/history, private Session, selection mutation or DOM state edit substitutes for design input. Bridge calls from the helper are read-only status/designer-snapshot observations; the normal relay performs import. Composer staff actions remain explicit fixture calls to the real store/flow, as in the existing acceptance owner.

Final PostgreSQL receipts:

| Case | Applied design head | Final concurrent staff head kept after 409 |
| --- | --- | --- |
| `props-style` | `e92b4416-276a-47b0-8738-d58b4b3b0983` | `40f180b9-c1b9-49d4-8408-82d629eb8ac0` |
| `structure` | `12355a9b-3376-4c41-98d0-d5fd5269101a` | `c72b4cfa-f4b5-46e5-a764-3e2f0f8547c4` |
| `structure-mobile` | `ba3d7af7-6ac8-407a-9572-24f7c5e4b66d` | `3a4c6aa6-cf0d-46af-a423-0db2ff4b9423` |

## Runtime boundary, cleanup and instrumentation

Node `v24.18.0`, existing cached headless Chromium `151.0.7922.34` (cache revision 1234), fixed viewport 1440 × 1100. The browser is isolated, not a live user session. Actual existing composer store/flow/handoff panel are mounted; Nuxt UI button/alert leaves are minimal fixture stand-ins and small fixture CSS supplies preview dimensions. Canonical auth is a synthetic local HMAC/session authority. This does not establish full Nuxt, real employee OAuth, hosted role access or inbox rendering.

All browser app/creative requests are intercepted; unknown requests abort. Each final case recorded **0 unknown browser requests**, **0 application page errors**, **0 unexpected Worker outbound requests**. The private Worker runs in actual workerd/Miniflare and calls the real private canonical renderer service and PostgreSQL transactions. Browser preview requests use the same actual canonical renderer implementation locally. Small fixture bundles are the existing acceptance technique, not a replacement product build.

PostgreSQL: database `figflow_design_test`, user `figflow_test`, port 55483 on socket `/private/tmp/figflow-postgres-20261102-recovered/.s.PGSQL.55483`. A fixture-only ephemeral loopback proxy bridges Hyperdrive to that exact supplied socket. A fixture entry module adds the owned schema search path to Miniflare's connection strings; it imports the untouched private Worker bytes. No configured database, database/role configuration or server setting changes occur. Final schema `figflow_designer_browser_0b584beaed8443a697973454a8e0d66c` was dropped, and proxy connections remaining = **0** ([cleanup receipt](../../.verification/figflow-designer-browser/cleanup.json)).

The exact pre-existing Playwright instrumentation exclusion remains narrow. `node_modules/playwright-core/lib/coreBundle.js:47102` (SHA-256 `f74353fcb8e406756a70a6af0dfc4a5069acd577e35ec9d923ccf36ac009c2f5`) injects unguarded service-worker access for `serviceWorkers: 'block'` into script-free opaque sandbox previews. [Source receipt](../../.verification/figflow-designer-browser/structure-mobile/playwright-instrumentation.json) retains its surrounding condition. Each final case retained three identical instrumentation exceptions separately; every other page error still fails the test. Sandbox/CSP/product source was not changed. Exact complete retained stack:

```text
SecurityError: Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.
    at <anonymous>:3:15
    at <anonymous>:5:7
```

## Checks, evidence and remaining goals

ESLint passed for both owned test files. Scoped TypeScript reported **0 diagnostics in those files** with Node 24.18, ESNext and Bundler resolution; it is not a repository-wide typecheck. Logs/receipt: `lint.log`, `scoped-types.json`. `SHA256SUMS` covers all three final case directories plus final/check logs and cleanup receipts. `calibration/` holds stale pre-final failure checkpoint diagnostics separately; the final case directories each have successful `browser-result.json` and `database-result.json`.

Evidence root: `.verification/figflow-designer-browser/`, directories `props-style/`, `structure/`, `structure-mobile/`. Each has `01-designer-initial.png`, `02-noop-desktop.png`, `02-noop-mobile.png`, `03a-native-undo.png`, `03b-native-redo.png`, `04-design-proposal-desktop.png`, `04-design-proposal-mobile.png`, `05-second-reopen.png`, `06-conflict-keeps-current.png`, raw snapshots, seed, network/served hashes and database receipts. The added case also has `07-native-mobile-style.png`, `08-native-move.png`, `09-native-duplicate.png`, `10-native-remove.png`. Desktop/mobile and key structural screenshots were visually inspected.

**Remaining scope stays open:** native library/template/module publication or selection, verified image choice/upload/replacement, whole supplied-template fidelity, campaign-owned native revisions and handoff, M06 integration/acceptance, pre-return compiled native preview, current-source hosted activation/employee repetition/rollback, and named real email-client rendering. The additional native case covers a Heading and Spacer at root level, one same-list move, one leaf duplicate/remove and one mobile font override; it does not prove nested/column transforms, all control combinations or locked-control attack vectors. Existing pins/locks were preserved; their full mutation-denial matrix is not claimed here. No broad original-goal completion follows from these local passes. The goal audit was read-only context and was not rewritten by this worker.

Reproduce the complete three-case local gate:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-20261102-recovered \
FIGFLOW_DESIGN_WORKER_ARTIFACT=workers/email-design/dist/worker.mjs \
FIGFLOW_DESIGNER_CHROMIUM=/Users/paulgiurin/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell \
FIGFLOW_DESIGNER_WASM_SHA256=70bfa31a2d7d0752293a3db7594b722b3bc3da992ad01e7484406fbe365c6b08 \
FIGFLOW_EDM_NATIVE_PACKAGE="$PWD/.verification/ci-followup-920b25885/native-41433536391/browser-package/unpacked/figcraft-web-0.11.2-edm2" \
pnpm exec vitest run test/integration/emailDesignerWorker.database.test.ts
```

Parent retains source, CI, release, integration and broader goal ownership. This bounded follow-up found no new production counterexample.
