# Implementation Plan: Video Studio Unified Producer

**Status:** Draft for review - 2026-06-18
**PRD:** `docs/superpowers/specs/2026-06-18-video-studio-unified-producer-prd.md`
**Goal:** Merge library filters, AI Producer, Cloudflare video generation, voiceover, text/overlay, and timeline assembly into one coherent Video Studio workspace.

---

## Architecture Decisions

- **Use the existing AV timeline as the system of record.** New UI must insert into `video`, `overlay`, `voiceover`, and `music` lanes through `useMediaProjectEditor`.
- **Start with frontend aggregation.** Use existing endpoints first; add `studio-assets` only if state merging becomes brittle.
- **Keep Banner Studio as overlay source of truth for the first slice.** Add better Video Studio entry points before inventing inline overlay persistence.
- **Keep Cloudflare model policy unchanged.** Tenant users only see selectable Cloudflare AI Gateway models.
- **Make voice generation native to Video Studio.** Reuse `/api/agency/audio/voiceover` and `audio_assets`; do not build a separate video-only voice store.

---

## Phase 0: Product Review Checkpoint

- [ ] Confirm PRD scope.
- [ ] Decide whether caption generation is first-slice or later.
- [ ] Decide whether inline text overlay templates are first-slice or later.
- [ ] Pick first producer recipe defaults.

**Verification:** Human approval before implementation.

---

## Phase 1: Workbench Shell and Layout

### Task 1: Create `VideoStudioWorkbench` shell

**Description:** Introduce a parent workbench component that owns the three-column Video Studio layout and receives the current project/editor state from `[id].vue`.

**Acceptance criteria:**

- [x] AV projects render the workbench above the timeline.
- [x] Audio projects remain unchanged.
- [x] Existing `MediaAssetHarness` functionality is not removed yet.
- [x] Workbench has clear regions for Library, Preview/Prepare, and Producer.

**Verification:**

- [x] `pnpm run build`
- [ ] Manual: open AV project and audio project.

**Dependencies:** PRD approval.

**Files likely touched:**

- `app/pages/agency/audio/projects/[id].vue`
- `app/components/media/VideoStudioWorkbench.vue`

**Estimated scope:** Medium.

### Task 2: Split AI Producer into embeddable regions

**Description:** Refactor `MediaAssetHarness.vue` logic so project buckets, prepare/mask controls, and assembly/activity sections can be embedded in the workbench without a standalone accordion mental model.

**Acceptance criteria:**

- [ ] Existing mask, extraction, derivative, and assembly actions still work.
- [ ] Header/accordion state no longer controls the primary AV workspace.
- [ ] Component boundaries are clear enough to replace sections independently.

**Verification:**

- [ ] `pnpm exec vitest run test/app/videoAssetHarnessDerivatives.test.ts`
- [ ] `pnpm run build`

**Dependencies:** Task 1.

**Files likely touched:**

- `app/components/media/MediaAssetHarness.vue`
- `app/components/media/VideoStudioWorkbench.vue`
- New child components if needed.

**Estimated scope:** Medium.

### Checkpoint: Layout Foundation

- [ ] AV project opens.
- [ ] Existing producer actions still render.
- [ ] Audio editor remains unchanged.
- [ ] Build passes.

---

## Phase 2: Unified Library Rail

### Task 3: Add asset aggregation composable

**Description:** Create `useVideoStudioAssets` to merge project buckets, generated video assets, audio assets, overlay projects, derivatives, and active jobs into one normalized asset list.

**Acceptance criteria:**

- [x] Normalized asset shape supports type, source, status, model, bucket, duration, thumbnails, and timeline payload availability.
- [x] Uses existing endpoints only.
- [x] Failed/blocked/queued/running assets appear with useful status.

**Verification:**

- [x] Add unit tests for normalization/filtering.
- [x] `pnpm exec vitest run test/app/videoStudioAssets.test.ts`
- [x] `pnpm run build`

**Dependencies:** Task 1.

**Files likely touched:**

- `app/composables/useVideoStudioAssets.ts`
- `test/app/videoStudioAssets.test.ts`

**Estimated scope:** Medium.

### Task 4: Build filtered library rail

**Description:** Replace the bucket-only browsing experience with a library rail that supports search and filters across type/source/status/model/bucket.

**Acceptance criteria:**

- [x] Filters include type, source, status, and model.
- [x] Search matches title, prompt, role, filename, model, and format.
- [x] Selecting an asset updates the workbench selected asset.
- [ ] Bucket grouping remains available.

