# FigFlow EDM integration inventory — F01

Inspected 2026-10-30. Owner: Codex. Status: in progress; hosted save smoke verified; full round-trip verification and source reconciliation remain open. This is source evidence, not deployment or client-compatibility acceptance.

## Source/base evidence

Dashboard remote: `https://github.com/adme-dev/dashboard.git`.
Current workspace branch: `adme-dev/xeroflow-email-builder-20261030`.
HEAD: `fb7e001df0b1343e60f65a6213ea03f837eae9e2`.
Freshly fetched origin/main: `4c4b3d06b78721e6b85f82af20502704b8d9a6ec`.
Divergence: 0 commits ahead, 9 behind. Existing local import/cleanup/rendering changes are not owned by this task. Main includes later email canvas-link and template-filter fixes. Do not rebase/reset the dirty shared workspace or overwrite those fixes.

`workers/craft-editors/` is absent from both this checkout and the inspected main tree. Two existing dashboard workspaces contain the build integration:

- `../craft-hosted-rollout-20261028`, branch `adme-dev/craft-hosted-rollout-20261028`, HEAD `202d57b97f1da2ad5aba82e4b85041dee791ed87`; substantial unrelated dirty work.
- `../creative-tools-mainline-20261028`, HEAD `90f8fab183722b00d4e2483403e33cc7148a7908`.

These are discovery sources, not automatically approved merge/release bases. Before code implementation, reconcile only required tracked build files onto fresh main and coordinate with their owner. Preserve unrelated changes and shared dependencies. No new worktree or install was made during this audit; available disk was approximately 6.6 GiB.

## FigFlow ownership and build recipe

Upstream source repository: `https://github.com/storytold/figcraft`.
Pinned commit: `d4a303d4708602a9df1738960852d18b185a616b`, version `0.11.2`.
Source archive SHA-256: `04710e7815266580083267103d3fe93218c4dee02415e7016574ee866a09aaa6`.
Cargo.lock SHA-256: `539397203fa01e0f460ab2fad69b32003b838828751a7373e833d23b56e35b94`.

The tracked `workers/craft-editors/source-pins.json` in creative-rollout pins branding, browser-save, XF-mark and export-bound patches. Its untracked `patches/figflow-browser-bridge.patch` is NOT in additional_patches. Do not claim that patch is built or deployed. Existing `docs/plans/fixtures/figflow-browser-bridge.patch` is likewise R&D evidence.

Exact upstream F06 touchpoints from prior source inspection/patch paths:
- `apps/figcraft-web/src/main.rs` and `src/web.rs`: browser shell startup/frame integration.
- Proposed `apps/figcraft-web/src/bridge_web.rs`: bounded browser queue, not a current shipped API.
- `crates/ui-egui/src/control.rs` and proposed browser bridge module: engine command boundary.
- `crates/engine/src/cmd/file.rs`: native snapshot and export operations.

Owning dashboard integration files to reconcile before F06:
- `.github/workflows/creative-tools-build.yml`.
- `workers/craft-editors/source-pins.json`, `ci-setup.py`, `ci-build-browser.sh`, `build-browser.sh`.
- `workers/craft-editors/patches/`, `prepare.py`, `rebuilt-releases.json`.
- `workers/craft-editors/auth.mjs`, `worker.mjs` and associated tests.

Verified CI command shapes (not executed here):
```
bash workers/craft-editors/ci-build-browser.sh figcraft test
bash workers/craft-editors/ci-build-browser.sh figcraft web
```
These require Linux x86_64 and RUNNER_TEMP; they are not valid native macOS commands. The script installs pinned Rust 1.95.0/wasm32 tooling, Trunk 0.21.14 and wasm-bindgen 0.2.129, checks locked source hashes, emits build receipts and runs existing save/export tests. Bridge tests must be added explicitly. Do not run a multi-GB local build on the nearly-full disk.

Recorded package manifest selects hosted version `0.11.2-flow1`, archive digest `c035468c4e2b576564b9541edb4fbe9bf2a6755b466fc68e5e4c75bb318dbcf9`. These are manifest values, not a fresh live artifact hash verification. Creative hosting uses standalone Worker `xeroflow-creative-tools`; dashboard Pages remains `agency-dashboard`. Their release commands/targets are distinct.

## Actual browser observation

Navigating to `https://creative.xeroflow.io/figflow/0.11.2-flow1/` in the available Chrome verification browser redirected to XeroFlow Creative sign-in, with the normal app login embedded. No authenticated save/export/document calls were exercised; no magic link was sent or credentials retrieved. User was asked to sign in. This verifies an unauthenticated sign-in flow only, not full access enforcement or editor capability.

