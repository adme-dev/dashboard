# FigFlow Stage A native source-build prerequisite

Implemented in `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`, branch `adme-dev/figflow-edm-release-20261101`. Current release HEAD after parent fast-forward: `2cfbdab98b9a2d0508351afa07fda6f781d64795`; no owned-path overlap was introduced. Parent-owned dashboard work remains intact. No old branch was merged or cherry-picked.

## Exact owned paths

- `.github/workflows/figflow-native-build.yml`
- `workers/craft-editors/source-pins.json`
- `workers/craft-editors/ci-setup.py`
- `workers/craft-editors/ci-build-browser.sh`
- `workers/craft-editors/build-browser.sh`
- `workers/craft-editors/patches/figflow-branding.patch`
- `workers/craft-editors/patches/figflow-browser-save.patch`
- `workers/craft-editors/patches/figflow-xf-mark.patch`
- `workers/craft-editors/patches/figflow-browser-export-bound.patch`
- `workers/craft-editors/patches/figflow-browser-bridge.patch`

The four established patches and three scripts came from clean `90f8fab1`; the bridge originated from the current tracked R&D fixture. The four established patches remain byte-identical to that clean source.

## Implementation

- Scoped pins, font setup, engine validation, and workflow paths to **figcraft only**. Missing unrelated editor patches cannot participate in this build.
- Preserved upstream `d4a303d4708602a9df1738960852d18b185a616b`, source archive and Cargo.lock hashes, locked patch application, and before/after lockfile checks.
- Added the browser bridge as the fourth `additional_patches` entry. Current checksum after review correction: `740926943894d81caa62ee4be951c4bec92e8f6eef3b1e7864aa3480c51c80ff`.
- Added `browser_bridge` to the locked `figcraft-ui-egui` native test filter loop, retaining existing save/mark/export/zip tests.
- Added a three-job Ubuntu 24.04 workflow: static validation → native tests → browser package. Branch pushes and PRs targeting main can run it before main integration; manual dispatch is also declared. It has `contents: read`, pinned checkout/upload actions, no credentials persistence, no deployment secrets, and no deployment actions.
- Added workflow-resident static checks for exact source/pin scope, all five patch paths/hashes, Linux and engine guards, locked tests, the bridge filter, unsupported export status, review regressions, and CI safety boundaries.
- Kept the bridge limited to status/inspect/get_node/create_node/update_node. `exports: false` remains asserted. Snapshot, export, and EDM actions were not added or implied.

## Parent-review corrections processed

Both Orca mailbox findings were processed and the delivery batch acknowledged; the follow-up queue returned zero messages.

1. The independent `engine.execute` rejection now uses `refused-engine-0001` instead of reusing `refused-0002`, so it cannot hit the invalid-mutation receipt retained by the preceding loop. This is a source-identified test correction, not a claim that the Rust test has executed.
2. After Cargo succeeds, CI parses `test-browser_bridge.log` and requires exactly seven distinct expected `browser_bridge_* ... ok` names. Zero matches, missing/renamed tests, duplicates, extra matches, or failed test lines fail closed. Static workflow checks require this output guard and the independent request ID.

## Offline checks completed

Passed locally without downloads or Rust targets:

- `bash -n` for both shell scripts.
- Python AST parsing of `ci-setup.py`.
- Ruby YAML parsing of the workflow.
- Exact execution of the workflow's embedded validation logic.
- JSON scope/pin and all five patch SHA-256 checks, including exact equality with the new bridge pin.
- Byte comparison of the four unchanged patches against their tracked sources.
- Direct execution of the bridge-output guard with synthetic logs: exact seven accepted; zero, six, renamed, duplicate, and failed-test cases rejected.
- Request-ID uniqueness check and `git diff --check` on owned paths.
- Final status/path and script-mode inspection. Scripts retain source modes and are invoked through `bash`/`python3` as required.

An earlier workflow guard failed because forbidden-token assertions matched their own source. Those tokens are constructed dynamically; the safety checks remain in force.

No large Rust build, dependency installation, database access, commit, push, deployment, hosting change, or feature enablement occurred.

## Remaining native acceptance / parent CI

1. Run the remote workflow on the current branch or PR. Confirm exact upstream archive/font/tool receipts, patch application, unchanged Cargo.lock, and all native tests—including the seven embedded `browser_bridge` tests and the new nonzero/exact-name output guard—pass on Linux x86_64.
2. Inspect the browser-package receipt and archive hashes. A CI artifact is source-build evidence only, not hosted acceptance or a release-ready bridge.
3. In GPU-capable Chrome, verify actual emitted `__xfFigBridge` bindings against the candidate WASM: inspect an existing shape, create/update explicit nodes, check same-request replay, request-ID conflicts, wrong-instance/document and stale-revision rejection, bounded queue/output, and UI-edit conflicts without creating a second headless document.
4. Recheck existing native save/reopen/visible PNG export and branding regressions on that candidate. These remain UI capabilities; the bridge still explicitly exports nothing.
5. Snapshot/open/export/EDM actions, durable native-artifact delivery/receipts, authenticated scoped relay sessions, user/client isolation, revocation, and live hosted acceptance remain future work. Stage B packaging/hosting was not implemented.

This is only a source-build prerequisite. It is not a complete FigFlow EDM feature and does not justify enabling the feature flag or promoting a hosted route.
