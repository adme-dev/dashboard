# FigFlow source/build release reconciliation — read-only

Inspected current dashboard `ec0dcd39ebea98b45b9976bf297de96575841dd2`, both candidate worktrees, their root AGENTS/CLAUDE guidance, tracked pins/scripts, and the complete browser-bridge patch. No files, refs, dependencies, deployments, or owners were changed/contacted.

## Verified ownership and repository state

- Upstream owner/source: `https://github.com/storytold/figcraft`, commit `d4a303d4708602a9df1738960852d18b185a616b`, version `0.11.2`. Both candidates' `source-pins.json` are identical: source archive `04710e78…a09aaa6`, Cargo.lock `53939720…35b94`, branding patch, and additional patches `figflow-browser-save.patch`, `figflow-xf-mark.patch`, `figflow-browser-export-bound.patch`.
- Current main has neither `workers/craft-editors/` nor `.github/workflows/creative-tools-build.yml`.
- `../creative-tools-mainline-20261028`: clean, branch `adme-dev/creative-tools-mainline-20261028`, HEAD `90f8fab183722b00d4e2483403e33cc7148a7908`; local `origin/main` is current `ec0dcd39e`, divergence **2 ahead / 99 behind**.
- `../craft-hosted-rollout-20261028`: HEAD `202d57b97f1da2ad5aba82e4b85041dee791ed87`; divergence **34 ahead / 102 behind**. It has extensive unrelated modified/untracked banner/runtime work. Under craft-editors its only status entry is untracked `workers/craft-editors/patches/figflow-browser-bridge.patch`; there are no tracked craft-editor modifications.
- The tracked craft-editor/workflow trees at the two candidate HEADs have no path differences. Use the clean mainline worktree for tracked-file reference, not the dirty rollout.
- Current main already tracks `docs/plans/fixtures/figflow-browser-bridge.patch`. It is byte-identical to the rollout's untracked patch; both have SHA-256 `f8dadb47c6c72177c2cc836b425ea5c714c510cb730b09ffda46836226b0fc06`. No recovery from the dirty worktree is needed.
- The historical `/private/tmp/flow-source-build-20261028` source/archive directory is absent now. This audit did not rebuild or independently re-hash that archive; CI must fetch and verify the recorded pins.

## Native bridge readiness blockers

1. **Not a build input or deployed capability.** `figflow-browser-bridge.patch` is absent from `additional_patches`; the clean mainline has no bridge patch. The currently hosted WASM therefore must not be described as containing this bridge. Existing decoded-bundle identity evidence applies to `0.11.2-flow1`, not a bridge build.
2. **Manual native workflow is not bridge acceptance.** The reported visible 240×160 native save/reopen/PNG export proves the existing UI workflow. The candidate bridge exposes only `status`, `inspect`, `get_node`, `create_node`, and `update_node`; its status explicitly says `exports: false`. It has no native snapshot, open, PNG export, or EDM actions.
3. **Tests exist only inside the unbuilt patch.** Seven Rust tests cover replay/conflicts/allowlists/fences/projection, but `ci-build-browser.sh` runs only save/mark/export/zip filters. A `browser_bridge` filter must be added and pass before accepting a build.
4. **No remote authority or durable EDM session.** The patch installs page-global `window.__xfFigBridge` and explicitly grants no tenant/project authority. It has no authenticated relay, client/session binding, durable snapshot delivery, upload receipt, revocation, or native-artifact transport. Those remain F06 server/session work, not JavaScript injected into the current bundle.
5. **No new hosted version/receipt exists.** A bridge package needs source/build/test receipts and actual WASM browser reconciliation. Do not reuse the old archive hash or claim the R&D fixture is production-ready.

## Linux/build requirement

`ci-build-browser.sh` hard-requires `Linux:x86_64` and `RUNNER_TEMP`; it is not a macOS build command. The owning workflow uses Ubuntu 24.04, pinned Rust 1.95.0/wasm32, Trunk 0.21.14, wasm-bindgen 0.2.129, locked source/fonts/tool hashes, and artifact receipts. Required shapes are:

```sh
bash workers/craft-editors/ci-build-browser.sh figcraft test
bash workers/craft-editors/ci-build-browser.sh figcraft web
```

The workflow builds/uploads artifacts only; it does not deploy. Its push trigger is specifically the old `adme-dev/craft-hosted-rollout-20261028` branch, so copying it unchanged does not create a current-main push build. PR/manual behavior must be reviewed deliberately after default-branch integration.

## Smallest correct next file set

Use path-based reconciliation onto freshly verified current main, **not** a whole-branch merge or cherry-pick of `5267f12c…` (which introduces the full six-app hosting/update stack).

### Stage A — native FigFlow source build only

Take these tracked files from clean mainline `90f8fab1`:

- `.github/workflows/creative-tools-build.yml`
- `workers/craft-editors/source-pins.json`
- `workers/craft-editors/ci-setup.py`
- `workers/craft-editors/ci-build-browser.sh`
- `workers/craft-editors/build-browser.sh`
- `workers/craft-editors/patches/figflow-branding.patch`
- `workers/craft-editors/patches/figflow-browser-save.patch`
- `workers/craft-editors/patches/figflow-xf-mark.patch`
- `workers/craft-editors/patches/figflow-browser-export-bound.patch`

Then, as a separately reviewed native change, add `workers/craft-editors/patches/figflow-browser-bridge.patch` using the already-tracked R&D fixture as reference, add its checksum to `additional_patches`, add the missing CI test filter, and complete the required snapshot/export actions or explicitly keep them out of scope. Do not pin the unchanged R&D patch and call it ready.

Do not include unrelated editor patches, banner changes, artwork, old evidence, `creative-tools-updates.yml`, or the update scheduler in this native slice.

### Stage B — only after accepted native artifacts

Reconcile the existing package/host dependencies as a separate reviewed set: `prepare.py`, `brand_package.py`, `pwa_package.py`, `rebuilt-releases.json`, `releases.json`, `worker.mjs`, `auth.mjs`, `motorstack.mjs`, their `worker/auth/motorstack` tests, `index.html`, `credits.html`, `assets/`, and `static/`. Existing auth/worker code provides account access, not the new automation relay. The packaging manifest and previous-version output must be chosen deliberately; a FigFlow-only ZIP does not satisfy the existing six-app manifest by itself.

## Release collision gates

- Both candidates are substantially behind current main. Do not merge/cherry-pick their branch histories or use the dirty rollout as a release base.
- A same-upstream repair must use a new hosted suffix such as `0.11.2-flow2`; never replace `0.11.2-flow1` immutable WASM or its service-worker/version scope. Preserve old version URLs and open tabs.
- Hosting is standalone Worker **`xeroflow-creative-tools`**, not dashboard Pages **`agency-dashboard`**. Do not use dashboard `pnpm deploy:*` for this artifact. Stable routes change only after actual candidate browser acceptance and separate target/version verification.
- Keep current native documents/storage origins and previous artifacts available for rollback. A source archive, CI success, or manual UI round trip alone does not authorize route promotion.
- No feature-flag enablement is recommended by this audit. Native bridge build, scoped session/relay, snapshot/export, revocation, and live acceptance remain open; the existing foundation is not a complete FigFlow EDM feature.
