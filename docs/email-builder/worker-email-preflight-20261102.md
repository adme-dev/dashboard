# F09 / M04 — Expanded email preflight diagnostics

Date: 2 November 2026. Worker task `task_002dded5f050`, dispatch `ctx_d170a23281e8`.

## Source and outcome

Implemented the assigned bounded diagnostic increment on `adme-dev/figflow-email-preflight-20261102` from the exact supplied main source `c4798624548704fec493418b53952ad52ddfc3eb`.
Implementation commit: `bff8afa234af3f168e17d49c941906b31f24721e`.
The local `origin/main` and merge base both matched the supplied source; this branch has no upstream. Parent retains fresh-main reconciliation, integration, CI, browser, provider and production ownership.

## Changes

- `shared/emailRendering/contentDiagnostics.ts`: pure advisory inspection for canonical block graphs and complete imported HTML. Checks missing image descriptions and sources; missing button, linked-image and menu destinations; absent semantic headings and multiple primary headings; language; absent/long/duplicate subject and preview text; known small pixel typography; low contrast for deterministic solid colours; and heavy images when stored byte metadata is supplied.
- `server/utils/email-marketing/campaignSend.ts`: adds warning entries to the existing `checks` result with stable IDs and region references. Inspects frozen HTML without recompiling campaign snapshots. Existing unsubscribe, sender/subject, transport/domain, recipient, physical-footer and HTML-size checks remain intact. No sending or merge-formatting changes.
- `app/components/email/CampaignPreflightPanel.vue`: distinct blocker/warning groups, optional Nuxt UI warning controls, stable duplicate-code keys, semantic colours, container-based grids and a bounded keyboard-scrollable issue region. Content-only mode describes current edits and does not label them client-tested.
- `app/components/email/builder/EdmFlyhubBuilder.client.vue`: Content checks action computes from current document/metadata and the selected desktop/mobile projection; metadata warnings open the existing settings dialog, block warnings select the existing item and imported warnings resolve through `edmHtmlEditables`. Navigation waits for the diagnostics modal to finish closing. Root and inspector scroll bounds remain explicit; toolbar wraps. Existing imported-image replacement now retains explicit empty alt text instead of inventing alt text from the file name.
- `app/components/email/builder/ContainerBlockRenderer.vue` and `ColumnsContainerRenderer.vue`: one diagnostic target attribute each, allowing nested items to be revealed without interpolating block IDs into CSS selectors.
- Focused tests in `test/utils/emailContentDiagnostics.test.ts`, `test/utils/emailCampaignSend.test.ts` and `test/components/emailCampaignPreflightPanel.test.ts`.

The complete imported HTML string, head/styles/conditional comments and hidden source variants are never rewritten by diagnostics or attached as active dashboard markup. Inspection uses parse5 with scripting disabled; it performs no URL fetching and does not replace the sanitizer. Explicit empty alt text is legitimate decoration; absent link fields on otherwise ordinary images do not make those images invalid.

## Bounds and known unknowns

- HTML parsing is limited to 1 MiB of UTF-8 across source fragments, 20,000 inspected nodes, depth 100 and 200 reported issues (including an explicit incomplete-inspection warning). Canonical input also uses the existing snapshot/graph bounds. Oversized/invalid input does not become a false all-clear.
- Contrast is deliberately skipped where stylesheets/classes, images, shorthand, opacity/compositing or unsupported colour forms prevent a deterministic foreground/background pair. Complete imports do not inherit the editor canvas background because their compiler bypasses that wrapper. This is advisory colour analysis, not an accessibility or email-client certificate.
- Heavy-image threshold is 500 KiB, using supplied stored `fileSize` only. The server accepts optional `imageAssets`; the existing imported-image picker supplies known metadata for selected replacements in the current session. Existing campaign reads do not supply a complete URL-to-asset-size catalogue, so reopened/arbitrary assets have unknown weight until an owner supplies that metadata. No new database/catalog queries or remote HEAD/download requests were added.
- Existing frozen HTML-size warning remains 102 KiB by default. This increment does not add validation after per-recipient tracking/personalisation, rework unsubscribe ownership, or certify F09's broader send workflow.
- Imported warnings use the existing body-relative region paths, with block selection as the fallback when a region is not represented by the current editor. Language warnings select the imported document; the existing editor has no dedicated document-language control. No new document/brand-role schema was invented.
- Real browser focus/selection/scroll acceptance and Apple Mail/Gmail/Outlook coverage remain unverified and parent-owned. No test/customer emails were sent.

