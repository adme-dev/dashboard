# FigFlow browser export bound follow-up

Source settled: 2026-10-28. No build, compilation or runtime tests performed; shared build queue preserved.

Patch: `/private/tmp/figflow-browser-export-bound.patch`
SHA256: `5dc626e63fb1ace0ad96b0a840b2b070e8d72f4b72d3df2fd3785815cfebf09e`
Base: pinned FigCraft0.11.2 source + original Flow branding + browser-save patch + XF mark patch.

Changed only:
- `crates/engine/src/cmd/file.rs`
- `crates/ui-egui/src/export_panel.rs`
- `crates/engine/src/export_behaviour_tests.rs`

## Defect and correction

The earlier UI archive cap was checked only after `file.exportLayers` had rendered and retained Base64 for every export job (up to1000). A large export could exhaust memory before reaching the cap.

The existing command now accepts an optional `maxBytes` positive integer in1..536870912 for in-memory output. It validates before rendering; with `dir` it rejects before writes. After each file renders, its payload size is checked against remaining aggregate allowance before Base64 encoding/retention. A refusal stops before later jobs. The browser archive caller supplies512MiB. Existing callers omitting the optional parameter preserve their prior behavior, including desktop directory exports.

This is a payload-retention bound, not a512MiB peak-memory guarantee. A single file's renderer still allocates its transient result before its size can be checked. Existing outputs' Base64, decoded bytes, final ZIP, and browser Blob add overhead. Comments explicitly state this limitation.

## Regression coverage added (not run)

`cargo test --locked -p figcraft-engine --lib browser_export_bound`

Two tests cover:
- exact aggregate boundary succeeds and produces byte-identical outputs;
- one byte under aggregate size refuses even when each individual file fits;
- retry after refusal succeeds unchanged;
- zero, negative, fractional, string, null and above-cap limits reject;
- bounded directory request refuses before creating any files;
- existing directory export without the new parameter still writes.

Also run the previously requested browser-save and existing export suites. Actual browser download verification remains necessary.

`git apply --check` passed against a saved settled baseline. Real patch application reproduced all3 modified source files exactly. Patch re-read. Rustfmt was unavailable in the isolated Rust1.95 toolchain; no installation attempted. Cargo.lock and all other source files unchanged by this follow-up.

Read-only review found no additional actionable new save-staleness, desktop-path or archive-traversal defect. Native FileSnapshot save matching remains the same UID/path/saved-document identity check; archive names come from the existing sanitised/deduplicated export jobs.