**Verification:**

- [x] Component/unit tests for filter behavior.
- [ ] Manual: filter voiceovers, generated videos, derivatives, overlays.
- [x] `pnpm run build`

**Dependencies:** Task 3.

**Files likely touched:**

- `app/components/media/VideoStudioLibraryRail.vue`
- `app/components/media/VideoStudioWorkbench.vue`
- `test/app/videoStudioLibraryRail.test.ts`

**Estimated scope:** Medium.

### Checkpoint: Library Unification

- [ ] User can find project video assets and audio assets in one rail.
- [ ] AI Producer bucket context still exists.
- [ ] No API schema changes required so far.

---

## Phase 3: Visual Generation and Prepare Panel

### Task 5: Embed generation controls in prepare panel

**Description:** Move the useful parts of `MediaGeneratePicker` into an embeddable panel so visual generation can run from the selected asset context.

**Acceptance criteria:**

- [ ] Image-to-video can be started from a selected source asset.
- [ ] Text-to-video remains hidden unless selectable models allow it.
- [ ] Model capability controls still match registry constraints.
- [ ] Recent jobs still visible.

**Verification:**

- [ ] `pnpm exec vitest run test/app/videoGenerationForm.test.ts`
- [ ] Manual: selected source image pre-fills image-to-video.
- [ ] `pnpm run build`

**Dependencies:** Task 4.

**Files likely touched:**

- `app/components/media/MediaGeneratePicker.vue`
- `app/components/media/VideoStudioPreparePanel.vue`
- `app/components/media/VideoStudioWorkbench.vue`

**Estimated scope:** Medium.

### Task 6: Preserve and polish asset preparation tools

**Description:** Place mask/erase/layer controls in the center prepare panel with clear selected-asset state and derivative outputs.

**Acceptance criteria:**

- [ ] Mask canvas remains usable.
- [ ] Run action still creates/refreshes jobs.
- [ ] Derivatives can be added to timeline or bucket.
- [ ] Available model messaging handles unmapped actions.

**Verification:**

- [ ] `pnpm exec vitest run test/app/videoAssetHarnessDerivatives.test.ts`
- [ ] Manual: select asset, draw mask, run action, view activity.
- [ ] `pnpm run build`

**Dependencies:** Task 2, Task 4.

**Files likely touched:**

- `app/components/media/VideoStudioPreparePanel.vue`
- `app/components/media/MediaAssetHarness.vue`
- `app/utils/video/assetDerivativeTimeline.ts`

**Estimated scope:** Medium.

### Checkpoint: Visual Creation Path

- [ ] User can select asset, generate visual, prepare derivative, and add to timeline.
- [ ] Existing generation policy is preserved.
- [ ] Build/tests pass.

---

## Phase 4: Voiceover Native Flow

### Task 7: Add Video Studio voice composer

**Description:** Add a producer-rail voice composer that calls `/api/agency/audio/voiceover`, previews the result, and inserts it into the `voiceover` lane.

**Acceptance criteria:**

- [x] User can enter script text and generate voiceover.
- [x] Generated audio asset is persisted using existing Audio Studio endpoint.
- [x] Generated voiceover can be previewed.
- [x] User can add generated asset to VO track at playhead.
- [x] Guard violations are shown.

**Verification:**

- [x] Unit test voice composer rendering behavior.
- [ ] Manual: generate VO and confirm clip appears on VO lane.
- [x] `pnpm run build`

**Dependencies:** Task 1.

**Files likely touched:**

- `app/components/media/VideoStudioVoiceComposer.vue`
- `app/components/media/VideoStudioProducerRail.vue`
- `app/composables/useMediaProjectEditor.ts` if insertion helper needs polish.
- `test/app/videoStudioVoiceComposer.test.ts`

**Estimated scope:** Medium.

### Task 8: Surface voice/music assets in library rail

**Description:** Ensure voiceover and music assets from `audio_assets` are first-class library assets with filter, preview, and timeline insertion.

**Acceptance criteria:**

- [x] Library rail shows ready voiceover/music assets.
- [x] Audio assets can be previewed.
- [x] Audio assets can be added to correct audio lanes.
- [x] Queued/failed music assets show status but cannot be inserted until ready/done.

**Verification:**

- [x] Unit test timeline payload mapping.
- [ ] Manual: add existing voiceover and music assets.
- [x] `pnpm run build`