## Verification

Node: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin`.

Focused Vitest run: **8 suites, 67 tests passed**, final run 2 November 2026 at 16:30 Melbourne time. Covered parser bounds; no mutation/execution/fetching; complete imports and stable body-region paths; decorative images; known/unknown colour and asset metadata; metadata and heading cases; warning button emission; old campaign hard gates; existing scheduling and test-send routes.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node_modules/.bin/vitest run --config .nuxt/preflight.vitest.config.ts \
  test/utils/emailContentDiagnostics.test.ts test/utils/emailCampaignSend.test.ts \
  test/components/emailCampaignPreflightPanel.test.ts test/utils/edmHtmlEditables.test.ts \
  test/utils/emailBuilderSchedule.test.ts test/utils/emailCampaignSchedule.test.ts \
  test/server/api/emailCampaignTestSendPreflight.test.ts test/server/api/emailCampaignPatchSchedule.test.ts
```

The first attempt could not load any tests because this new worktree lacked generated `.nuxt` TypeScript/ESLint configuration. Read-only copies of five small generated configuration files from the parent enabled the focused checks; an ignored local Vitest wrapper uses this worktree's `.nuxt/preflight-vite-cache` and disables result caching. No dependency installation or Nuxt build was required. The wrapper imports the repository Vitest config and changes only `cacheDir` and `test.cache`.

Setup caveat: the initial failed Vitest run used default result caching and updated `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json` in the shared dependency tree at 05:23:44 UTC (282,442-byte results cache). This was an unintended cache mutation despite the read-only dependency constraint; dependency package files were not edited. Existing entries from other workers remain in that file, so it was not deleted or rewritten again. All subsequent test runs used the isolated local wrapper and disabled result caching. Parent should account for this cache-only side effect; do not interpret those initial zero-duration failures as source-test failures.

Additional passing checks:

- Scoped ESLint across all nine changed code/test files, followed by a passing builder-only lint after modal-close navigation/scroll polish.
- Standalone helper TypeScript check: `tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler shared/emailRendering/contentDiagnostics.ts`.
- Vue compiler `parse`, `compileScript` and `compileTemplate` for the final builder and preflight panel.
- `git diff --check`.
- Exact byte comparison of the complete lower `campaignSend.ts` section beginning at `Pure send-formatting helpers`: unchanged from the supplied base; SHA-256 `90ef9f23b42de89287ce674c0b21fa8f2d8e908ba8474be1f159adb44d21d118`. Preserve parent PR823 when cherry-picking.

Pre-commit self-review checked modified/new content, server import direction, reactive report derivation, real Nuxt UI controls, scroll ownership, stable IDs, no URL requests and preservation of imported source and current send gates. No migration, remote database access, native build, CI trigger, deployment, provider operation or cleanup of another checkout occurred.

## Parent integration and next check

Cherry-pick the implementation commit plus this worker report, preserving PR823 lower-section send formatting and any concurrent builder changes. Parent can reconcile marketing wording such as: “Review image descriptions, action links, heading structure, inbox metadata and known readability issues before scheduling, with warnings linked to editor content.” Do not label this increment full F09 acceptance or real-client validation.

Next concrete check after integration: in the current hosted builder, open a canonical document and a complete imported template; use keyboard warning controls to select a nested block/imported region and open subject/preview settings; verify the warning list scrolls in a short viewport and a content edit refreshes the warnings without changing imported head/styles/conditionals. Confirm that intentional decorative images and unlinked images remain sendable and that existing sender/footer/unsubscribe blocks still prevent scheduling. Retain separate acceptance for asset-catalogue hydration and post-personalisation/tracking checks.
