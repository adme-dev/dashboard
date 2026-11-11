# Creative Suite upstream upgrade implementation plan

> Execution: continue in this session under the user's upgrade request; preserve current main and unrelated work.

## Goal and scope

Upgrade the six standalone browser editors to the stable upstream releases verified on 10 November 2026. Preserve XeroFlow branding, canonical sign-in, seven launcher cards, dock, MotorStack catalogue/brand/media/offer RPC, existing browser documents and every published FigFlow EDM version. Check FilmCraft MCP support; do not install/register a new MCP server or expose unrestricted commands as part of version discovery.

Fresh base: dashboard origin/main `25a384d4f3054aa208cf8378abcc755b6fcd642b`.
Old browser rollout: `202d57b97f1da2ad5aba82e4b85041dee791ed87`, 34 commits ahead / 420 behind main. Never release that checkout wholesale.
Worktree: `/Volumes/Backups/Development/OrcaWorkspaces/dashboard/dashboard/creative-suite-upgrade-20261110`.
Build/evidence root: `/Volumes/Backups/Development/creative-suite-upgrade-20261110`.

## Inputs

| Editor | Prior standalone pin | Target |
|---|---|---|
| PhotoFlow | 0.16.0 | 0.22.0 |
| VectorFlow | 0.17.0 | 0.23.0 |
| EffectFlow | 0.17.0 | 0.23.1 |
| FilmFlow | 0.13.0 | 0.19.0 |
| SoundFlow | 0.13.1 | 0.19.0 |
| FigFlow | 0.11.2 | 0.17.0 |

The standalone FigFlow upgrade must not change `workers/craft-editors/source-pins.json`, its EDM patches or `workers/figflow-edm-assets` runtime pointers. Those are a separately qualified integration on main, currently based on 0.11.2. Retain that upstream version until its complete connection contract is ported and independently accepted.

## Steps

- [x] Verify current stable tags, source revisions, browser ZIP checksums and source archive checksums. Retain candidate manifests and originals; no live pin promotion.
- [x] Read existing browser, upgrade, native execution, MotorStack and current FigFlow gateway docs. Baseline old checkout auth/asset/MotorStack tests: 47 passed.
- [x] Create a fresh-main worktree and use the authorized backup drive for resources.
- [x] Replay all original patches with zero fuzz on isolated new source. All engines require ports; preserve rejects/logs. Separately test current-main FigFlow EDM patches only to measure compatibility, not to promote them.
- [x] Port the standalone branding/save/export changes against each exact source. Classify removed functionality already supplied upstream. Preserve native storage/format identifiers and original notices. Record regenerated patch hashes and unchanged Cargo.lock hashes.
- [x] Pin current upstream font and Rust/WASM build requirements. Build sequentially on the backup drive; bound concurrency and preserve source/package receipts.
- [x] Verify local actual-browser startup, native project save/reopen and export for all six built editors; Photo packaging and Film encoder runtime repairs qualified.
- [x] Verify hosted wrapped startup/save/reopen/export, dock/session and real MotorStack native-canvas import after additive publication.
- [x] Reconstruct exact EDM5 gateway modules and prepare a private additive assets service with frozen inventory/envelopes. Preserve the complete existing ASSETS binding and all old versions; never replace it with a partial delta.
- [x] Run current-main MotorStack/gateway/FigFlow regression baselines and focused release guards.
- [x] Reconcile fresh current main, CI and live gateway/private-service state before each integration/upload/promotion.
- [x] Publish immutable accepted packages, then change stable app routes. Verify authenticated editor routes, prior versions, MotorStack, FigFlow EDM and QR Codes. Record source/current main/package hashes/Worker version/deployment IDs separately.

## Connection inventory and MCP

Current docs: `docs/runbooks/motorstack-brand-kits.md`, `workers/creative-multibrand-release/README.md`, `workers/figflow-edm-assets/README.md`, and `workers/creative-launcher-card-release/README.md` supersede the old rollout's production guidance.

Implemented source and historical acceptance: canonical XeroFlow auth, fixed MotorStack HTTP adapter plus private `MotorstackBrandAssets` RPC, Banner Studio imports of brand kits/media/offers, and separately gated FigFlow EDM gateway/relay. Historical evidence must not be represented as today's live acceptance.

Unfinished standalone features: general XeroFlow project autosave/import, durable native artifacts, cross-editor document handoffs, and hosted native preview executor qualification. Do not imply that the version upgrade implements those features. The user was asked whether any other connection was intended; proceed with this documented inventory unless clarified.

FilmCraft 0.19.0 official `docs/agents.md`: `filmcraft-cli mcp` serves stdio in headless mode or desktop bridge mode. It provides command discovery/execution, project/sequence inspection, media import, rendering and desktop UI controls. The CLI lacks filesystem-confinement flags; any future hosted use must use existing scoped execution authority and actual process/filesystem isolation.

`apps/filmcraft-web/src/api.rs` and `docs/web.md`: the browser build exposes `window.filmcraft` promises for commands, requests, screenshots and file/project import. That is a browser-local control API, not a hosted MCP endpoint and not proof our current browser build is connected to the agency agent.

## Published checkpoint

PR914 merged at9ac1d65c399f0bf5c003b96530d4dcdcd4309129; final-head CI42787149717 passed. All six hosted roundtrips/exports passed and normal suite routes were promoted on10November. Gateway versionb13ec84c-3f51-4d8d-a002-24b276b5ea41, deployment78b40e3a-a4a6-4952-838a-434e624d9580. See [the release ledger](../../runbooks/creative-suite-upgrade-20261110.md) for private/additive/stable receipts and scoped acceptance. The separate dashboard DOMPurify Pages deployment succeeded at source 9ac, deployment b375fe5a-aa12-41f7-89be-4ffedb49b4a7. Public-host bytes and signed-out login were checked. The remaining signed-in post-deploy owner dashboard/QR navigation check passed on 12 November after the existing Brave session recovered; this was read-only, with no QR mutation or scan and no employee acceptance claim. PR915 integrated the publication receipt/checker after green full CI.