**Dependencies:** Task 3, Task 7.

**Files likely touched:**

- `app/composables/useVideoStudioAssets.ts`
- `app/components/media/VideoStudioLibraryRail.vue`
- `app/components/media/VideoStudioWorkbench.vue`

**Estimated scope:** Medium.

### Checkpoint: Audio/Voice Path

- [ ] Voice generation works inside Video Studio.
- [ ] Existing Audio Studio persistence remains unchanged.
- [x] Audio assets are discoverable in unified library.

---

## Phase 5: Overlay and Text Workflow

### Task 9: Integrate Banner overlay selection into producer rail

**Description:** Move or embed the overlay picker into the Video Studio producer/library flow so overlay clips are added without a disconnected slideover-only interaction.

**Acceptance criteria:**

- [x] User can search/select Banner Studio project and format from Video Studio.
- [x] Overlay clip is added to the `overlay` lane.
- [x] Existing render-video overlay resolution still works.

**Verification:**

- [ ] Manual: add overlay and preview overlay.
- [ ] Manual: render video with overlay.
- [x] `pnpm run build`

**Dependencies:** Task 1.

**Files likely touched:**

- `app/components/media/MediaOverlayPicker.vue`
- `app/components/media/VideoStudioOverlayComposer.vue`
- `app/components/media/VideoStudioProducerRail.vue`

**Estimated scope:** Small/Medium.

### Task 10: Add lightweight overlay templates behind existing Banner path

**Description:** If approved, provide a small set of text overlay templates that create or reuse Banner Studio-compatible overlay data.

**Acceptance criteria:**

- [ ] Templates include title, lower third, offer card, CTA.
- [ ] Created overlay is renderable by existing overlay pipeline.
- [ ] No new overlay schema is introduced without review.

**Verification:**

- [ ] Manual: create overlay, preview, render.
- [ ] `pnpm run build`

**Dependencies:** Task 9 and explicit approval.

**Files likely touched:**

- To be confirmed after storage decision.

**Estimated scope:** Medium/Large. Break further after decision.

### Checkpoint: Overlay Path

- [x] Existing Banner overlays are easy to add from Video Studio.
- [x] Render path remains unchanged.
- [ ] Inline overlay template decision recorded.

---

## Phase 6: Producer Assembly and Recipes

### Task 11: Upgrade producer rail draft plan UX

**Description:** Make brief, format, script, voice, overlay, and selected assets visible in one producer rail, then build/apply draft timeline plans.

**Acceptance criteria:**

- [ ] Brief and target format remain.
- [ ] Selected assets are visible to the producer rail.
- [ ] Draft plan output clearly shows clips/steps.
- [ ] Apply adds visual clips to timeline.
- [ ] Voice/overlay additions are represented or queued for manual insert if not yet plan-supported.

**Verification:**

- [ ] Existing assembly plan tests pass or are added.
- [ ] Manual: build and apply draft plan.
- [ ] `pnpm run build`

**Dependencies:** Task 4, Task 6, Task 7.

**Files likely touched:**

- `app/components/media/VideoStudioProducerRail.vue`
- `app/utils/video/aiAssemblyTimeline.ts`
- `app/components/media/MediaAssetHarness.vue`

**Estimated scope:** Medium.

### Task 12: Add first producer recipes

**Description:** Add recipe presets for common agency social edits.

**Candidate recipes:**

- Dealer offer 9:16.
- Product reveal.
- Brand story b-roll.
- Testimonial cutdown.
- Event recap.

**Acceptance criteria:**

- [ ] Recipe changes brief/format/asset filters predictably.
- [ ] Recipe does not bypass policy gates.
- [ ] Recipe is editable before execution.

**Verification:**

- [ ] Unit tests for recipe defaults.
- [ ] Manual: select recipe, build plan.
- [ ] `pnpm run build`

**Dependencies:** Task 11.

**Files likely touched:**

- `app/utils/video/producerRecipes.ts`
- `app/components/media/VideoStudioProducerRail.vue`
- `test/app/videoProducerRecipes.test.ts`

**Estimated scope:** Small.

### Checkpoint: Producer Workflow

- [ ] Operator can produce a draft from assets, voice, overlays, and selected format.
- [ ] Timeline remains editable after apply.
- [ ] Jobs/activity are visible.

---

## Phase 7: Captions and Publishing Polish

### Task 13: Caption asset visibility