The source README explicitly says automatic XeroFlow project save/import is not implemented; users save/download native work. Browser bridge/snapshot receipts, durable project linkage and EDM publishing remain new work requiring actual hosted acceptance.

## Email interfaces and authority

| Concern | Existing source | Integration consequence |
|---|---|---|
| Canonical blocks | `app/types/edm.ts`, `app/composables/useEdmBuilder.ts` | Extend existing data model; preserve responsive overrides and legacy types |
| Module extraction/insertion | `app/utils/edmModuleFragment.ts` | Preserve internal references and remap inserted instance IDs |
| Module UI/store | `app/components/email/builder/EdmAddModuleMenu.vue`, `EdmFlyhubBuilder.client.vue`, `app/composables/useEdmCustomModules.ts` | Add revision/capability metadata without a second library |
| Module CRUD | `server/api/agency/email/modules/`, `server/utils/email-marketing/customModules.ts` | Existing mutable custom modules; immutable revisions and archive semantics are additional work |
| Template CRUD | `server/api/email/templates/`, `server/utils/email-marketing/templates.ts` | Editable body_source, server-rendered body_html; no complete FigFlow round trip today |
| Scope | `server/utils/email-marketing/access.ts`, `server/utils/auth.ts` | requireWriteAccess blocks read-only users; resolveEmailWriteClientId determines authorised scope |
| Rendering | `shared/emailRendering/contract.ts`, `server/utils/email-marketing/render/`, `workers/email-rendering/src/render/` | Keep private renderer canonical; no new sending path |
| Sending | `server/utils/email-marketing/campaignSend.ts`, `sendability.ts`, `trackingLinks.ts` | Preserve campaign snapshots; final validation after merge/tracking must be added deliberately |

Scope details: management roles and ADMIN/MANAGEMENT permission groups can resolve agency scope; MARKETING_MANAGEMENT has a fresh permission check and active-client list; other users use assigned clients. Client-scoped users cannot implicitly select agency-global scope. Existing broad write access does not itself define separate designer/library-publisher rights: F02 must map explicit capabilities and test revocation without granting all writers structural/publishing authority.

Migration naming is not an execution contract: `scripts/run-migration.mjs` runs Monday import, and `scripts/apply-migration.ts` is hardcoded to Monday fields. Do not invoke either for this feature. Follow AGENTS.md SQL/psql procedure after identifying the target environment and choosing a fresh migration number. No database writes were made. Disposable DB/client test identities and real-client testing credentials are not established yet.

## Reproducible baseline

Runtime observed: Node 24.22.1; package.json declares 24.18.0. Record this mismatch rather than rewriting package settings as part of discovery. Installed Vitest 4.1.10 used repository `vitest.config.ts` and `test/setup.ts`.

Executed successfully:
```
pnpm exec vitest run test/utils/edmModuleFragment.test.ts test/server/edmCustomModules.test.ts test/server/api/emailClientScope.test.ts test/workers/emailRenderingParity.test.ts
```
Result: **4 files, 60 tests passed**. Vite emitted a non-fatal future configLoader warning about __dirname. Log: `/private/tmp/figflow-f01-baseline.log` (ephemeral; result recorded here for handoff).

Reusable source fixtures: `test/fixtures/emailRendering.ts`, `test/fixtures/emailRenderingGolden.json`, `test/fixtures/emailRenderer.ts`; module tests contain fragment/re-ID cases. Current render fixtures cover empty, text/heading/button, nested columns, imported HTML/unknown blocks and responsive styles. Some are deliberately malformed legacy cases; do not promote all of them as valid structured-design fixtures. F02 must add positive schema fixtures and explicit legacy/error cases separately. No real-client rendering acceptance follows from this baseline.

## Remaining F01 gates / exact next actions

1. Authenticated browser: after user sign-in, inspect real document/save/export behaviour, native snapshot reopen and client-scope transitions without sending campaigns.
2. Source owner reconciliation: confirm current creative branch owner and authoritative build receipts; place required build integration on fresh main without dirty work loss. Verify live decoded asset hashes against the intended release receipt.
3. Capture authenticated synthetic legacy template/module save/render baselines and native FigFlow source mappings; confirm snapshot format and exact supported layout API before F02 freezes interfaces.
4. Establish disposable DB/testing identities and required email-client test access. Do not treat environment credential presence as permission to use production data.

F01 remains in progress. F02–F12 are not complete and must not be reported as implemented. Ruling: source inventory and baseline testing can proceed in this dirty workspace because they do not mutate product code; product implementation waits for the plan's source reconciliation and authenticated discovery gates.

