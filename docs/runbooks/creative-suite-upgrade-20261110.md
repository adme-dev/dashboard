# Creative Suite upgrade and connection review — 10 November 2026

## Current live gateway

Read-only Cloudflare Wrangler checks on 10 November identify `xeroflow-creative-tools` active version `0f9b678f-b5b3-47f5-9d84-0ab25126c6b2`, deployment `ea560989-67cb-407e-ab47-b5f2ba966e9d`, 100% traffic. Source annotation: `312d8e6ebe083e40f9c87d3c00b263cb6e972511` (EDM5 integration). Script etag: `a7a2e12a18d7a966c8f30033e1c081119cffe7f4b0c21387f7aa2ede62423963`. No deployment occurred in this review.

The gateway retains `ASSETS`, `CREATIVE_AUTH_KEY`, `MOTORSTACK_API_KEY`, and production service binding `FIGFLOW_EDM_ASSETS` → `xeroflow-figflow-edm-assets`. Compatibility date remains 2026-10-27 with `global_fetch_strictly_public`. Only binding names/types/targets were inspected; secrets were not read or copied.

The named `MotorstackBrandAssets` entrypoint advertises `listBrands`, `getBrandKit`, `getBrandAsset`, `listMedia`, `getMediaAsset` and `listCreativeCatalog`. This is live configuration evidence, not today's provider receipt or a completed user import.

## Connections to preserve

| Connection | Evidence and limits |
|---|---|
| Canonical XeroFlow sign-in | Existing encrypted handoff and fresh `/api/auth/me` checks. Old rollout auth/asset/MotorStack baseline: 47 tests passed locally today. No account/access expansion. |
| MotorStack browser asset library | Fixed read-only adapter; same-origin private binary delivery, brand membership and content validation. Existing README's real-provider evidence is historical. Actual new Rust-canvas import remains a release gate. |
| MotorStack Banner Studio kits/media/offers | Mainline private RPC, managed asset imports, current offer-image/date fixes. Seven current-source catalogue/vehicle/offer regressions passed today. Provider delivery is separate. |
| FigFlow email editor | Live gateway includes EDM5. Mainline `workers/craft-editors` pins the special 0.11.2-edm5 source/relay. Keep all EDM1/3/4/5 paths and canonical email authority. Standalone FigFlow0.17 does not silently upgrade this specialised integration. |
| XeroFlow creative AI/MCP discovery | Existing `get_creative_workspace_capabilities` and `search_creative_workspace` use the canonical registry and fresh permission/client scope. The 28 October ledger has hosted discovery evidence; this review did not run an external authenticated MCP client. |
| General native project save/import and cross-app handoff | Still not established for the six standalone browser editors. Metadata discovery does not imply file access, editing, durable artifacts or automatic project saving. |
| Native preview executor | Separate default-off/qualification work; browser upgrades do not activate it. Preserve the uncertainty hold and existing pending work. |

Canonical references: [MotorStack runbook](motorstack-brand-kits.md), [creative MCP inventory](../plans/2026-10-28-creative-mcp-inventory.md), [workspace MCP ledger](../plans/2026-10-28-creative-workspace-mcp.md), [FigFlow asset publication](../../workers/figflow-edm-assets/README.md).

Some historical README checkpoints still describe EDM4 as active. The live gateway above supersedes those current-state statements; do not blindly change old release guards or deploy an earlier gateway. Reconcile each release against fresh active/latest IDs.

## FilmFlow MCP

FilmCraft 0.19.0 officially supports `filmcraft-cli mcp` over stdio:

- Headless: operates on an in-process project, with `--project` or `--demo`.
- Desktop bridge: `--bridge 127.0.0.1:9876` talks to a desktop app started with its control channel.
- Tools cover command discovery/execution/batches, project and sequence inspection, media import, frame rendering and desktop UI controls. Long headless exports support progress/cancellation.

