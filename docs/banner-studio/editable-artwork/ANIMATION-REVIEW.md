# Animation and alpha/mask independent review

27 October 2026. **Accepted within the local animation and geometric-mask scope.** Settled source, 101 independent focused tests and both actual Nuxt browser proofs pass. No production/provider acceptance is implied.

## Scope and provenance

Review of the approved **Animate** and **Add Tween** entry points using the existing Banner Studio engine: stale-target rejection, locks/managed QR, selected inspector/tween focus, useful defaults, timing bounds, atomic undo, native text preservation, save/reopen and animated HTML. Coordinator additionally relayed the user requirement for transparent PNG alpha and native masks, including normal/inverted rectangle and ellipse clipping.

- Workspace: `/Users/paulgiurin/orca/workspaces/dashboard/banner-editable-artwork`.
- Branch: `adme-dev/banner-editable-artwork`; source remote: `https://github.com/adme-dev/dashboard.git`.
- HEAD: `d4560047ae045e14d337ccf062055dce83692fcb`.
- Current fetched main: `4a68e92367fbcffd08a3f6a6a6e4537c71195937`; independently verified ancestor of HEAD.
- Reviewer owns this document and `output/editable-artwork-animation/reviewer/` only. No application/test edits, Git mutation, deployment, provider calls or subagents.
- Read governing README, HANDOFF and PRD plus ANIMATION-WORKFLOW; inspected ARTCRAFT-RND for execution-claim boundaries.
- Entry snapshots of animation-relevant runtime remain in `reviewer/baseline/`, separating this increment from earlier accepted dirty work.
- Exact SHA-256 values for 30 runtime/test/proof files are in `reviewer/source-manifest.json`; `reviewer/` paths are relative to `output/editable-artwork-animation/` throughout this review.

## Findings and correction evidence

| Finding | Reproduction and correction |
|---|---|
| Retained X/Y keyframes exported invisibly without opacity keyframes | Independent Chromium reproduction showed editor X=50/opacity=1 versus export X=50/opacity=0 at 2.5s. Both exporters now initialize missing property tracks; editor/export initial opacity also survives reverse seeks. Independent corrected run passes 15 visible samples across editor timeline and both exports. `reviewer/keyframe-opacity-repro.json`, `reviewer/keyframe-opacity-corrected.json`. |
| New menu eligibility disabled established animation controls | Real-store background/audio/mask `updateLayer(..., { startTime: 1 })` silently retained 0. Permission for existing animation/path controls is now separate from narrower new menu eligibility. Background/audio presence, masks/targets, remote lock arrival and legacy mask path controls have behavioral/component regressions. `reviewer/existing-animation-regression.json`. |
| Actual image component applied opacity twice | Compiled actual Vue Image component plus real timeline: PNG alpha128 with layer opacity0.5 rendered `[255,223,223,255]` on white versus exported `[255,191,191,255]`. Artboard now owns opacity once, six visual components receive `opacityManaged`, standalone behavior remains intact, and Stop restores base opacity. `reviewer/alpha-component-repro.json`; actual Artboard regression covers all six visual types. |
| Vue rerenders overwrote GSAP motion | Browser lifecycle found no transform at nonzero times. Reviewer identified competing Vue inline styles and confirmed that a cached object still gets replayed by installed Vue. Resting transform/opacity/clip now use CSS variables; GSAP owns their inline animation values. Actual Artboard tests assert nonempty motion after reactive selection/presence updates; simple equality of two empty transforms is insufficient. |
| Chained tween continuity and mask rendering defects | Coordinator reproduced a backward jump at the second tween and fixed complete-path semantics with `fromCurrent: false`. Mask fills are excluded from editor artwork, resting clip is restored on reset, and exact even-odd elliptical inversion is implemented in client/server utilities and both exporters with escaped style attributes. Coordinator real-browser tests cover continuity and numeric mask/alpha outcomes. |
| Right-button release activated a newly opened menu item | Final protected-row proof exposed accidental Duplicate when a menu opened beneath the releasing pointer. Both canvas/timeline entry points now suppress that one secondary pointer release; primary clicks and keyboard activation remain available. Regression tests cover the release guard and the final proof retains protected document equality. |
| Text undo restored store data but left stale rendered glyphs | Direct contenteditable mutation invalidated Vue child nodes. A keyed edit revision remounts after blur/Escape, preserving the active caret during editing and restoring rendered original words on undo. Actual Text component tests cover edit, undo/redo and Escape. |

The initial drag regression run also exposed a missing composable import in the Artboard test harness. Explicit source import restored the existing checks; no assertion was waived. Add Tween creates path plus first tween in one update, validates finite presence and both split halves, avoids a stationary append, preserves original keyframes and wording, and selects the new tween. Animate is navigation only and does not toggle an existing path off. Captured project epoch, format and live layer reference are rechecked at invocation.

Map/legal pilot layers are not inherently locked. Their preservation is established by exact nonselected-record comparisons, not by claiming semantic locking. Managed QR remains ineligible for animation and protected by the existing store/server invariants.

## Independent verification

Final focused command:

```sh
pnpm exec vitest run test/banner/animationActions.test.ts test/banner/contextMenuRelease.test.ts test/components/bannerAnimationMenu.test.ts test/components/bannerAnimationCanvas.test.ts test/banner/managedQrProtection.test.ts test/banner/platformQrAiProtection.test.ts test/banner/artworkUndo.test.ts test/banner/serverHtmlBuilderParity.test.ts test/banner/scopedExport.test.ts test/banner/dragControls.test.ts test/banner/timelineMasks.test.ts test/banner/maskCoordinates.test.ts test/banner/textExportParity.test.ts
```

