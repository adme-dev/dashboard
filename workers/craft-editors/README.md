# FigFlow native build prerequisite

This directory builds the pinned FigFlow source and its browser-local bridge.
It does not deploy an editor or enable the EDM feature.

The bridge supports status, inspection, explicit node creation/updates, and a
bounded composer EDM import/content-snapshot round trip. Canonical identity and
locked fields are retained while unsupported native structural edits fail closed.
Image bytes are resolved only by the packaged relay into a browser-only envelope;
they never enter canonical JSON or become durable native asset uploads.

The `0.11.2-edm1` package injects the separately pinned `figflow-edm-relay.mjs`.
Native file snapshot/export, authenticated server relay sessions, durable native
artifacts, arbitrary layout conversion, and template/module publication remain
unimplemented. Existing manual download/export controls are separate capabilities.

`source-pins.json` fixes the upstream source, Cargo.lock, patch order and hashes.
The four established patches come from dashboard commit
`90f8fab183722b00d4e2483403e33cc7148a7908`. The bridge originates from
`docs/plans/fixtures/figflow-browser-bridge.patch`, with a test request-ID collision
corrected in this copy and its checksum updated.

The `FigFlow native source build` GitHub workflow validates those inputs, runs
native tests, then builds the browser package on Ubuntu x86_64. It requires the
seven named bridge tests to pass; a zero-test Cargo result is rejected. Jobs
upload source/build receipts and logs, and have no deployment steps or secrets.

The CI entry points require an isolated Linux runner and `RUNNER_TEMP`:

```sh
bash workers/craft-editors/ci-build-browser.sh figcraft test
bash workers/craft-editors/ci-build-browser.sh figcraft web
```

Successful CI is not hosted browser acceptance. Before any later promotion,
verify the actual WASM bridge and the manual save/reopen/export workflow, choose
a new immutable hosted version, and preserve the previous version for rollback.