## Authenticated follow-up — 2026-10-30

User completed sign-in. The browser initially displayed the agency dashboard; navigating to FigFlow then loaded the canvas editor successfully. Startup exceeded the navigation tool timeout, but subsequent network and screenshot checks confirmed the loaded app (not an auth failure). Document, JS and WASM requests returned 200; `/__auth/session` returned 204. No console errors were listed; a preload-integrity warning and an unsupported web theme command warning were observed.

Observed hosted bundle: `figcraft-web-79c9bbd88be08fa1.js` and corresponding `_bg.wasm`. The page assigns `window.wasmBindings`; its enumerable exports were only `default` and `initSync`. No FigFlow/bridge-named global was found. This supports absence of a public integration entry point in this build; it is not a comprehensive security audit or decoded WASM hash check.

Canvas UI: File, Assets, Variables, Design/Prototype, local styles/variables, shape tools and Export page as PNG. File menu includes native save/save-as, version history, open/import, export, PDF/SVG options and generic publish-to-server. The latter was not used and is not evidence of XeroFlow email-template publication.

Native saves observed:
- Save as on an empty disposable document downloaded `~/Downloads/Untitled.figcraft`: 386 bytes, SHA-256 `40436617e70f76e18a74435e10c9ed9d32ef40cee41b942fc5b821dd334a0fec`.
- A synthetic rectangle node followed by Cmd+S downloaded `~/Downloads/Untitled (1).figcraft`: 683 bytes, SHA-256 `57ab0d7a36f92fb373785072f300cc282161abc8ff04cd337bfe73ca4ec7a928`.
- Both are ZIP containers containing `document.json`; format `figcraft`, version 1. Native fields include pages, nodes keyed by ID, next_id, imageIndex, styles, variable collections and current_page. The second file contains page and rectangle node types. The drawing gesture produced a zero-size rectangle: this verifies node serialization only, not visible geometry or image-export acceptance.
- Only these synthetic local files were created. No customer document, campaign, template or module was published, and no message was sent. Native reopen and non-empty PNG/SVG export remain unverified.

The authenticated FuturaX composer loaded at the requested starter URL. Its Add block picker exposes Basic Modules, Header, Content, Feature, Call to action, E-Commerce, Transactional, Footer and Custom Modules. Basic elements include Heading, Text, Button, Image, Avatar, Divider, Spacer, HTML, Columns and Container. This verifies the existing module UI entry point, not CRUD/save permissions or availability for other clients/roles. The inspected account is an owner-level account; lesser-role isolation still needs separate acceptance identities.

Updated next action: authentication is resolved for this browser. Continue synthetic snapshot reopen and non-empty export, then source-owner reconciliation and scoped fixture work. Do not ask for sign-in again unless the session actually expires.


## Current-base reconciliation and implementation checkpoint

On 30 October this existing branch was fast-forwarded to
`4c4b3d06b78721e6b85f82af20502704b8d9a6ec`. Tracked email-builder changes
were protected in Git stash `figflow-preserve-email-builder-before-main-20261030`
and restored without conflicts. The stash is deliberately retained as recovery
material. The untracked link-navigation test matched the incoming tracked blob
exactly; its original remains at `/private/tmp/figflow-preserved-emailEditorLinkNavigation-20261030.test.ts`.
The older divergence statement above is historical. Unrelated dirty changes
remain present and are not part of this implementation.

Independent F02 canonical source-boundary work has started after base
reconciliation. This does not waive native integration gates. Source owner
inspection confirms creative-rollout remains a separate in-progress Orca
workspace with a stale branch and unpinned bridge patch; it was not merged.

Native reopen attempt: the actual hosted file input was discovered, but Chrome
DevTools upload rejected both the temporary fixture and the current-workspace
fixture as outside its configured workspace roots. No upload was performed.
Temporary accessibility/style changes to expose that input were restored.
Reopen/non-empty export remains unverified. Resolving the tool's root mapping
or using an authorised normal file-picker flow is the next browser step.

Test tenant/disposable database and designated email-client inboxes were
requested. No migration or customer send has been attempted. Available disk at
this checkpoint: 3.3 GiB; no extra checkout or install was created.


## Live decoded artifact identity verified

Authenticated, read-only fetches on 30 October returned 200 for both live files.
Decoded bytes match the corresponding entries in the local pinned archive,
whose archive SHA-256 also matches `rebuilt-releases.json`:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `figcraft-web-79c9bbd88be08fa1.js` | 166850 | `4fcae294bf2815109d517245dcd5736df430b8d05735ded32ff9c34bb4a639c6` |
| `figcraft-web-79c9bbd88be08fa1_bg.wasm` | 23301244 | `a9ed87fa8801b2faf495690cf012ccb0cf3b6db6d540bc9af7d1e87543ec91f2` |

