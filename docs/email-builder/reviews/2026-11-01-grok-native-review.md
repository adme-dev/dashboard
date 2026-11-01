# FigFlow native source-build review

Read-only review of the ten owned paths in `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`. No source edits, installs, native builds, commits, or deploys. Native `cargo test` and the browser package were not run. Remote CI is still the execution proof.

## Verdict

No blocker in these ten paths. The four established patches are byte-identical to clean `90f8fab183722b00d4e2483403e33cc7148a7908`. The bridge uses a distinct `refused-engine-0001` request id, and the CI log guard requires exactly the seven `browser_bridge_*` tests. The workflow is figcraft-scoped, `contents: read`, with pinned checkout and upload actions and no deploy secrets or deploy steps.

This is a source-build prerequisite. It does not enable the feature flag, host the bridge, or accept the WASM in a browser.

## Paths and pins

| Path | Role |
| --- | --- |
| `.github/workflows/figflow-native-build.yml` | validate, then native tests, then browser package |
| `workers/craft-editors/source-pins.json` | figcraft only |
| `workers/craft-editors/ci-setup.py` | download, verify, patch, fonts, tools |
| `workers/craft-editors/ci-build-browser.sh` | Linux x86_64 test or web package |
| `workers/craft-editors/build-browser.sh` | locked web package |
| `patches/figflow-branding.patch` | established |
| `patches/figflow-browser-save.patch` | established |
| `patches/figflow-xf-mark.patch` | established |
| `patches/figflow-browser-export-bound.patch` | established |
| `patches/figflow-browser-bridge.patch` | new, pin `740926943894d81caa62ee4be951c4bec92e8f6eef3b1e7864aa3480c51c80ff` |

`source-pins.json` keeps upstream `d4a303d4708602a9df1738960852d18b185a616b`, archive `04710e7815266580083267103d3fe93218c4dee02415e7016574ee866a09aaa6`, and Cargo.lock `539397203fa01e0f460ab2fad69b32003b838828751a7373e833d23b56e35b94`. Those three match the figcraft object at `90f8fab1`. The only pin addition is the bridge entry, and its sha256 matches the file on disk.

Local re-run of the workflow's embedded assertions passed: pin set is only `figcraft`, applied order is branding, save, xf-mark, export-bound, bridge, each hash matches, and `bash -n` passed for both shell scripts.

## Established patches against `90f8fab1`

`git show 90f8fab1:workers/craft-editors/patches/<file>` compared with `cmp` and SHA-256:

| Patch | SHA-256 | Against `90f8fab1` |
| --- | --- | --- |
| `figflow-branding.patch` | `f5198f5f6235c82047268910d343dd3d3fb8c1e74a62b1a106a49a63dafe60b9` | identical |
| `figflow-browser-save.patch` | `c48d5d59e2956da33ef593cf6179ce3c287c97a27da6082aa6e2eb3a741273eb` | identical |
| `figflow-xf-mark.patch` | `c2ee7ae4d4490b4361b0a8e776d8b8c3d7d21c0f57a2bf4af36115afdc50464c` | identical |
| `figflow-browser-export-bound.patch` | `5dc626e63fb1ace0ad96b0a840b2b070e8d72f4b72d3df2fd3785815cfebf09e` | identical |

Script deltas from that same commit are the figcraft scope cut plus the bridge test filter and output guard:

- `ci-setup.py`: drop the other engines' font pins; `engine != 'figcraft'` instead of the six-engine allow-list. Figcraft font commit `43913056ce82a3fdad0ef69f6b88d1dc922a8104` and hash `e2dd2bb3ae39e442ee67416b9bc29b7ca8ef906e8ff2caaf5a451aaa6c662057` are unchanged. Download caps, tar member checks, patch checksums, and the post-patch Cargo.lock check are unchanged.
- `build-browser.sh`: the engine case is `figcraft` only.
- `ci-build-browser.sh`: mode case is `figcraft:web|figcraft:test`; the lib filter loop adds `browser_bridge`; the exact-seven parser follows that loop.

Apply order is branding, save, xf-mark, export-bound, then bridge. The bridge hunks touch `apps/figcraft-web/Cargo.toml`, `apps/figcraft-web/src/main.rs`, `apps/figcraft-web/src/web.rs`, new `bridge_web.rs`, `crates/ui-egui/src/lib.rs`, and new `browser_bridge.rs`. Branding does not edit `ui-egui/src/lib.rs` or `figcraft-web/src/main.rs`. Its `web.rs` hunk is the line-54 startup string, which does not overlap the bridge hunk at lines 46–51, and it does not change line count, so the bridge context stays put. Save and xf-mark edit `lib.rs` at the test-module list and the save methods, not at the line-9 `pub mod` site the bridge patches. Save's `main.rs` hunk is the crate comment, not the `mod query` site.

The `web.rs` insertion is brace-balanced. It adds a closer for the existing `if let Some(link)`, opens `if let Err(error) = crate::bridge_web::install(...)`, and the original `}` closes that new `if`.

## Bridge correction

`figflow-browser-bridge.patch` actions are only `status`, `inspect`, `get_node`, `create_node`, and `update_node`. Status returns `"exports": false`. There is no snapshot, export, or EDM action.