[Versioned official agent documentation](https://github.com/storytold/filmcraft/blob/v0.19.0/docs/agents.md).

The browser build instead exposes `window.filmcraft` with command/request/screenshot/import APIs. That is not an HTTP MCP server or proof our hosted FilmFlow is connected to the agency agent. A future adapter must use existing XeroFlow MCP identity, current project/client authority, bounded commands, revision fences and durable outcome reconciliation. A timed-out queued Film browser mutation can still execute, so never blindly retry it.

[Versioned browser documentation](https://github.com/storytold/filmcraft/blob/v0.19.0/docs/web.md).

The native MCP CLI has no filesystem confinement flags. Hosted use would require real process/filesystem isolation through the existing qualified execution boundary. No MCP registration, new credential, native service activation or remote exposure was made here.

## Upgrade acceptance

All six target source archives and browser ZIPs were downloaded and checksum verified. The standalone Flow patches were ported and clean zero-fuzz replay verified. Original Cargo.lock and attribution/license files are preserved. The separate FigFlow EDM patches are intentionally unchanged.

Build artifacts, logs and receipts live on the user-authorized backup drive at `/Volumes/Backups/Development/creative-suite-upgrade-20261110`. Individual `builds/<engine>/receipt.json` files are authoritative for compilation outcomes; a downloaded upstream ZIP or clean patch replay is not a successful branded build.

The connected browser navigation API fails with `Cannot read properties of undefined (reading 'timeoutMs')`. Native browser controls provide a working fallback. Local engine QA is now underway; hosted connections and stable-route promotion remain separate gates.

## Existing package maintenance checks

The canonical [creative workspace implementation ledger](../plans/2026-10-28-creative-workspace-mcp.md#keeping-upstream-current) records PR728 as the owner of the weekly Monday 06:17 UTC read-only six-editor release check. Its last recorded status is default-branch integration pending. The workflow and `workers/craft-editors/UPGRADES.md` exist in the preserved rollout checkout, but are absent from the current-main base used for this upgrade (`25a384d4f3054aa208cf8378abcc755b6fcd642b`). Do not report the scheduled check as active without verifying default-branch integration and a successful scheduled run.

The existing upgrade contract also requires changelog/license and format/storage review; exact source, package, Cargo.lock, patch and font digests; branded rebuilds; browser startup/import/save/export, dock/auth and installed-app checks; retained immutable old URLs/storage; and source/deployment receipts. A version comparison alone does not close these requirements. The browser bridge joins regression coverage when shipped.

The separate [dashboard dependency audit](../security/dependency-audit-2026-07-12.md) records production audit findings and a supported-parent upgrade requirement for Zero/OpenTelemetry, with an August 12 review deadline. Its July results and deadline are historical, not evidence of the November dependency graph. A fresh `pnpm audit --prod --json` against this current-main lockfile completed on 10 November (exit 1 for findings). Registry metadata reports 6 critical, 105 high, 96 moderate and 25 low findings across dependency paths; these counts are not proof of production reachability. Raw evidence: `/private/tmp/creative-dashboard-dependency-audit-20261110.json`. Supported upgrades and reachability/exception reconciliation remain outstanding; do not silently force incompatible transitive major versions or label the entire dashboard current from the six editor checks.

All six editors compiled. Photo uses the corrected font-inclusive package; Vector uses the corrected menu patch. The final asset verification and font limitation are recorded below. All browser and publication gates above remain open.

## Independent Kimi review and corrections

Kimi dispatch `ctx_206b0467ea63` completed read-only review. All six manual branded builds succeeded with unchanged Cargo.lock. Vector's malformed menu tuple was corrected and rebuilt; its successful ZIP is `28ef7440e4121e4e30a7f8364b3b57e934f2f21b4379a9f8d5f8e6f8a3494ba7`.

The previous hypothetical Brotli inspection is **not actual publication asset proof**. Effect, Film and Vector raw WASM exceed 25 MiB; Vector quality-8 compression also exceeds the limit. Quality-11 round-trip succeeds at 23,382,437 bytes in review. Actual compressed files and route mappings have now been produced and independently verified: Effect14,162,426 bytes, Film12,682,235 bytes and Vector23,382,437 bytes. All185 staged files are below25MiB. Output: `/Volumes/Backups/Development/creative-suite-upgrade-20261110/assets-candidate-standalone-flow1`. This remains an unpublished delta, not a complete ASSETS inventory. No partial ASSETS directory may replace the live inventory.

Vector's 30 omitted background font-picker faces match the upstream 0.23.0 release and its own pinned font revision. Three startup fallback fonts are present. Existing-document font rendering remains an acceptance gate. Manual build provenance also remains partial: environment inheritance, absent embedded source SHA in Photo, shared unverified optimizer cache and residual patch trial artifacts in Photo/Vector build trees do not constitute clean helper-build proof.

Native Safari/Brave/Chrome fallback loads actual locally staged editors. See the current browser checkpoint below; API navigation failure no longer blocks local QA.

Dashboard DOMPurify was updated to 3.4.17 with five focused tests passing. The fresh production audit has zero DOMPurify advisories but retains other findings; see [dependency review](../security/dependency-review-2026-11-10.md). This is included in PR914; it remains undeployed.

The weekly checker has been restored in `.github/workflows/creative-tools-updates.yml`, targeting the isolated candidate checker. Fourteen guard tests passed; the live metadata report confirmed all six candidate versions current. This does not activate the schedule until default-branch integration and a successful run. Fresh fetch still matched base `25a384d4f3054aa208cf8378abcc755b6fcd642b`.

## Connected additive publication candidate

`workers/creative-suite-release/` now prepares an additive private assets service and a gateway candidate against the verified EDM5 modules. Final wrapped output: `/Volumes/Backups/Development/creative-suite-upgrade-20261110/connected-assets-candidate-006` (263 assets). Receipt SHA256: `97876c939a00a3b37880e6754756d64f123c99162d4eb5a7f3f579f2c4d42e44`.

Version-local dock, session, install and MotorStack UI assets are included. Effect service-worker retirement unregisters only itself and deletes no caches. Exact new version prefixes dispatch after fresh gateway authorization with stripped credentials; old ASSETS, all EDM paths and the FigFlow Email Library remain. All service upload files/config/inventory/compressed mappings and gateway modules are frozen and verified; 15 focused tests passed. Independent review found no material behavior blocker; its account-target and upload-envelope corrections are implemented. Current gateway reconciliation, upload/readback, browser acceptance and stable-route promotion remain pending. This candidate does not activate native MCP, cross-app document persistence or provider imports.

## Current browser and Photo packaging checkpoint

Native local-browser QA exposed a real upstream Photo0.22 packaging defect: relocated `app/photocraft-web.js` imports a snippets module left only at the package root. The published upstream ZIP has the same missing relative target. The bounded repair copies that existing280-byte module under `app/snippets/`; all54 original payloads, fonts, licenses and compiled WASM bytes remain identical. The immutable Photo URL advances to `0.22.0-flow2`; failed flow1 and candidates001–005 remain retained as evidence, not release selections.

Selected Photo ZIP SHA256: `7752ab741a35d3f2b94a0cac68c13127f3b718a0294ade980b8892a5223d572f` (45,330,944 bytes). Standalone stage `assets-candidate-standalone-flow2` contains186 files; receipt SHA256 `6fad6a18b82f2d81111e3bcead15fc0f47cc62adab0046101e7248ff8dddb410`. Previously verified Brotli files are reused only after encoded hash and decoded byte comparisons. The helper reports quality11 for these known quality11 artifacts; future reuse should identify provenance explicitly rather than infer compression quality. A repair failure currently fails closed before a failed-build receipt is written; original archive and logs remain.

PhotoFlow in Brave created a320×180 image with a black brush dot, saved PSD, exported PNG, and reopened the saved PSD in a separate document with the dot intact. VectorFlow saved its100pt rectangle document, reopened it in Brave and rendered the geometry after Fit Artboard, then downloaded SVG. FilmFlow demo saved/reopened; the single H264 request still needs outcome reconciliation. SoundFlow demo rendered; its native project roundtrip/export plus EffectFlow/FigFlow checks remain open. Download hashes are retained in `browser-evidence/` on the backup drive. These local bare-editor checks do not establish authenticated hosted connections.

Kimi CI dispatch `ctx_115fc3a86fb5` reported local production build,23,795 full-suite tests,70 serial tests and focused suites passing on required Node24.18.0. Remote run42780165171 at e242 remained in progress at step24/36 with all completed steps passing. Its scheduled follow-up was cancelled. Photo repair needs a new commit and CI run; no Creative Suite Cloudflare write has occurred.
