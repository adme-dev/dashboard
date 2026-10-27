# Manual companion wording review

27 October 2026. Local implementation verified with real Nuxt UI and native Linux execution. This is a browser review boundary plus an operator-run Linux adapter, not a hosted job service.

## User workflow

1. Open an existing Banner project, select a supported native text heading and open **Companion wording** in Properties.
2. Download a request. Keep the review open and the artwork/selection unchanged. Save the downloaded file inside this worktree's `output/` directory.
3. The local operator runs the fixed adapter with a fresh output directory (its parent must exist):

```sh
node --import tsx scripts/banner-studio/companion-wording.ts \
  --request output/heading.request.json \
  --text 'COME CELEBRATE WITH US' \
  --out output/heading-companion-result
```

4. Import `output/heading-companion-result/proposal.json` into the same review. Check the exact before/after wording and fit, mark the review checkbox and apply. Save the project normally. One undo restores the original heading and metadata.

The adapter needs the already verified local Docker/Linux runtime and `output/editable-artwork-linux-native/fonts-v1/runtime.json`. Missing runtime/image/font access is a real failure; there is no simulated success. It uses fixed native text constructor/edit/reopen operations. It does not invoke AI; wording is supplied by the operator. Existing AI copy and lettering tools remain the paths for model-generated proposals.

## What is accepted

The first subset is static, single-line, plain Source Sans 3 Bold 700, with bounded size and glyph coverage. Unsupported effects, transforms, masks, multiline text, font substitutions and protected/factual copy are rejected. The original Arial retail heading is not silently converted. Only the chosen heading is exported natively; complete original project data remains in the bound sidecar. Whole-board dependency checks run before narrowing candidates.

The browser retains request authority in memory. A downloaded or returned file cannot establish a new session, replace the canvas or supply trusted styles/metrics. Import accepts a strict, size-bounded wording-only object. Current source hash, selection, saved revision and transient changes are checked across async reads and measurement. Closing, changing selection/document or starting another request invalidates the old proposal, including changes subsequently undone. Apply remeasures and uses the existing one-undo store operation. Managed QR invariants are checked before mutation.

`companionEdit` is optional descriptive metadata in existing canvas storage. Its `engineVerified:false` is intentional: an imported JSON declaration is not authenticated engine execution or authorization. Local native receipts stay under the operator's output directory; they are not treated as browser authority.

## Font compatibility

The platform serves the exact Adobe Source Sans 3.052 static Bold bytes under a content-addressed URL, with its OFL license. Browser loading verifies length and SHA-256 before installing the face. Review measures fresh browser ink, advance and line-box bounds; it never trusts native cached metrics. Existing catalog, layer renderer and client/server HTML exporters use this pinned face.

Source Sans 3 normal 700 is now reserved for this platform font. Previously uploaded or remotely sourced faces with that same family and weight are not used for Bold; this may change rendering of legacy projects using another Source Sans 3 version. Other families and non-700 weights retain existing handling. This is not original-font recovery or a universal fidelity claim. See [font details](COMPANION-FONTS.md).

## Evidence and remaining gates

The integration script is `scripts/banner-studio/prove-companion-review.mjs`. It runs actual Nuxt UI with fixture auth and file-backed save, exchanges a real request through the actual Linux adapter, and checks platform-served font bytes and Chrome rendered-font identity. It must pass review/apply, exact unselected-artwork/QR preservation, one undo/redo, fixture save/reopen, repeated export with descriptive provenance and stale-session rejection.

Final passing execution: `output/editable-artwork-companion/ui-2026-10-27T04-32-30-268Z/`. Its evidence records nine successful assertions, six fixture saves, two actual native edit/reopen cycles, exact platform font responses and custom `SourceSans3-Bold` rendering of 22 glyphs in both review and actual canvas. All 21 bound implementation/runtime hashes stayed exact across execution. No page, window or fixture errors occurred. One unrelated Google Fonts stylesheet request was blocked; the selected pinned face was served by Nuxt normally. The original 124 layers retain every supplied field on load; canonical unselected data and managed QR remain exact through apply, undo/redo and reload.

Earlier retained attempts are failures, not acceptance: the first encountered a Vue render error while product files were still changing; a clean reload resolved it. The next used an incorrect nested UFileUpload selector; the following queried the outer canvas wrapper rather than its text node for font data. Those harness checks were corrected. Screenshot review also found poor contrast for navy lettering in dark mode; the component now chooses a neutral contrasting preview surface without changing the source text color. Component tests cover dark and light lettering. The added heading overlaps the address in this fixture: it proves the exchange contract, not finished artwork composition.

A final diagnostic follow-up reproduced two ResizeObserver errors that Vite handled before Playwright’s `pageerror` event. The proof now captures real window ErrorEvents as well. Preview sizing observes the stable panel width and defers/coalesces updates with `requestAnimationFrame`, cancelling on disposal. The final complete native/browser rerun passes with `windowErrors:[]`, `pageErrors:[]` and `fixtureErrors:[]`. The earlier functional-only pass is superseded by the diagnostic-clean artifact above.

Coordinator regression passes **273 unique tests across 19 files, with one optional existing test skipped**. Commands cover companion contract/store/CLI/UI, native/document/archive guards, font loading/bytes/catalog/export parity, undo, copy protection and managed QR. Scoped lint on the new/changed companion/font/native modules and tests passes, as does `git diff --check`. The three component tests pass again after the contrast/sizing changes; all 19 suites were then rerun together. The machine-readable receipt is `output/editable-artwork-companion/final-tests.json`. No full build or clean global typecheck is claimed; inherited Nuxt/typing and unrelated builder lint limitations remain recorded in the previous/font reports. See [independent review](COMPANION-REVIEW.md), [UI contract](COMPANION-UI.md), [implementation plan](COMPANION-REVIEW-PLAN.md) and [previous native proof](LINUX-NATIVE-ROUNDTRIP.md).

Hosted authority, queue execution, owned object storage and live API persistence remain separate work. Arbitrary native document exchange, original font recovery, live AI background quality, full four-side creative acceptance and print production are not established by this slice. OpenUI remains documented in its [separate rollout](../../ai-chat/openui-rollout.md).

Final independent verdict: accepted for this bounded local slice, with no unresolved P1/P2 finding. Font, UI/contract and review tasks all succeeded; all three worker terminals were released with archived transcripts. The owned Nuxt server and browser are stopped, port3137 is closed and the labelled Linux proof-container query is empty. No release action occurred.
