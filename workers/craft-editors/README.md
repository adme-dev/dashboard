# FigFlow native build prerequisite

This directory builds the pinned FigFlow source and its browser-local bridge.
It does not deploy an editor or enable the EDM feature.

The bridge supports status, inspection, explicit node creation/updates, and a
bounded composer EDM content round trip plus a separate typed component-designer operation return. Canonical identity and
locked fields are retained while unsupported native structural edits fail closed.
Image bytes are resolved only by the packaged relay into a browser-only envelope;
they never enter canonical JSON or become durable native asset uploads.

The `0.11.2-edm3` package injects the separately pinned `figflow-edm-relay.mjs`. It adds font resolution to edm2: each email font key resolves to the first family the font database has (canonical renderer stack, then bundled OFL substitutes, then Inter — the browser build registers only Inter for Latin text), and Headings honour `fontWeight`. `0.11.2-edm1` and `0.11.2-edm2` remain separate immutable packages.
Native file snapshot/export, authenticated server relay sessions, durable native
artifacts, arbitrary layout conversion and native template/module publication remain
unsupported. Server-side library publication is a separate capability. Existing manual download/export controls are separate capabilities.

`source-pins.json` fixes the upstream source, Cargo.lock, patch order and hashes.
The four established patches come from dashboard commit
`90f8fab183722b00d4e2483403e33cc7148a7908`. The bridge originates from
`docs/plans/fixtures/figflow-browser-bridge.patch`, with a test request-ID collision
corrected in this copy and its checksum updated.

The `FigFlow native source build` GitHub workflow validates those inputs, runs
native tests, then builds the browser package on Ubuntu x86_64. It requires the
nine named bridge tests, 41 named engine EDM tests and eight named EDM UI tests to
pass; a zero-test Cargo result is rejected. Jobs
upload source/build receipts and logs, and have no deployment steps or secrets.

The CI entry points require an isolated Linux runner and `RUNNER_TEMP`:

```sh
bash workers/craft-editors/ci-build-browser.sh figcraft test
bash workers/craft-editors/ci-build-browser.sh figcraft web
```

Successful CI is not hosted browser acceptance. Before any later promotion,
verify the actual WASM bridge and the manual save/reopen/export workflow, choose
a new immutable hosted version, and preserve the previous version for rollback.

The prepared EDM2 native component panel implements explicit canonical style/property and
add/move/duplicate/remove operations, deterministic IDs, creation-only pinned
brand defaults, protected linked/legal content and empty-image placeholders.
No-op snapshots return no operations; arbitrary canvas edits cannot become
canonical source. The server independently replays and validates every operation
against the saved baseline and current authority before explicit Apply. Durable
native artifacts remain unavailable. The previous EDM1 hosted package is retained
separately for rollback; new-package CI does not establish hosted acceptance.
The current source includes internal operation-log Undo/Redo and guarded keyboard
routing. Native compilation, fixture execution and actual-WASM acceptance remain
required; source review is not evidence that those gates have passed.
