# Right-click animation and tweening

27 October 2026. Paul approved connecting Animate and Add Tween to the existing editor, then proving the complete lifecycle on the native leafy lifestyle artwork. This is layer animation, not AI-generated video or automatic flyer reconstruction.

## Source and ownership

Fresh origin/main `4a68e92367fbcffd08a3f6a6a6e4537c71195937` is included in HEAD `d4560047ae045e14d337ccf062055dce83692fcb`, ahead one/behind zero. Correct remote is adme-dev/dashboard. Dirty implementation and parent remain untouched by Git operations; no rebase needed.

Orca Run `run_666e5ba6039d`:

- UI/actions: `task_7f6dd69a8088` / `ctx_ce6f19f873d8`.
- Actual browser/export proof: `task_6f2deeaa6e4f` / `ctx_ef037482c8f4`.
- Independent review: `task_8e7c4495dba3` / `ctx_9642f8947d2c`.
- Coordinator: render/export integration, runtime, regression, documentation and card.

Workers inherit configured Codex defaults; launch receipts do not identify an explicit model/effort. No provider-model selection changes are needed for deterministic layer animation.

## Interaction contract

Canvas and timeline layer menus expose **Animate** and **Add Tween**. Animate selects the exact layer and opens its existing Animation inspector without changing the document. Add Tween creates a useful path and tween together, or adds a segment to an existing path, as one undoable change. It opens the same inspector and selects the resulting tween.

Reuse current native text, path points, easing, timing and timeline playback. Preserve existing wording, fonts, appearance and animation data. Motion paths drive position when enabled; retained x/y keyframes must not be silently discarded. Managed QR, locked or remotely locked layers, backgrounds, audio, masks and mask targets are excluded from these new actions. Recheck captured project/format/layer identity at invocation to reject stale menu targets.

UI design follows the existing dense editor: compact left-aligned actions, current typography and semantic Nuxt UI colors, no new panel or animation engine. Any edited fields use labelled UFormField controls and fit the narrow inspector. Motion is user-triggered. Keyboard and inspector alternatives accompany right-click actions.

## Acceptance sequence

1. Load a new local fixture project from the actual 124-layer lifestyle letter back and verified clean plate. Retain managed QR and protected copy/map/legal content.
2. Right-click a heading on the canvas and in the timeline; open Animate and add a tween using visible controls. Confirm the selected layer remains native editable text.
3. Configure motion and inspect actual transforms at several times, including reverse seeks. Playback must visibly move only the intended layer.
4. Undo/redo each addition as one change, save/reopen and compare saved animation and all unselected layers.
5. Build and execute animated HTML through the existing exporter. Compare exported transforms with editor samples and retain a standalone local preview, screenshots and evidence.
6. Exercise stale targets, lock/QR guards, existing paths and degenerate timing with focused behavioral tests; run the relevant Banner Studio regression and independent review.

Paul additionally requested a second check of PNG transparency, alpha channels and masks. A separate deterministic RGBA draft must verify transparent and intermediate-alpha pixels at layer opacity 0.5, normal/inverted rectangular and elliptical masks, playback, undo, both HTML exporters and save/reopen. This is local rendering acceptance; it is not evidence of live model segmentation quality.

## Failures found and corrections

- Installed GSAP prepended the current position to each complete motion path, causing chained segments to jump backwards. Explicit `fromCurrent: false` keeps stored paths authoritative in editor and both exporters.
- Exported entrance transforms and default properties did not match editor state on reverse seeks. Initial/default opacity and explicit entrance endpoints now agree, including position-only keyframes and no-entrance layers at time zero.
- Actual Vue Artboard rerenders overwrote GSAP transforms during scrubbing. Resting model values now live in CSS variables while GSAP owns the corresponding animated inline properties.
- Six visual layer components applied base opacity again inside the animated wrapper. Artboard now owns the single opacity application; optional `opacityManaged` preserves standalone component behavior. Stopping playback restores base opacity and the resting mask.
- Opening a bottom-edge context menu could activate an item on the opening secondary-button release. Both menu entry points now guard that release; later normal selections remain available.
- Editing a contenteditable heading could detach Vue glyph nodes, so undo restored saved copy but left stale lettering visible. The text component now refreshes its editable subtree when editing ends, preserving the active caret while typing. Actual rendered wording is part of browser acceptance.
- Mask layers rendered their own fill as artwork in the editor. They now remain editable geometry/outline without adding their fill to the composition.
- Ellipse mask inversion was ignored. Exact even-odd elliptical cutouts now work in editor utilities, static export and animated export; generated style attributes escape the path quotes.

