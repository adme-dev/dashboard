# Flat-image lettering repair UI

Implemented locally on 27 October 2026 in the preserved editable-artwork worktree. This is the UI and state boundary report; the coordinator owns full Nuxt browser proof and the backend worker owns provider execution and pixel-scope enforcement. No provider calls, commits or deployment were performed by this UI task.

## Interaction

Select a saved flat image, then use **Rebuild lettering** in the lettering inspector. The existing separated-lettering action is labelled **Edit isolated lettering with AI** for images and remains a separate workflow.

The original image appears with a source-relative rectangular outline. Left, top, width and height are accessible percentage fields, backed by normalized 0–1 coordinates. Transcribe the source wording, enter exact new wording and review the region before **Generate repaired background preview**. A repair does not treat a whole poster as a transparent lettering cutout.

The review shows the full repaired background in the inspector and that background with a new native text layer on the actual artboard. Arial, Georgia and Impact, font size and hex colour are adjustable before Apply. Default styling uses Arial, weight 700, dark text and a conservative size based on the region and line lengths. Native font measurement rejects text wider or taller than the region; final review still covers contrast, residual letters, repair quality and surrounding artwork. **Show original in canvas for comparison** resets review and disables Apply while active.

**Apply repaired lettering** replaces the selected image source and adds the exact requested wording as a separate native text layer immediately above that image. Existing unselected layer records and other artboards remain unchanged. Both changes use the existing `applyAssistantCanvas` transaction and undo/redo together. The new text becomes selected, ready for existing native font, effects and AI editing. Normal project save/reopen retains the background source, native text fields and the repair provenance described below.

## Persisted repair provenance follow-up

Both the repaired image and the new native heading carry optional `letteringRepair` metadata with `version: 1`, reusing the proposal contract. It retains the original source URL, source asset ID and SHA-256, project/revision/artboard/source-layer identity, normalized and inward-rounded pixel regions, exact source and replacement wording, output asset ID/URL/dimensions/SHA-256, provider/model/request ID evidence, proposal ID and background/text layer relation IDs. The evidence cost remains `null` and verification remains `review-required`; the record is historical provenance, not a provider-quality or approval attestation. Subsequent manual edits do not rewrite the recorded repair wording.

The record uses explicitly selected scalar fields and fixed-shape objects. URLs are limited to 8,192 characters, identifiers and provider/model names to 256, revision/artboard strings to 100, provider request IDs to 1,024, and each exact wording to the existing 2,000-character limit. Oversized values reject the proposal rather than silently truncating evidence. Warnings, opaque provider payloads and recursive repair history are not persisted; a later repair records its own immediate source. The metadata is not `letteringRecipe`, does not claim that the full poster is isolated lettering, and cannot trigger automatic regeneration. Rendering, native styling, wording, protected layers and apply semantics are unchanged.

## Boundaries

- Shared `letteringRepairEligibilityIssue` rejects locked, managed QR, logo/copy-protected, hidden, cropped, masked, transformed, composited, feed-bound or animated source images and protected-region overlaps. Static legacy layers with a dormant fade-out must explicitly have `outDur: 0`.
- The UI conservatively refuses source transcriptions containing detected protected facts, even when unchanged. It does not attempt OCR or certify that a manual transcription exhaustively describes the region.
- Generation requires a saved project revision and the reviewed region. The whole project, canvas, active artboard, selected layer and dirty state are captured. Input changes, revision/project replacement, selection changes, local edits, cancellation and editor teardown invalidate pending work. Abort signals cancel browser requests; token/snapshot checks also reject late results from operations that ignore cancellation.
- The browser fetches and hashes the actual source bytes and sends `sourceImageHash`. It validates returned project/revision/artboard/layer identity, exact source/new wording, normalized region, inward-rounded pixel bounds, evidence, warnings and `review-required` status. It fetches and hashes the returned background and checks full source dimensions and SHA-256 before displaying a candidate. Image review is bounded to four megapixels and 32 MiB of encoded bytes. The response reader enforces this byte limit while streaming and checks an oversized Content-Length before reading the body.
- Source and image-frame aspect ratios must match unless the image uses fill fitting. This avoids applying source-space coordinates to a cropped/letterboxed display.
- Unselected layers are not rewritten to make room. The new native text uses a z-index between the source and next higher layer; clipping confines it to the reviewed region. Shared QR validation remains in the atomic canvas application.
- Source/output asset URLs must remain browser-fetchable with suitable CORS. Failed image fetch, decode or hashing leaves the canvas unchanged.