**101 tests passed across 13 files.** Log: `reviewer/acceptance-tests.log`. Earlier baseline was 43/43; intermediate 61-pass/10-fail harness evidence and later 80-pass checkpoint are retained. Scoped `git diff --check` passes.

Independent Chromium corrected-opacity check: **15 samples passed**, including forward/reverse seeks across real `useBannerTimeline` and separately executed client and server HTML. Installed GSAP was bundled locally and network requests were aborted. This engine check does not substitute for actual Nuxt component acceptance.

Coordinator reports **11 real Chromium cases passed**: six timeline/export cases and five numeric alpha/mask scenarios. Reviewed test source uses real browser decoding, 0/64/128/255 source alpha at layer opacity0.5, normal/inverted rectangle/ellipse clips and positive expected pixel values. Its `editor-clip` branch is mask-utility markup, not the full Nuxt editor; the separate lifecycle proof is mandatory.

## Actual Nuxt proof review

Reviewed both executable scripts: `scripts/banner-studio/prove-layer-animation.mjs` and `scripts/banner-studio/prove-layer-animation-alpha.mjs`.

- The lifestyle proof requires the actual curated 124-layer leafy letter back and matching clean-plate bytes, then adds the established managed-QR fixture. No coastal fallback or synthetic replacement flyer is allowed.
- Both use loopback Nuxt, intercepted synthetic auth/APIs, file-backed revision-aware persistence and bundled installed GSAP for exports. External requests are blocked; WebSockets are denied except local Nuxt HMR. Generative AI and scan requests are forbidden; the ambient anomaly badge is explicitly mocked.
- Lifestyle proof uses visible canvas/timeline menus, native text editing, one-step undo/redo, direct time samples/playback, save/reload, original text and every unselected layer comparison, and execution of both real HTML builders.
- Alpha proof uses independently generated known-alpha PNG pixels, an opaque colored mask to catch leaked fill, visible mask controls, fractional layer opacity, normal/inverted rectangle/ellipse, undo/redo, reload and both executed exporters. It proves local image rendering, not live AI extraction quality.
- Reviewer required positive opacity and movement checks in addition to transform equality, export console capture, source hashes and unchanged-source checks. These were added.

Final evidence independently reconciled against the settled source:

| Actual Nuxt proof | Final result |
|---|---|
| Leafy native letter | `output/editable-artwork-animation/evidence.json`: passed at `2026-10-27T00:38:33.641Z`; 7 assertion groups, 17 local saves, 8 editor samples and 16 executed client/server export samples. All 22 recorded source hashes match current files. |
| PNG alpha and native masks | `output/editable-artwork-animation/alpha-mask/evidence.json`: passed at `2026-10-27T00:39:06.997Z`; 6 assertion groups, 14 local saves, 9 editor pixel states and 10 executed client/server export states. All 16 recorded source hashes match current files. |

Both ran actual Nuxt at `http://127.0.0.1:3137`. Both have empty page/console/fixture-error and unexpected-request arrays, zero attempted external requests and zero QR scan requests; collaboration sockets were intercepted. Source APIs/auth/persistence are local fixtures, not live server integration. Receipt with evidence hashes: `reviewer/final-evidence-reconciliation.json`.

Independently verified all 124 protected before/after hashes and all 31 original text blocks. Motion is positive and matches both exports: at 2.5s X/Y = 60/40 and opacity = 1; at 4.5s X/Y = 118.182/78.7881 and opacity = 1. The unchanged managed QR fixture retains its existing 3s presence end; preservation does not imply continuous QR visibility. The retained existing headline exit fades to zero at 5s, and reverse seek to zero restores opacity = 1. Alpha128 at layer opacity0.5 composites to RGB 84/154/188 over RGB 32/192/224; opaque source pixels composite to 136/116/152. Rectangular/elliptical inversion, reload and hidden mask fill meet those numeric expectations.

Visually inspected final `06-reloaded.png`, `export-2.5.png`, and `alpha-mask/09-ellipse-inverted-reloaded.png`: correct leafy pilot, clean original native heading, preserved map/legal/voucher/QR, selected animation inspector, and inverted elliptical cutout without green mask fill. Browser stale-menu races and remote locks are not exercised; focused store/component tests cover those cases.

An intermediate export driver returned a paused GSAP thenable from browser evaluation and hung; its callback now returns undefined, with no application-source change. The final rerun passed every assertion; earlier failed/interrupted attempts remain separately labelled and are not acceptance evidence.

## Limits and disposition

No remaining blocking finding in this increment. **Both actual Nuxt proofs pass on matching source, so the bounded local acceptance gate is satisfied.**

Bounded scope is one geometric rectangle/ellipse mask, including inversion, with supported centered translation/scale. Rotated/skewed masks, custom transform origins, multiple masks on one target, brush-painted masks and feather/density are not accepted here. Existing multiple-mask resolution differs between static editor/export paths and requires separate work. General malformed/manual timing combinations beyond the validated Add Tween operation are not comprehensively repaired.

ARTCRAFT-RND explicitly labels pinned public-source inspection: no executable, account, inference, PSD round trip or integrated editor was tested. The suggested interoperability spike remains proposed. This review checked that claim boundary, not an independent ArtCraft source audit.

No hosted auth/database/provider transport, CDN delivery, live model segmentation quality, production deployment, QR scan analytics, GIF/video, automatic flattened reconstruction, four-side reconstruction or commercial print acceptance is established. Dirty source, parent checkout and prior evidence remain preserved.