Failure logs and pixel receipts remain under `output/editable-artwork-animation/`. The final coordinator Chromium run passes 11 cases: six real timeline/export comparisons and five numeric alpha/mask scenarios, including 0/64/128/255 source alpha at 0.5 layer opacity. Each exported page uses a fresh JavaScript realm and installed GSAP with network requests blocked. The separate actual Nuxt lifecycle proof is required because an engine test on exported markup cannot detect Vue/component rendering conflicts.

## Scope limits

This increment proves a single rectangular/elliptical geometric mask, including inversion and centered translation/scale calculations. It does not establish brush-painted raster masks, feather/density controls, rotated/skewed masks, noncentral transform origins or multiple masks targeting one layer. Existing multiple-mask resolution differs between editor and export and needs its own correction before advertising that combination. [ArtCraft research](ARTCRAFT-RND.md) records a possible future source/interoperability reference for richer masks and PSD/native text, without claiming an installed integration.

Both actual Nuxt workflows now pass on matching source. Evidence is in `output/editable-artwork-animation/`; earlier pilot/QR/retail/recovery artifacts are preserved. Browser auth, persistence and asset transport are explicit local fixtures, not hosted acceptance. Local bundled GSAP may replace CDN loading in the standalone proof and must be labelled. GIF/video export, live providers, automatic background repair, full four-side reconstruction and print acceptance are not established by animated HTML proof.

No merge, deployment, client publication, subscription purchase or existing-database mutation.


## Final local verification

- Coordinator regression: **1,074 passed / 61 skipped**, 110 passing and eight gated/skipped files. Exact file list and logs are in `regression-files.json` and `coordinator-regression-final.log`; skips do not count as proof.
- Explicit Chromium suite: **11 passed**, six real timeline/export and five numeric alpha/mask scenarios (`combined-pixel-final.log`).
- Independent review: **101 focused tests passed**; overlapping counts are not added to the coordinator suite. See [review](ANIMATION-REVIEW.md) for final disposition.
- Actual lifestyle Nuxt flow: **seven assertion groups**, 17 file-backed saves, eight editor timestamps and 16 client/server export samples. All 124 unselected layers and 31 original text blocks remain exact; rendered text is checked after undo. Source hashes for all 22 recorded files match.
- Actual alpha/mask Nuxt flow: **six assertion groups**, 14 file-backed saves, nine editor states and ten client/server export states. Known alpha 0/128/255 survives opacity 0.5, normal/inverted rectangle and ellipse, undo and reload. All 16 recorded source hashes match.
- Both actual browser receipts report zero page, console or fixture errors and no live provider/QR scan calls. Coordinator inspected the editor, animated export and reloaded inverse-mask screenshots.
- Scoped lint and `git diff --check` pass. Older touched files still have inherited lint diagnostics; a clean global build/typecheck is not claimed.

Local review entry points: [flyer animation](../../../output/editable-artwork-animation/review.html) and [PNG alpha/masks](../../../output/editable-artwork-animation/alpha-mask/review.html). Each links screenshots, saved data and detailed evidence. Runtime/provider fixtures and locally bundled GSAP are explicitly labelled.

Earlier failed attempts are retained: startup OOM, actual no-motion rendering, double opacity, DOM/menu defects, server exit during reload and an interrupted proof-driver wait on a GSAP thenable. The subsequent passing receipts establish the bounded local outcome; infrastructure failures are not provider-quality evidence.


## Settlement

All three animation-wave tasks succeeded: UI/actions `ctx_ce6f19f873d8`, browser proof `ctx_ef037482c8f4` and independent review `ctx_9642f8947d2c`. Each worker was released after accepted evidence with its transcript archived. The independent reviewer accepts the bounded local increment with no remaining blocking finding. Both proof browsers exited; the coordinator stopped only the owned Nuxt process after proof completion. Earlier work, the dirty parent and all uncommitted changes remain preserved.

Coordinator receipt: `output/editable-artwork-animation/coordinator-evidence.json`. The complete PRD and hosted/provider release gates remain open.
