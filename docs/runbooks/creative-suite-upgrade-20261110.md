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

All six target archives, source pins and Cargo.lock files were verified; branded rebuilds and actual local browser project roundtrips/exports passed. Immutable selected scopes are Photo0.22.0-flow2, Vector0.23.0-flow1, Effect0.23.1-flow1, Film0.19.0-flow2, Sound0.19.0-flow1 and standalone Fig0.17.0-flow1. Compiled Flow/XF branding and prior browser personalization are retained; see [the parity review](../../workers/creative-suite-release/PARITY.md).

Artifacts and browser receipts live on the authorized backup drive at `/Volumes/Backups/Development/creative-suite-upgrade-20261110`. Original and failed packages/stages remain retained. Local native-browser controls worked around the connected browser API navigation failure. Local tests do not establish hosted sign-in, provider import, dock/session or installed-app acceptance.

| Editor | Local browser evidence |
| --- | --- |
| PhotoFlow |320×180 brush-dot image saved as PSD, reopened in a separate document with edit intact, PNG exported. Missing relocated upstream snippet repaired without changing any original54 payloads or WASM. |
| VectorFlow |100pt rectangle saved as native vectorcraft, reopened and rendered after Fit Artboard, SVG exported with exact expected rectangle/fill/stroke. |
| EffectFlow | Demo project saved as ecproj, reopened/rendered,1920×1080 frame PNG exported. |
| FilmFlow | Saved demo fcproj reopened in rebuilt flow2. One new320×180 custom0–1s MP4 export downloaded:24H264 frames at24000/1001,48kHz stereoAAC,1.002s. Full ffmpeg decode passed. |
| SoundFlow |9-track demo saved as scraftz bundle including five audio files, reopened with waveforms/MIDI,55.884s48kHz24bit stereoWAV exported with nonzero audio. |
| FigFlow standalone |100×100 rectangle saved as figcraft, reopened/rendered in separate document,100×100 pagePNG exported. |

Photo's upstream0.22 ZIP placed wasm-bindgen snippets at root while relocating the importing glue into `app/`. The separate repaired ZIP adds the missing280-byte snippet under `app/snippets/`; fonts/licenses/WASM remain identical. Film's actual browser export exposed unsupported explicit Rayon thread-pool creation; its bounded WASM-only repair uses the existing sequential fallback and preserves native error handling. Actual WASM red→green plus57 native tests and zero-fuzz source replay passed; see [Film repair evidence](../../workers/creative-suite-upgrade/FILM-WASM-REPAIR.md).

## Existing package maintenance checks

