# Creative Suite upgrade and connection review — 10 November 2026

## Published existing online suite

The six standalone editors are upgraded on the existing [XeroFlow Creative Suite](https://creative.xeroflow.io). PR914 merged at `9ac1d65c399f0bf5c003b96530d4dcdcd4309129`; its content equals reviewed head `d059b7d06b1594ecc22490bb089f46e9483e0273`. Required CI [42787149717](https://github.com/adme-dev/dashboard/actions/runs/42787149717) passed all36 steps on Node24.18.0. Current main was freshly fetched and equal to the release source before private publication, additive activation and stable promotion.

| Stable entry | Published editor | Hosted verification |
| --- | --- | --- |
| `/photoflow/` | `0.22.0-flow2` | Actual Motorstack Favicon imported as180×180 native layer; PSD saved/reopened with logo and layer intact; PNG exported. |
| `/vectorflow/` | `0.23.0-flow1` | Native100pt rectangle project saved/reopened/rendered; SVG parsed with expected100×100 rectangle. |
| `/effectflow/` | `0.23.1-flow1` | Eight-layer composition saved/reopened/rendered;1920×1080 framePNG exported. |
| `/filmflow/` | `0.19.0-flow2` | Twelve-item native project saved/reopened/rendered; one320×180,0–1s MP4 exported. ffprobe found24H264 frames and48kHz stereoAAC; full ffmpeg decode passed. |
| `/soundflow/` | `0.19.0-flow1` | Nine-track scraftz bundle including fiveWAVs saved/reopened with audio/MIDI;55.884s48kHz24bit stereoWAV bounced with nonzero audio. |
| `/figflow/` | `0.17.0-flow1` canvas | Native figcraft saved/reopened with rectangle rendered and100×100PNG exported **inside the preserved library iframe**. |

Each stable entry was followed in the signed-in owner's Brave session after promotion and resolved to its new immutable prefix. The retained launcher shows all seven cards, including Banner Studio. The new FigFlow entry retains Canvas and Email templates; `?canvas=1` selects its0.17 native canvas. Specialised email editing remains **0.11.2-edm5** with its existing relay, constrained editing, emoji and save authority. This release does not relabel EDM5 as a0.17 email engine.

## Deployment receipts and rollback

The immutable machine-readable record is [published-release.json](../../workers/creative-suite-release/published-release.json). Cloudflare account: `a5b299b3ad15c1b5b895dc66f9357b17`.

| Target / stage | Version | Deployment |
| --- | --- | --- |
| Private `xeroflow-creative-standalone-assets` | `95469284-d389-4382-b670-7bdcf1d9af5d` | `ba855df5-c299-498c-955c-c4437aa093f0` |
| Additive gateway, stable selections still old | `ded0740d-08b2-4f84-b47b-c261f89b58cd` | `cf18332f-b1d8-4885-b072-b409d78f63b0` |
| **Promoted `xeroflow-creative-tools`,100% traffic** | `b13ec84c-3f51-4d8d-a002-24b276b5ea41` | `78b40e3a-a4a6-4952-838a-434e624d9580` |

Promoted gateway etag: `1978ecce5a06482ccb63f5de36c80009793e90435c0da68a3d83932a05f5d26b`. The private service has no public routes, workers.dev or preview URL; direct workers.dev returned404. Its264 decoded assets, five negative checks and HEAD behavior passed remote binding readback. Stored compressed input hashes were verified before upload. Cloudflare's proxy can decompress/recompress transport, so unchanged encoded wire bytes are not claimed.

The gateway retains its complete original ASSETS inventory, `CREATIVE_AUTH_KEY`, `MOTORSTACK_API_KEY`, production `FIGFLOW_EDM_ASSETS` binding, compatibility date2026-10-27 and runtime settings. Only `CREATIVE_STANDALONE_ASSETS` was added. Five binding names/types/targets, runtime, source annotations, latest uploads and active deployments were read back before allocation. No secrets were read/copied. Fresh authorization still precedes private dispatch; credentials are stripped before forwarding.

Rollback selection: additive version `ded0740d-08b2-4f84-b47b-c261f89b58cd` restores old stable selections while keeping new immutable URLs available. Pre-upgrade EDM5 gateway `0f9b678f-b5b3-47f5-9d84-0ab25126c6b2`, deployment `ea560989-67cb-407e-ab47-b5f2ba966e9d`, is also retained. Reconcile current active/latest versions and bindings before any rollback. Do not execute older EDM4/EDM5 historical deployment guards unchanged.

## Personalisation and existing connections

Compiled Flow/XF branding, original launcher artwork/starfield/credits, version-local dock/tab behavior, custom loading mark, theme, maskable icons, installation identities and account/session overlays are retained. No origin storage was cleared. Old immutable URLs remain available; oldPhoto0.16 was opened again through the dock after additive activation. Legacy worker.dev origins retain their existing selections/storage. See [PARITY.md](../../workers/creative-suite-release/PARITY.md).

| Connection | Current evidence and limits |
| --- | --- |
| XeroFlow sign-in and dock | Owner signed in through the established handoff; all six hosted immutable versions accepted that session. Dock retains six editor links, Creative Suite, Install and Motorstack actions. |
| Motorstack browser library | Actual current provider brands/catalogue loaded; Alfa Romeo Favicon imported into new PhotoFlow's native canvas and roundtripped asPSD. |
| Motorstack Banner Studio kits/media/offers | Existing private `MotorstackBrandAssets` entrypoint and fixed adapter retained. Seven current-source regressions passed. Today's Photo import does not prove a new Banner Studio import or provider delivery. |
| FigFlow library/email | New default library embeds new canvas. Email templates still read eight existing templates through canonical `app.xeroflow.io/agency/email?tab=templates&workspace=figflow`. EDM1/3/4/5 routes, binding and modules are unchanged. No email draft, template mutation or send was created; no new EDM persistence roundtrip is claimed. |
| Creative AI/MCP discovery | Existing capability/search registry and fresh client/permission authority retained. Historical hosted discovery evidence is separate from a new external MCP client check. |
| QR Codes / established navigation | Existing owner dashboard and QR Codes page loaded during release checks. No QR record was created or changed. |

Canonical references: [Motorstack runbook](motorstack-brand-kits.md), [creative MCP inventory](../plans/2026-10-28-creative-mcp-inventory.md), [workspace MCP ledger](../plans/2026-10-28-creative-workspace-mcp.md), [FigFlow publication](../../workers/figflow-edm-assets/README.md).

## Package and build evidence

All six target archives, exact source pins and Cargo.lock files were verified; branded rebuilds and local browser project roundtrips/exports passed before hosted checks. The frozen connected candidate009 contains264 stored files, each below25MiB, receipt SHA256 `fa1163712c7a4516bcce19ef36d93cb7f33501896a3156158440350ec8ac8aad`. Original/failed packages and all candidates are retained on the authorized backup drive at `/Volumes/Backups/Development/creative-suite-upgrade-20261110`. Actual browser artifact hashes and scoped checks are under `browser-evidence/`; `hosted-acceptance-009.json`, private readback, upload/activation logs and `release-state.json` distinguish each delivery stage.

Photo's upstream0.22 ZIP relocated JS into `app/` but left an imported wasm-bindgen snippet only at root. The bounded flow2 repair adds one280-byte copy under `app/snippets/`; all54 original payloads, WASM, fonts and licenses remain identical. Film's actual browser export exposed explicit Rayon pool creation unsupported onWASM. Its WASM-only fix uses the existing sequential fallback while retaining native error handling, slices and rate control. Actual WASM red→green,57 native regressions and zero-fuzz source replay passed. See [Film repair](../../workers/creative-suite-upgrade/FILM-WASM-REPAIR.md).

48 upgradePython tests,5 releasePython guards and19 Node service/gateway/envelope/promotion tests passed. Independent review covered branding/native preservation,264 actual file hashes, routing after auth, old paths/EDM and five bindings. The library CSP gap found in candidate008 was corrected in009 to match the original restrictive policy and covered by runtime assertions.

Manual helper-build provenance remains bounded: direct tools are checksummed, but shared Trunk wasm-opt cache and earlier Photo/Vector trial artifacts do not prove a fully isolated helper build. Vector's30 absent optional font-picker faces match upstream; three startup fallback fonts are present. Installed-app runtime behavior and universal historical-document/font fidelity are not inferred from manifests and browser fixture checks.

## Ongoing version and dependency checks

The Monday06:17UTC read-only workflow is restored on main byPR914. Its first manual mainline run [42795530493](https://github.com/adme-dev/dashboard/actions/runs/42795530493) succeeded at release source9ac. This establishes workflow execution/default-branch integration; no Monday scheduled event is claimed before it occurs. The checker now compares exact original upstream inputs and the separate published receipt, including today's six selected versions. It never downloads application binaries, changes pins, builds, deploys or sends messages. Seventeen deterministic guards validate metadata handling and published receipt admission. PR915 integrated the published baseline at `c60704893d21a26cf420f0a12cd448f2105d4f43`; full CI 42802075699 and the branch upstream workflow 42802083329 passed. A version match does not substitute for upgrade qualification.

The broader dashboard audit is separate. DOMPurify3.4.17 and five focused tests are merged inPR914. Production Pages run [42795537384](https://github.com/adme-dev/dashboard/actions/runs/42795537384) attempt2 succeeded, including all CI gates and guarded source deployment. The guard verified sourceCommit=mainCommit=`9ac1d65c399f0bf5c003b96530d4dcdcd4309129`. Provider readback confirms `agency-dashboard` production deployment `b375fe5a-aa12-41f7-89be-4ffedb49b4a7`. The live app and immutable deployment serve the same 244,964-byte JavaScript entry, SHA256 `0264763e6dca0c7e9b974e4e0c33b7a3d572058ab10d3f47b5f7a4fc35f071e6`; the signed-out browser reaches the expected login redirect for QR Codes. This verifies deployment/public-host provenance, not every bundle or protected-page behavior. The initial 10 November post-deploy owner check was blocked by the browser connection (`cgWindowNotFound`; extension `timeoutMs` failure). On 12 November, the existing signed-in Brave owner session recovered: `/agency/qr-codes` rendered its heading, existing QR cards/thumbnails, client/search controls and creation controls; its Dashboard link opened `/agency` with the owner greeting and normal work/board/dashboard sections. The current public document still selects the same JavaScript entry and its hash matches the deployed receipt. This closes the owner-only post-deploy navigation/rendering check. No QR was created, edited, exported or scanned; ordinary employee acceptance is not implied. No credentials/cookies were copied and no sign-in message was sent. See [the bounded deployment receipt](creative-suite-dashboard-deployment-20261110.json). The first attempt failed only on the Ubuntu media-package download timeout before source checks; no source change was needed for the successful retry. The fresh audit still reports5critical,104high,95moderate and23low dependency paths, with zeroDOMPurify advisory entries. See [dependency review](../security/dependency-review-2026-11-10.md). No universal package currency or clean audit is claimed.

The historical Zero/OpenTelemetry exception and August12 deadline are not renewed. Supported parent upgrades/reachability and the remaining findings stay separate follow-up work.

## FilmFlow MCP and remaining capabilities

FilmCraft0.19 officially supports `filmcraft-cli mcp` overstdio in headless mode (`--project`/`--demo`) or desktop bridge mode (`--bridge 127.0.0.1:9876`). Tools cover command discovery/execution/batches, project/sequence inspection, media import, rendering and desktop UI controls; long exports support progress/cancellation. [Versioned official agent docs](https://github.com/storytold/filmcraft/blob/v0.19.0/docs/agents.md).

Its browser build exposes `window.filmcraft` commands/requests/screenshots/import APIs. This is not an HTTP MCP server or proof hosted FilmFlow is connected to an agency agent. The native CLI has no filesystem-confinement flags; hosted use needs the existing qualified execution boundary, real process/filesystem isolation, current project/client authority, revision fences and durable outcome reconciliation. A timed-out queued browser mutation can still execute: reconcile it before retrying. [Versioned official browser docs](https://github.com/storytold/filmcraft/blob/v0.19.0/docs/web.md).

No native MCP registration, credential, service activation or remote exposure occurred. Shared XeroFlow project autosave, durable native artifacts and cross-editor document transfer remain separate capabilities. A future specialised0.17 email-engine port needs admission/control-channel repairs and native/WASM/email acceptance: the isolated feasibility attempt had13 rejected files/27 hunks and bypassed older admission paths. Retaining EDM5 preserves the existing supported email behavior.