**Description:** Surface caption availability and VTT links in the library/asset detail UI.

**Acceptance criteria:**

- [ ] Assets with captions show a caption badge/filter.
- [ ] Caption VTT can be opened/downloaded where available.
- [ ] Caption absence is not treated as an error.

**Verification:**

- [ ] Manual: generated asset with captions shows caption status.
- [ ] `pnpm run build`

**Dependencies:** Task 3.

**Files likely touched:**

- `app/composables/useVideoStudioAssets.ts`
- `app/components/media/VideoStudioLibraryRail.vue`
- `app/components/media/VideoStudioPreparePanel.vue`

**Estimated scope:** Small.

### Task 14: Optional caption generation spike

**Description:** If approved, prototype Workers AI Whisper caption generation for a selected audio/video asset.

**Acceptance criteria:**

- [ ] Generates VTT from selected asset.
- [ ] Stores caption key consistently.
- [ ] Does not block main render flow.

**Verification:**

- [ ] API test for generated VTT shape.
- [ ] Manual: generate captions and view badge.

**Dependencies:** Task 13 and explicit approval.

**Files likely touched:** TBD after storage decision.

**Estimated scope:** Large. Break further after approval.

### Task 15: Publishing/export affordance cleanup

**Description:** Keep render, save asset, send to portal, and social publish accessible in the unified workspace.

**Acceptance criteria:**

- [ ] Render jobs are visible in workbench or below timeline.
- [ ] Save/send/publish actions remain available.
- [ ] Generated social caption flow remains available.

**Verification:**

- [ ] Manual: render -> save asset -> send/publish path.
- [ ] `pnpm run build`

**Dependencies:** Task 11.

**Files likely touched:**

- `app/pages/agency/audio/projects/[id].vue`
- `app/components/media/VideoStudioProducerRail.vue`
- Existing render job UI.

**Estimated scope:** Small/Medium.

---

## Phase 8: Hardening and Launch

### Task 16: Regression pass

**Description:** Run focused tests and manual checks across audio and AV project types.

**Acceptance criteria:**

- [ ] Audio project create/open/edit still works.
- [ ] AV project create/open/edit still works.
- [ ] Existing render flow still works.
- [ ] No build errors.

**Verification:**

- [ ] `pnpm exec vitest run test/app/videoGenerationForm.test.ts test/app/videoAssetHarnessDerivatives.test.ts`
- [ ] Additional new focused tests.
- [ ] `pnpm run build`
- [ ] `git diff --check`

**Dependencies:** All implementation tasks.

**Files likely touched:** Tests only unless regressions are found.

**Estimated scope:** Medium.

### Task 17: Documentation and handoff

**Description:** Update docs with final architecture, flags, and known limitations.

**Acceptance criteria:**

- [ ] PRD status updated.
- [ ] Implementation plan checkboxes reflect completed work.
- [ ] Handoff notes include remaining deferred items.

**Verification:**

- [ ] Docs reviewed.
- [ ] Links point to actual files.

**Dependencies:** Task 16.

**Files likely touched:**

- PRD
- Plan
- Optional handoff doc.

**Estimated scope:** Small.

---

## Parallelization Opportunities

Safe to parallelize after Task 1:

- Library normalization tests and rail UI.
- Voice composer.
- Overlay composer.
- Producer recipe definitions.

Must be sequential:

- Workbench shell before major child components.
- Asset normalization before library filters.
- Voice insertion before producer plan includes voice.
- Overlay storage decision before inline template builder.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Workbench refactor destabilizes editor | High | Keep first task as wrapper; only split behavior after build passes. |
| Existing slideover components are hard to embed | Medium | Extract shared composables before moving UI. |
| Asset aggregation becomes too complex in frontend | Medium | Add `studio-assets` endpoint after proving duplication. |
| TTS result duration is unknown | Medium | Insert with decoded duration when available; otherwise allow trim after insert. |
| Overlay templates expand scope | High | Start with Banner selection only; template task requires approval. |
| Caption generation expands storage/API scope | Medium | First task is visibility only; generation is optional spike. |

---

## Recommended First Build Slice

For the next implementation session, build the smallest useful vertical slice:

1. Task 1: Workbench shell.
2. Task 3: Asset aggregation composable.
3. Task 4: Filtered library rail.
4. Task 7: Voice composer with insert-to-VO.

This delivers the biggest UX correction: one workspace, real filters, and Cloudflare voice integrated into the editor.