Compared archive: `/private/tmp/flow-source-build-20261028/branded-archives/figcraft-web-0.11.2.zip`,
SHA-256 `c035468c4e2b576564b9541edb4fbe9bf2a6755b466fc68e5e4c75bb318dbcf9`.
This closes the live decoded-bundle identity check, not native reopen, scoped
bridge or email-client acceptance. No deployment occurred.


## 31 October environment refresh

Disposable local PostgreSQL is available; hosted database credentials are no
longer a prerequisite for the isolated F03 persistence tests. Created a private
cluster at `/private/tmp/figflow-postgres-mWIy8Yad/data`, owner `figflow_test`,
PostgreSQL 14.19. Started with TCP disabled, socket directory
`/private/tmp/figflow-postgres-mWIy8Yad`, port 55483. `SELECT current_user,
version()` succeeded. Stopped cleanly after the readiness check; no project
migration or application record was written. The cluster can be restarted with:

```sh
pg_ctl -D /private/tmp/figflow-postgres-mWIy8Yad/data -l /private/tmp/figflow-postgres-mWIy8Yad/server.log -o "-k /private/tmp/figflow-postgres-mWIy8Yad -h '' -p 55483" -w start
```

Use a dedicated test environment variable / explicit socket connection. Do not
change the application `.env` or point production migrations at this fixture.
The private directory may be removed by OS temporary-file cleanup; recreate if
missing. Disk free at setup: 9.6 GiB. No package or database-server installation
was required.

The newly available browser runtime could initialise, but URL selection returned
`No browser is available`; its documented discovery returned an empty list.
Native reopen remains blocked on a connected browser. No attempt was made to
circumvent the browser connection or workspace restrictions.


31 October persistence verification update: tests use the dedicated
`figflow_design_test` database (UTF8, created from template0), not the cluster's
SQL_ASCII `postgres` maintenance database. The fixture asserts UTF8 before
applying migration 491 in a temporary synthetic schema. The cluster and socket
remain local-only; restart using the command above. No application `.env` or
production database has been changed.


Latest local database (31 October continuation): the historical temporary cluster
above no longer existed. Recreated isolated PostgreSQL 14.19 / UTF8 at
`/private/tmp/figflow-postgres-rZeu9V3y`, database `figflow_design_test`, user
`figflow_test`, port 55483, Unix socket only. Use this socket for current tests.
Restart with:

```sh
pg_ctl -D /private/tmp/figflow-postgres-rZeu9V3y/data -l /private/tmp/figflow-postgres-rZeu9V3y/server.log -o "-k /private/tmp/figflow-postgres-rZeu9V3y -h '' -p 55483" -w start
```

The old restart command is historical. No production database or application
`.env` was used. Disk availability was 11 GiB at this continuation's check.

Browser connection rechecked during the Kimi/Grok continuation: runtime setup
succeeded, URL selection returned no browser, and the documented discovery check
returned an empty browser list. Native reopen/bridge verification remains blocked
by browser connectivity; no fallback tool or authentication bypass was used.

## 1 November native save/reopen/export acceptance

The browser connection is available again. The existing hosted FigFlow
`0.11.2-flow1` loaded authenticated, without another sign-in. In a fresh disposable
document, created a visible 240×160 rectangle. Cmd+S produced
`~/Downloads/Untitled (2).figcraft`; the download-event observer timed out, but the
actual file was reconciled locally rather than blindly repeating Save. Its ZIP
contains document.json and thumbnail.png, with rectangle width 240, height 160,
identity 2 and parent 1. SHA-256:
`de53db57aaf637b15bc106ecf7ce4c7eadcac17ce0502c8ddea21599067694e2`.

Cmd+O and the supported file chooser reopened that exact synthetic file in a new
`Untitled (2)` document tab. The rectangle was visibly present. Export page as PNG
showed an export-success toast and downloaded a 240×160 PNG (1254 bytes), SHA-256:
`910c2900ee1f371969af47ed2d4aa8a5bf03c65a04b587e4de93f73c00da1e6b`.
Local artifacts and screenshot:
`.verification/figflow-release-20261101/`. No customer source, library item,
campaign or send was created. Native save/reopen and non-empty PNG export are now
verified for this synthetic shape. This does not prove the missing native EDM
bridge, editable email conversion, module synchronization or mail-client rendering.
Kimi is checking the remaining source/build ownership boundary before integration.