The canonical [creative workspace implementation ledger](../plans/2026-10-28-creative-workspace-mcp.md#keeping-upstream-current) records PR728 as the owner of the weekly Monday 06:17 UTC read-only six-editor release check. Its last recorded status is default-branch integration pending. The workflow and `workers/craft-editors/UPGRADES.md` exist in the preserved rollout checkout, but are absent from the current-main base used for this upgrade (`25a384d4f3054aa208cf8378abcc755b6fcd642b`). Do not report the scheduled check as active without verifying default-branch integration and a successful scheduled run.

The existing upgrade contract also requires changelog/license and format/storage review; exact source, package, Cargo.lock, patch and font digests; branded rebuilds; browser startup/import/save/export, dock/auth and installed-app checks; retained immutable old URLs/storage; and source/deployment receipts. A version comparison alone does not close these requirements. The browser bridge joins regression coverage when shipped.

The separate [dashboard dependency audit](../security/dependency-audit-2026-07-12.md) records production audit findings and a supported-parent upgrade requirement for Zero/OpenTelemetry, with an August 12 review deadline. Its July results and deadline are historical, not evidence of the November dependency graph. A fresh `pnpm audit --prod --json` against this current-main lockfile completed on 10 November (exit 1 for findings). Registry metadata reports 6 critical, 105 high, 96 moderate and 25 low findings across dependency paths; these counts are not proof of production reachability. Raw evidence: `/private/tmp/creative-dashboard-dependency-audit-20261110.json`. Supported upgrades and reachability/exception reconciliation remain outstanding; do not silently force incompatible transitive major versions or label the entire dashboard current from the six editor checks.

All six editors compiled. Photo uses the corrected font-inclusive package; Vector uses the corrected menu patch. The final asset verification and font limitation are recorded below. All browser and publication gates above remain open.

## Independent review, staging and package maintenance

Kimi dispatch `ctx_206b0467ea63` reviewed the original build/staging constraints. Direct tools are checksummed, but the manual Trunk optimizer cache and earlier Photo/Vector patch-trial artifacts do not establish fully isolated/checksum-pinned helper-build provenance. All current packages retain original source lockfiles and licenses. Vector's30 omitted optional font-picker faces match upstream; three startup fallback fonts are included. Historical-document font fidelity remains unqualified.

Final standalone stage `assets-candidate-standalone-flow3` contains186 files; receipt SHA256 `3a4f68fda13abb616109fe66c9e72dc7a2f7cd57caf056558122b44004c50efa`. Actual quality11 compressed WASM sizes are Effect14,162,426, Film12,675,291 and Vector23,382,437 bytes. All files are below25MiB. Effect/Vector compression was reused only after encoded-hash and exact decoded-byte checks; new Film WASM was recompressed and verified. This delta must never replace the gateway's complete old ASSETS inventory.

Dashboard DOMPurify3.4.17 and its focused sanitization tests are included in PR914 but remain undeployed. Other dependency findings remain; see [dependency review](../security/dependency-review-2026-11-10.md). The read-only weekly checker is restored with14 guard tests and current six-editor upstream metadata verification. Default-branch activation and successful workflow run still require integration.

Kimi CI dispatch `ctx_115fc3a86fb5` reported production build,23,795 full-suite tests,70 serial tests and focused suites passing on Node24.18.0 for e242. Its scheduled follow-up was cancelled. The next Photo commit d9e460cfd restarted CI; final Film/personalization/routing edits require their own source commit and CI evidence. No green run is substituted for real publication or hosted acceptance.

## Connected publication and promotion

Final wrapped output is `connected-assets-candidate-009` (264 assets), frozen receipt SHA256 `fa1163712c7a4516bcce19ef36d93cb7f33501896a3156158440350ec8ac8aad`. All real stored bytes/config/manifests/gateway modules and decoded Brotli payloads are verified.48 upgradePython tests,5 releasePython guards and19 service/gateway/envelope/promotionNode tests pass. Independent Film review confirmed original branding/native behavior is preserved.

Version-local shell copies preserve dock/tab behavior, session overlay, MotorStack UI, stable installation IDs, theme/maskable icons and customized loading marks. Existing launcher, seven cards/starfield/credits and complete gateway ASSETS remain attached. Effect's new service worker unregisters only itself and deletes no origin data.

The new FigFlow default entry preserves the existing Email Library HTML and restrictive CSP, changing only its Canvas iframe to the new0.17 canvas. `?canvas=1` selects that native canvas. Explicit old versions and EDM1/3/4/5 remain intact. Specialised0.11.2-edm5 retains the custom `window.__xfFigBridge.request`, relay, constrained editing, emoji and email save authority. It is deliberately not relabelled as an upgraded0.17 email engine. An isolated feasibility attempt found13 rejected files/27 hunks and new0.17 control channels bypassing earlier admission; a future email-engine migration needs explicit admission repair and native/WASM/email acceptance. No production EDM package was changed.

The additive gateway exposes the six new prefixes only after existing fresh authorization, strips credentials to the private assets service and leaves stable paths unchanged for hosted qualification. Separate frozen promotion modules update the canonical existing launcher destinations only after recorded hosted acceptance and fresh gateway/private-service deployment/runtime/binding checks. Legacy origins and old immutable URLs retain their existing routes. No partial ASSETS replacement or parallel login/storage system is introduced.

Remaining: final source integration/CI; private upload and exact byte readback; additive gateway upload/readback; real hosted six-editor roundtrips, dock/session, MotorStack native import, Fig library/EDM and retained old-path checks; then guarded stable promotion and live receipt verification. No Creative Suite Cloudflare write has occurred at this checkpoint. Installed-app runtime behavior and universal historical-document font fidelity must not be inferred from browser/manifest checks.