## Verification

Command run successfully:

```sh
pnpm exec vitest run test/banner/letteringRepairProposal.test.ts test/banner/letteringRepairImage.test.ts test/components/bannerLetteringRepairUi.test.ts test/banner/letteringProposal.test.ts test/components/bannerAnimationCanvas.test.ts test/banner/artworkUndo.test.ts
```

Latest provenance follow-up result: **79 tests passed** (48 repair state/transaction cases, 3 image-transfer boundary cases, 2 repair inspector cases, 13 existing lettering cases, and 13 animation/undo regression cases). Focused ESLint passes for the changed repair composable, shared contract and proposal test. Linting the entire existing `app/types/banner-studio.ts` reports 27 pre-existing style/type errors outside the single added optional field; that file was not reformatted. Separately, the preceding UI task reported `pnpm exec vitest run test/banner/dragControls.test.ts` passing all 18 tests after the isolated repair preview mock was added under coordinator-granted ownership; the provenance follow-up did not rerun that suite.

The provenance regression checks both output records, exact protected sibling/other-artboard preservation, complete removal on undo and restoration on redo. Save/reopen now uses a JSON roundtrip of the actual mocked PATCH `canvasData` payload, rather than reloading the pre-save local variable, and asserts both restored metadata records plus exactly one explicit repair request. Additional cases reject oversized provenance and ensure opaque provider/output fields are omitted. This verifies local serialization and history behavior, not hosted storage acceptance.

A mounted-order regression reads candidate and preview state before generation, proving the reactive preview appears after the response; this caught and fixed an initial computed short-circuit defect during the coordinator browser run. The existing animation canvas and drag-controls tests now mock the added repair composable before imports, preserving its isolated rendering scope.

Coverage includes source and response hash/dimension/region mismatch, unsupported/protected source states, protected overlap, cancellation before/after asynchronous image work, ten stale-response triggers, original comparison, font-size clipping, preview without document mutation, one undo/redo, unselected records, save/reopen and accessible region/review controls. Inspector tests mount the Vue component with Nuxt UI control stubs; these are not hosted browser or provider quality acceptance.

The coordinator's actual Nuxt browser fixture proof is separate and uses `scripts/banner-studio/prove-lettering-repair.mjs`. Review that run's current output before claiming browser acceptance. Live provider quality, authorization/storage integration and production deployment remain separate gates.

## Files and proof selectors

- `app/composables/useBannerLetteringRepair.ts`: singleton repair state, validation, cancellation, candidate construction and atomic apply.
- `app/components/banner/inspector/LetteringRepair.vue`: region and proposal review.
- `app/components/banner/inspector/Lettering.vue`: entry point and isolated-lettering label.
- `app/components/banner/Artboard.client.vue`: full-background/native-text preview only.
- `test/banner/letteringRepairProposal.test.ts`, `test/banner/letteringRepairImage.test.ts`, `test/components/bannerLetteringRepairUi.test.ts`: focused state and UI coverage.

Browser selectors use `data-testid`: `lettering-repair-open`, `lettering-repair-region-x` / `-y` / `-w` / `-h`, `lettering-repair-region-outline`, `lettering-repair-source-wording`, `lettering-repair-wording`, `lettering-repair-region-reviewed`, `lettering-repair-generate`, `lettering-repair-background`, `lettering-repair-original`, `lettering-repair-reviewed`, `lettering-repair-apply`, and `lettering-repair-error`.
