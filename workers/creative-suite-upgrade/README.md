# Standalone creative-suite upgrade candidate

**All six manual branded builds and actual standalone asset staging succeeded; complete-inventory integration and browser acceptance remain pending.** Build receipts are attached in `validation.json`. These are manual-driver evidence, not proof that the isolated helper bootstrap/build ran. Source preparation and patch replay do not establish compiler, browser, hosted, save/reopen, provider or customer acceptance. This directory has no gateway, ASSETS upload, route-switch or deployment command.

This candidate contains PhotoFlow 0.22.0, VectorFlow 0.23.0, EffectFlow 0.23.1, FilmFlow 0.19.0, SoundFlow 0.19.0 and standalone FigFlow 0.17.0. It is independent of the production FigFlow EDM integration. `workers/craft-editors/` and its independently pinned FigCraft 0.11.2 source/bridge are unchanged.

## Inputs

- `source-pins.json`: exact upstream commit/archive and unchanged Cargo.lock hashes, combined reviewed patch hash, Rust/wasm-bindgen versions and required font revisions.
- `upstream-releases.json`: original upstream browser release archives and digests. These are verification inputs, not branded build outputs or evidence of a hosted deployment.
- `patches/`: six combined standalone ports; existing file/storage/protocol identities and attribution/licenses are retained.
- `tools.json`: checksum-pinned direct macOS arm64 tools: Rust 1.95.0 bootstrap, Trunk 0.21.14 and wasm-bindgen 0.2.129. Other hosts require separately reviewed tool URLs/digests. Rustup verifies downloaded Rust components against its official distribution checksums.

Photo/Vector/Film use craft-fonts `b076417b5880bd4154bd22f00695b1d28c6bea83`; Fig uses `37827adc41fd165f9a9234ac40f94dbad353aa69`. Their archive hashes are pinned; browser builds require these fonts. Photo additionally sets `PHOTOCRAFT_WEB_FONTS_DIR` to the verified font checkout: its web packaging copies `fonts/manifest.txt` and every referenced font/license into the site for on-demand fetches. `CRAFT_FONTS_DIR` alone does not supply Photo browser fonts, and repackaging these served assets does not change its wasm. The Photo-specific variable is not passed to the other engines. Inspection of all six web packaging scripts and shared packaging environments found no other engine-specific font-directory override. Effect/Sound retain their upstream bundled font inputs.

Fig 0.17.0 supplies browser Save/Save As and download completion handling upstream. Its multi-file export uses `zip:true` with a cumulative 256 MiB retained ZIP payload cap and 1000-file bound. The old standalone save and `maxBytes` export patches are deliberately retired. Render transients, ZIP and Base64 still need additional memory. No EDM bridge or EDM polish patch is included. Browser save/reopen acceptance remains required.

## Transitive optimizer limitation

The toolchain is **not fully checksum-pinned or fully isolated**. Trunk 0.21.14 selects Binaryen `wasm-opt version_123`; the helper explicitly sets `TRUNK_TOOLS_WASM_OPT=version_123` and `TRUNK_TOOLS_WASM_BINDGEN=0.2.129`. The optimizer's macOS arm64 archive URL is recorded in `tools.json`, but its SHA256 and cached binary/library provenance have not been verified. Trunk may download it or reuse its existing platform-wide cache outside the build root. This cache is distinct from the isolated Cargo/Rustup homes and target directory.

This follows the exact [Trunk 0.21.14 tool configuration](https://github.com/trunk-rs/trunk/blob/v0.21.14/src/config/models/tools.rs) and [tool lookup/download/cache implementation](https://github.com/trunk-rs/trunk/blob/v0.21.14/src/tools.rs). That implementation uses `directories::ProjectDirs` for cache location; no dedicated cache override was found in that version's tools implementation. A version selector is not an archive integrity check. Before claiming complete build provenance, add a verified Binaryen archive and its required macOS runtime library to the bootstrap inputs and ensure Trunk uses those verified files. The helper's future build receipt carries this limitation.

The root operator's manually initiated builds and receipts are separate evidence; this helper's `bootstrap` and `build` have not been executed.

## Reproduce

Python 3.11+ and `patch` are required. Obtain original archives using the exact URLs in the JSON files into read-only input caches. Every consumed archive/patch is checksum verified before extraction. No download occurs during `prepare`. Choose a fresh absolute build root outside the repository for each engine, preferably on the backup volume:

```sh
python3 workers/creative-suite-upgrade/prepare.py prepare figcraft \
  --root /Volumes/Backups/Builds/figflow-candidate-001 \
  --archives /Volumes/Backups/Development/creative-suite-upgrade-20261110/candidate/archives \
  --fonts /Volumes/Backups/Development/creative-suite-upgrade-20261110/fonts

# Explicit operator step: installs the pinned toolchain into this build root;
# Rustup needs access to official Rust distribution downloads.
python3 workers/creative-suite-upgrade/prepare.py bootstrap \
  --root /Volumes/Backups/Builds/figflow-candidate-001 \
  --cache /Volumes/Backups/Development/creative-suite-upgrade-20261110/tools

# Explicit operator step: builds with upstream packaging/web/package.sh.
python3 workers/creative-suite-upgrade/prepare.py build \
  --root /Volumes/Backups/Builds/figflow-candidate-001
```

Preparation refuses existing roots, linked/traversing archive members, excessive expansion/member counts, unexpected archive roots, unsafe patch paths/targets, checksum failures, nonzero patch replay and changed Cargo.lock. It applies patches with `--fuzz=0` and records the prepared source/font manifests. Partial failed roots remain as evidence; use a fresh root rather than retrying over them.

Each root has isolated Rustup/Cargo homes and target/output/temp directories. Build uses exactly three jobs and disables incremental compilation. Caller-provided compiler/output overrides are not inherited. Build checks the prepared source/fonts and pins before running, refuses a second build directory, checks Cargo.lock afterward, and requires exactly one output ZIP before issuing `built-unpublished`. Build logs, package sizes/hashes and receipt live under `<root>/build/`. Upstream packaging gates remain intact. Source inputs are reproducible; byte-identical ZIPs are not promised because upstream packaging may include timestamps.

Do not reuse the active manual build driver's targets or toolchain homes. This helper does not change `/private/tmp/creative-build-20261110.py` or import source from an old worktree.

## Checks and remaining acceptance

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s workers/creative-suite-upgrade -p 'test_*.py' -v
```

The tests use temporary fixtures and exercise real zero-fuzz patch application, failed replay, changed lockfiles, checksums, path traversal/symlinks, extraction limits, overwrite refusal, environment isolation and modified-source rejection. They do not install tools or build editors.

Before release: attach successful per-engine build receipts and branded ZIP hashes, run upstream/focused regression checks, verify actual browser open/edit/save/reopen/export flows and retained licenses, review access control, then publish through a separately reviewed release mechanism. This candidate alone authorizes no production route change.


Photo 0.22.0 packaging requires `repair_photo_package.py` after upstream packaging: its bootloader relocates wasm-bindgen glue into `app/` but upstream leaves its relative snippets at root. The build helper retains the original ZIP in `build/upstream-packages/` and emits a separately repaired selected ZIP. The repair adds only missing duplicate snippet files and validates all literal relative JS imports; conflicting snippets or unresolved imports fail closed. It does not modify WASM. Final current Photo scope is `0.22.0-flow2`; see `STAGING.md` for exact archive/receipt evidence.
