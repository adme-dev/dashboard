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
- [ ] Port the standalone branding/save/export changes against each exact source. Classify removed functionality already supplied upstream. Preserve native storage/format identifiers and original notices. Record regenerated patch hashes and unchanged Cargo.lock hashes.
- [ ] Pin current upstream font and Rust/WASM build requirements. Build sequentially on the backup drive; bound concurrency and preserve source/package receipts.
- [ ] Verify actual browser startup, import, save/reopen/export and Flow branding for each built editor. Exercise existing dock and MotorStack file import against actual canvases, not just a synthetic drop fixture.
- [ ] Reconstruct and verify the latest gateway and complete asset inventory before preparing additive package publication. Retain every old version and all binding names/types/targets. Never deploy a partial asset directory or the obsolete rollout worker.
- [ ] Run current-main MotorStack, gateway and FigFlow regressions. Preserve newer main changes, obtain fresh live version/module readbacks, and compare current main before source integration.
- [ ] Publish immutable accepted packages, then change stable app routes. Verify authenticated editor routes, prior versions, MotorStack, FigFlow EDM and QR Codes. Record source/current main/package hashes/Worker version/deployment IDs separately.

## Connection inventory and MCP

Current docs: `docs/runbooks/motorstack-brand-kits.md`, `workers/creative-multibrand-release/README.md`, `workers/figflow-edm-assets/README.md`, and `workers/creative-launcher-card-release/README.md` supersede the old rollout's production guidance.

Implemented source and historical acceptance: canonical XeroFlow auth, fixed MotorStack HTTP adapter plus private `MotorstackBrandAssets` RPC, Banner Studio imports of brand kits/media/offers, and separately gated FigFlow EDM gateway/relay. Historical evidence must not be represented as today's live acceptance.

Unfinished standalone features: general XeroFlow project autosave/import, durable native artifacts, cross-editor document handoffs, and hosted native preview executor qualification. Do not imply that the version upgrade implements those features. The user was asked whether any other connection was intended; proceed with this documented inventory unless clarified.

FilmCraft 0.19.0 official `docs/agents.md`: `filmcraft-cli mcp` serves stdio in headless mode or desktop bridge mode. It provides command discovery/execution, project/sequence inspection, media import, rendering and desktop UI controls. The CLI lacks filesystem-confinement flags; any future hosted use must use existing scoped execution authority and actual process/filesystem isolation.

`apps/filmcraft-web/src/api.rs` and `docs/web.md`: the browser build exposes `window.filmcraft` promises for commands, requests, screenshots and file/project import. That is a browser-local control API, not a hosted MCP endpoint and not proof our current browser build is connected to the agency agent.