The invalid-params loop builds `refused-{index:04}` for indexes 0, 1, and 2, so the third id is still `refused-0002` at runtime, and those calls are `create_node` mutations so their receipts are stored. The `engine.execute` case is a separate call, `create(&status, "refused-engine-0001")`, and the action is not a mutation. It returns `unsupported_action` before receipt insert. The workflow asserts that literal is present and that `create(&status, "refused-0002")` is absent. Both hold. That closes the previous same-id replay against the stored invalid-params receipt. It is a source check, not a Rust execution.

After `cargo test --locked -p figcraft-ui-egui --lib browser_bridge` exits 0, `ci-build-browser.sh` parses `test-browser_bridge.log` with `NO_COLOR=true` already set. It requires the matched `... ok` names to be exactly these seven, with no duplicates and no extras:

- `browser_bridge_create_replay_and_id_conflict`
- `browser_bridge_rejects_stale_and_wrong_document`
- `browser_bridge_rejects_arbitrary_commands_paths_and_nested_properties`
- `browser_bridge_update_targets_explicit_node`
- `browser_bridge_mutation_requires_revision_and_receipts_never_evict`
- `browser_bridge_large_integer_identifiers_are_lossless`
- `browser_bridge_status_and_inspect_strip_paths`

Those are the seven `#[test]` functions in the patch. A zero-test success, a rename, a failure line, or an extra `browser_bridge_*` success fails the job. The module is `#[cfg(any(target_arch = "wasm32", test))]`, so the host test build can compile it. `bridge_web.rs` is `#[cfg(target_arch = "wasm32")]` and is not part of those seven tests.

## CI scope and safety

`figflow-native-build.yml` runs on push to `adme-dev/figflow-edm-release-20261101`, on pull requests to `main`, and on `workflow_dispatch`. Path filters are the workflow, the four scripts/pins, and `workers/craft-editors/patches/figflow-*.patch`. Unrelated editor patches cannot enter this build: pins contain only figcraft, and both shell scripts reject any other engine.

Workflow permissions are `contents: read`. Each checkout sets `persist-credentials: false`. Actions are pinned to the same commits as `creative-tools-build.yml` at `90f8fab1`:

- `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4`

The workflow text has no `secrets.` reference, no wrangler, and no deploy step. The static check looks for those tokens by concatenation so the check does not trip on itself. Jobs are validate (5 minutes) then native tests (40) then browser package (40), on `ubuntu-24.04`. Uploads use `if: always()` and `if-no-files-found: warn`, which matches the established creative workflow and does not turn a failed test into a green job: `set -euo pipefail` plus the EXIT trap still returns the script status.

`ci-setup.py` still refuses archives over 512 MiB, expanded trees over 1 GiB, absolute members, `..`, and non-regular tar members. Patch paths must stay under the script directory and match the pin before `patch -p1 --batch --forward`. A Cargo.lock change after patching fails the setup. The same lock hash is checked again after tests and inside `build-browser.sh` before packaging. Tool hashes for trunk `0.21.14` and wasm-bindgen `0.2.129`, and the rustup `1.95.0` bootstrap check, are unchanged.

The bridge's `web-sys` feature add (`Crypto`, `Performance`) must not rewrite `Cargo.lock`. If it does, setup fails closed on the lock pin. That outcome is not proven until CI applies the patch to the pinned archive.

## Patch behavior worth knowing

Established save, mark, and export-bound behavior is unchanged because those four files are byte-identical. Save still downloads `.figcraft` and exports, marks the file saved only after `FileSnapshot::delivered`, and zips multi-file browser exports. Export-bound still passes `maxBytes` only for in-memory `file.exportLayers` and refuses `dir` plus `maxBytes`. The xf mark patch replaces the corner glyph and the two-tone wordmark with the drawn XF mark and the single "XeroFlow" wordmark.

Branding, beyond FigCraft to FigFlow renames, rewrites the About copy and links: product line "XeroFlow Creative Tools", link `https://xeroflow-creative-tools.adme-dev.workers.dev/`, and the Discord control relabeled "Upstream community" while the URL stays `https://discord.gg/artcraft`. Some locale values keep an English sentence, and the Dutch dual-license line still says "original FigCraft project". That text is inside the byte-identical branding patch from `90f8fab1`. It is not a CI or bridge defect.

The bridge stores mutation receipts only. `status`, `inspect`, and `get_node` are not recorded, so a request id used first for a read can later be used for a mutation. Mutation replay and `request_id_conflict` are what the new test covers. `get_node` turns a decimal string into a number through `id_of`; `create_node` and `update_node` forward the decimal string in the engine JSON. Whether `node.create` and `node.set` accept that string is an upstream assumption. CI will compile and run it. This review did not.

Page glue installs `window.__xfFigBridge` with `protocolVersion` `"1"` and a `request` function, drains at most two queued calls per frame, and caps the queue at 8, the wait at 2 seconds, and the body at `MAX_REQUEST_BYTES`. `install` refuses to start without `performance()`. That glue is not in the seven host tests.

## What CI still has to show

1. The remote workflow on this branch or PR: archive, font, and tool receipts, all five patches applying, Cargo.lock unchanged, the existing save, mark, export, and zip tests, and the seven bridge names in `test-browser_bridge.log`.
2. The browser-package receipt. An artifact is source-build evidence, not hosted acceptance.
3. A browser check of the emitted `__xfFigBridge` against the produced WASM, including replay, id conflict, wrong document, stale revision, and queue bounds.
4. Snapshot, export, and EDM bridge actions, scoped relay auth, and hosted rollout remain out of this slice.

No blocker in the ten paths. Do not treat this review as native-test success or as permission to enable the feature flag.
