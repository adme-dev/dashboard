# Video Studio Unified Producer PRD

**Status:** First implementation slice shipped - 2026-06-18
**Owner:** Product/Engineering
**Feature area:** Creative > Video Studio
**Builds on:** AV timeline editor, AI video generation via Cloudflare AI Gateway, AI Producer asset intelligence, Audio Studio voice generation, Banner Studio overlays, social publishing/export flow.
**Reference inputs:** Open Generative AI repo R&D, Runway/CapCut/Canva market scan, current codebase inspection.

**Implementation note:** The first shipped slice delivers the unified workbench shell, filtered asset library, native voice composer, Banner overlay composer, producer recipes, draft-plan rail, caption visibility, and render job actions inside the Video Studio workspace. Manual end-to-end browser checks and optional inline overlay/caption-generation spikes remain deferred.

---

## 1. Executive Summary

Video Studio should become a single integrated production workspace where an agency operator can discover project assets, generate or prepare visuals, create voice and text overlays, assemble a social edit, render, and publish/review without leaving the editor.

The current platform has most foundations already:

- AV timeline with `video`, `overlay`, `voiceover`, and `music` tracks.
- Cloudflare AI Gateway video generation for selected image-to-video models.
- Workers AI speech-to-text and text-to-speech utilities.
- Audio assets for generated voiceover/music.
- Banner Studio overlays rendered into final video.
- AI Producer asset-intelligence jobs for masks, derivatives, and assembly plans.
- Video library, render jobs, portal handoff, and social publishing hooks.

The gap is product integration. Users currently encounter separate drawers, pickers, filters, and studios. The next product slice should merge these into a coherent Video Studio shell with a filtered library rail, a central preview/prep canvas, a producer/assistant rail, and the timeline as the destination.

---

## 2. Problem Statement

Users building short-form client videos need to combine many asset types:

- Uploaded footage and stills.
- AI-generated videos.
- Prepared derivatives such as masks, lifted layers, background removals, and clean plates.
- Voiceover, music, captions, lower-thirds, and Banner Studio overlays.
- Social publish copy and approval-ready renders.

Today these capabilities exist, but the workflow is fragmented:

- Asset filtering is separated from AI Producer buckets.
- Voiceover is generated in Audio Studio and later added via an audio asset picker.
- Text/graphics overlays are picked from Banner Studio, not created or managed naturally in the video context.
- AI generation is in a slideover rather than part of the producer workflow.
- AI Producer shows project buckets and job state, but it does not yet behave like the main production command surface.

This produces cognitive overhead: operators have to remember where each capability lives instead of following a natural create -> prepare -> assemble -> render flow.

---

## 3. Product Goals

1. **Unify the production workflow**
   Operators can find, generate, prepare, voice, overlay, assemble, and render from one Video Studio workspace.

2. **Make the timeline the destination**
   All generation and producer actions should produce timeline-ready clips or reusable assets.

3. **Expose Cloudflare-backed capabilities clearly**
   Cloudflare AI Gateway video generation and Workers AI voice/STT should appear as platform-native capabilities, not hidden utilities.

4. **Preserve governance**
   Keep tenant policy, model allowlists, compliance gates, budget controls, and source-asset provenance intact.

5. **Keep existing editor reliability**
   Audio projects must remain unchanged. AV project changes must remain compatible with existing render and preview behavior.

---

## 4. Non-Goals

- Replacing the existing AV timeline engine.
- Replacing Banner Studio.
- Building a full node-based workflow builder in the first slice.
- Enabling all dormant model registry entries by default.
- Copying MuAPI integrations or adopting MuAPI as a provider.
- Removing safety/compliance gates to match unrestricted open-source tools.
- Building a frame-perfect browser compositor; server render remains authoritative.

---

## 5. Target Users

### Primary: Agency Operator

Creates short-form client videos for social, ads, dealer promos, campaign assets, and client approvals. Needs speed, predictable outputs, and clear asset provenance.

### Secondary: Creative Lead

Reviews generated outputs, chooses variants, approves final timeline/renders, and sends assets to clients or publishing workflows.

### Secondary: Account Manager

Needs a simple way to create client-ready social variants and publish/portal-send without becoming a video editor expert.

---

## 6. Current Codebase Inventory

### AV Timeline

- `server/utils/audio/timelineSchema.ts`
  - AV timeline supports `video`, `overlay`, `voiceover`, `music`.
  - `emptyAvTimeline()` already creates those lanes.

- `app/composables/useMediaProjectEditor.ts`
  - Loads/saves timeline.
  - Adds video and overlay clips.
  - Handles render jobs and export actions.

- `app/components/media/MediaTimeline.client.vue`
  - Generic track/clip editor supporting audio/video/overlay display.

- `app/components/media/MediaAvPreview.client.vue`
  - Preview canvas for video/stills plus Banner overlay iframe sync.

### AI Video Generation

- `server/utils/video-generation/modelRegistry.ts`
  - Cloudflare AI Gateway models exist.
  - Enabled tenant-facing models currently include image-to-video routes such as Seedance, Wan, and Hailuo.
  - Text-to-video and native-audio models exist but are disabled/internal.

- `server/utils/video-generation/providers/aiGatewayProvider.ts`
  - Uses `env.AI.run(model, inputs, { gateway: { metadata } })`.
  - Treats partner video models as synchronous long-running Cloudflare AI Gateway calls.

- `app/components/media/MediaGeneratePicker.vue`
  - Current UI for text-to-video/image-to-video request setup and recent jobs.

### Voice and Audio

- `server/utils/aiVoice.ts`
  - Speech-to-text: `@cf/openai/whisper-large-v3-turbo`.
  - Text-to-speech: `@cf/myshell-ai/melotts`.

- `server/api/agency/audio/voiceover.post.ts`
  - Generates voiceover audio and persists it as an audio asset.

- `server/utils/audio/assets.ts`
  - Stores voiceover/music rows and R2 master files.

- `app/composables/useAudioStudio.ts`
  - Frontend generation helper for voiceover and music.

- `app/components/media/MediaAssetPicker.vue`
  - Adds voiceover/music assets to the timeline.

### Overlays and Captions

- `app/components/media/MediaOverlayPicker.vue`
  - Picks Banner Studio project and format as an overlay clip.

- `server/api/agency/audio/projects/[id]/render-video.post.ts`
  - Resolves overlay clips into HTML, uploads to R2, and enqueues render.

- `server/api/agency/video/assets/[id]/captions.vtt.get.ts`
  - Serves stored caption VTT for video assets.

### AI Producer / Asset Intelligence

- `app/components/media/MediaAssetHarness.vue`
  - Shows project buckets, asset prep actions, mask canvas, derivatives, AI activity, and draft assembly.

- `server/api/agency/video/assets/[id]/extract.post.ts`
  - Asset intelligence extraction route.

- `server/api/agency/video/projects/[id]/assemble.post.ts`
  - Draft plan generation route.

---

## 7. Market/R&D Takeaways

### Open Generative AI

Useful product patterns:

- Separate studios: Image, Video, Audio, AI Clipping, Lip Sync, Cinema, Workflow.
- Multi-model catalog with model-specific controls.
- Reference image picker with upload history and multi-select.
- Generation history and resumable jobs.
- Workflow Studio for multi-step pipelines.

Adopt as inspiration only:

- Do not adopt MuAPI.
- Do not adopt unrestricted/no-filter product stance.
- Do not copy their stack wholesale.

### Runway

Takeaway: generation quality is increasingly framed around references, continuity, and controllability rather than a generic prompt box. Our UX should emphasize source assets, reference selection, character/product consistency, and precise output control.

### CapCut

Takeaway: winning UX combines script, templates, avatars/voice, scene panels, captions, music, timeline edits, and export. Users want "generate, then edit", not "generate and stop".

### Canva

Takeaway: AI output should land in an editor where it can be refined. Generation must be part of the creation canvas, not a dead-end modal.

---

## 8. UX Vision

### Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Header: Video Studio / project / save / render / publish             │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ Library       │ Preview + Prepare                    │ Producer      │
│               │                                      │               │
│ Search        │ Selected asset preview               │ Brief         │
│ Filters       │ Mask / erase / layer tools           │ Script        │
│ Buckets       │ Generate visual controls             │ Voice         │
│ Assets        │ Voice/text overlay prep              │ Captions      │
│ Jobs          │                                      │ Draft plan    │
├───────────────┴──────────────────────────────────────┴───────────────┤
│ Timeline: video / overlay / voiceover / music                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Primary Workflow

1. Open Video Studio from Creative.
2. Select or create an AV project.
3. Use the left library to filter/select footage, stills, generated clips, audio, overlays, masks, and derivatives.
4. Use the center panel to preview, generate, or prepare the selected asset.
5. Use the producer rail to draft a social edit, generate voice, create captions/overlays, and build a plan.
6. Apply selected clips/plan to the timeline.
7. Render, review, save as asset, send to portal, or publish.

---

## 9. Core Product Requirements

### 9.1 Unified Library Rail

The left rail combines current project buckets, video library, audio asset picker, overlay picker entry points, and generation history.

Required filters:

- Asset type: footage, still, generated video, derivative, voiceover, music, overlay, caption.
- Source: upload, generated, Banner Studio, Audio Studio, render, derivative.
- Status: ready, queued, running, failed, blocked.
- Model/provider: Cloudflare AI Gateway model id, Workers AI, mock/test.
- Aspect ratio: 9:16, 16:9, 1:1.
- Bucket: generated, selected, source, prepared, export.
- Date/recent.
- Search by title, prompt, role, filename.

Acceptance criteria:

- User can find all assets relevant to an AV project in one panel.
- Existing buckets remain visible but become a filter/grouping, not the only browsing model.
- Empty bucket noise is hidden by default.
- Selecting an asset updates the center prepare panel.

### 9.2 Center Preview and Prepare Panel

The center panel is the active asset surface.

Required modes:

- Preview selected asset.
- Generate visual.
- Prepare asset with mask/erase/layer/background tools.
- Preview derivative outputs.
- Add selected item or derivative to timeline.

Acceptance criteria:

- Current mask canvas behavior remains available.
- Tool controls are model-aware and action-aware.
- Selected asset state is clear.
- Empty states explain what action is possible next.

### 9.3 Producer Rail

The right rail becomes the command surface for AI-assisted assembly.

Required sections:

- Brief: what to create.
- Format: Reels/TikTok 9:16, YouTube 16:9, square 1:1.
- Script: optional generated or user-written script.
- Voice: generate or select voiceover.
- Text overlay: create/select lower third/title/offer card.
- Captions: attach/import/generate captions where supported.
- Draft plan: proposed timeline steps.
- Job state: active and completed AI jobs.

Acceptance criteria:

- User can create a draft plan and apply it to timeline.
- Voiceover generated from the producer rail is persisted as an audio asset and can be inserted into the `voiceover` lane.
- Text/graphic overlay can be inserted into the `overlay` lane.

### 9.4 Voiceover Integration

Use the existing Workers AI TTS path.

Required behavior:

- Script text -> `/api/agency/audio/voiceover`.
- Persist result in `audio_assets`.
- Insert result into voiceover track.
- Surface mimicry/guard violations.
- Allow preview before insertion.

Acceptance criteria:

- Voice generation does not require leaving Video Studio.
- Generated voiceover uses existing Audio Studio persistence.
- The same asset remains available in the general audio library.

### 9.5 Text Overlay Integration

Short-term:

- Use Banner Studio overlays as the source of truth for rendered HTML overlays.
- Provide a faster Video Studio entry point for selecting a Banner Studio project/format.

Medium-term:

- Add lightweight inline overlay templates: title, lower third, price/offer card, CTA, caption-safe title.
- Store these either as Banner Studio projects or as a new timeline overlay subtype only after design review.

Acceptance criteria:

- Existing Banner Studio render path remains authoritative.
- Operators can add overlay clips without mentally leaving Video Studio.

### 9.6 AI Video Generation Integration

Use existing Cloudflare AI Gateway registry and provider.

Required behavior:

- Keep enabled tenant-facing models as-is.
- Present only selectable models by default.
- Show disabled/future capabilities only as unavailable if useful.
- Support image-to-video from selected project/source assets.
- Keep text-to-video hidden unless enabled by model/policy.

Acceptance criteria:

- No MuAPI usage.
- No disabled/internal model exposed as active.
- Existing compliance, idempotency, budget, and tenant gates remain enforced.

### 9.7 Captions

Short-term:

- Display caption availability for video assets with `captionVttUrl`.
- Allow caption VTT to be treated as an asset facet/filter.

Medium-term:

- Add STT caption generation from uploaded/generated video or voiceover using Workers AI Whisper.
- Store caption VTT on video assets or a caption asset table, depending on schema review.

Acceptance criteria:

- Existing caption VTT route remains supported.
- Caption generation is a separate task after library/voice integration unless explicitly pulled forward.

### 9.8 Render and Distribution

Required behavior:

- Render button remains in the editor toolbar.
- Render jobs panel remains visible.
- Save asset, send to portal, and publish social remain available.
- Producer rail can generate social caption text using existing social caption utilities.

Acceptance criteria:

- Existing render-video endpoint and queue path remain untouched unless required.
- Overlay resolution still works.
- Multi-format render remains available.

---

## 10. Data and API Requirements

### Existing APIs to Reuse

- `GET /api/agency/video/projects/:id/buckets`
- `GET /api/agency/video/projects/:id/intelligence-jobs`
- `POST /api/agency/video/projects/:id/assemble`
- `GET /api/agency/video/generation/models`
- `POST /api/agency/video/generation/jobs`
- `GET /api/agency/video/generation/jobs`
- `POST /api/agency/audio/voiceover`
- `GET /api/agency/audio/assets`
- `POST /api/agency/audio/projects/:id/render-video`
- `GET /api/agency/audio/projects/:id/clip-sources`
- `GET /api/agency/banner-studio/projects`

### Likely New API Boundary

Add an aggregation endpoint only if frontend complexity becomes high:

```text
GET /api/agency/video/projects/:id/studio-assets
```

Response:

```ts
interface StudioAsset {
  id: string
  kind: 'footage' | 'still' | 'generated-video' | 'derivative' | 'voiceover' | 'music' | 'overlay' | 'caption'
  title: string | null
  status: 'ready' | 'queued' | 'running' | 'failed' | 'blocked'
  source: 'upload' | 'generation' | 'audio-studio' | 'banner-studio' | 'derivative' | 'render'
  bucketId?: string | null
  modelId?: string | null
  provider?: string | null
  prompt?: string | null
  aspectRatio?: string | null
  durationSec?: number | null
  thumbnailUrl?: string | null
  streamUrl?: string | null
  timelinePayload?: Record<string, unknown> | null
}
```

Start without this endpoint if composables can combine existing calls cleanly. Add it when duplication or race conditions appear.

---

## 11. Technical Architecture

### Frontend Component Direction

New or refactored components:

```text
app/components/media/VideoStudioWorkbench.vue
app/components/media/VideoStudioLibraryRail.vue
app/components/media/VideoStudioPreparePanel.vue
app/components/media/VideoStudioProducerRail.vue
app/components/media/VideoStudioVoiceComposer.vue
app/components/media/VideoStudioOverlayComposer.vue
app/composables/useVideoStudioAssets.ts
app/composables/useVideoStudioProducer.ts
```

Existing components should be reused where possible:

- `MediaAssetHarness.vue` logic becomes part of the workbench or is split.
- `MediaGeneratePicker.vue` generation form logic should become embeddable.
- `MediaAssetPicker.vue` asset list/filter behavior should inform the unified rail.
- `MediaOverlayPicker.vue` can remain as a fallback slideover while overlay composer is built.

### State Ownership

- `useMediaProjectEditor` remains timeline/source/render owner.
- New `useVideoStudioAssets` owns aggregated asset list and filters.
- New `useVideoStudioProducer` owns brief/script/voice/overlay/plan job orchestration.
- Avoid duplicating timeline mutation logic; all timeline insertions go through `useMediaProjectEditor`.

---

## 12. Commands

Use the repo's current commands:

- Build: `pnpm run build`
- Deploy: `pnpm run deploy`
- Focused video tests: `pnpm exec vitest run test/app/videoGenerationForm.test.ts test/app/videoAssetHarnessDerivatives.test.ts`
- API utility tests as added: `pnpm exec vitest run test/app/<new-test>.test.ts`
- Diff hygiene: `git diff --check`

Known local warnings:

- Missing local `JWT_SECRET` during build.
- Tailwind sourcemap warnings.
- Large chunk warnings.
- Dependency ESM rewrite warnings from some packages.

---

## 13. Testing Strategy

### Unit Tests

- Asset filtering and grouping.
- Model capability presentation.
- Timeline payload conversion for voiceover/overlay/generated media.
- Producer plan-to-timeline behavior.
- Voice composer request payload and error handling.

### Component Tests

- Library rail filters by type/source/status/model.
- Voice composer generates and emits timeline-ready asset.
- Producer rail applies plan.
- Prepare panel preserves mask/extraction behavior.

### API Tests

- Only add API tests if a new aggregation endpoint is created.
- Existing generation, policy, and voice endpoint tests should remain valid.

### Manual Verification

- AV project opens.
- Library rail can filter project assets.
- Generate visual flow still queues jobs.
- Generate voiceover and add to VO track.
- Add Banner overlay and render.
- Audio project behavior unchanged.

---

## 14. Success Metrics

### Product Metrics

- Time to create a simple 9:16 social draft from project assets under 5 minutes.
- User can generate/add VO without leaving Video Studio.
- User can filter and find generated assets, voice assets, overlays, and derivatives from one place.
- Render job success rate is not regressed.

### Engineering Metrics

- `pnpm run build` passes.
- Focused video tests pass.
- No new dependency required for first slice.
- No disabled/internal model exposed to tenant users.
- No regression to audio project editor.

---

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| UI becomes too dense | High | Use rails, tabs/segmented controls, progressive detail; keep timeline visible. |
| Audio editor regression | High | Keep AV-only branches; run audio/timeline regression tests. |
| Duplicated asset state | Medium | Centralize aggregation in `useVideoStudioAssets`. |
| Model routes exposed prematurely | High | Use `listSelectableVideoGenerationModels()` only for active controls. |
| Voice generation creates assets but not timeline clips | Medium | First voice task must include insert-to-VO acceptance criteria. |
| Overlay quick-builder conflicts with Banner Studio | Medium | Start by reusing Banner Studio picker; defer new overlay schema. |
| Render/preview mismatch | Medium | Server render remains authoritative; preview is assembly-grade. |

---

## 16. Boundaries

### Always

- Keep MuAPI out of the active implementation.
- Preserve tenant policy, budget, compliance, and model allowlist gates.
- Route timeline mutations through the existing editor composable.
- Keep audio project behavior unchanged.
- Run build before claiming the slice is done.

### Ask First

- New database tables or migrations.
- New provider/model enablement.
- New third-party dependencies.
- Replacing Banner Studio overlay persistence.
- Enabling text-to-video or native-audio models for tenants.

### Never

- Expose internal/dormant model routes as selectable tenant options.
- Hardcode provider credentials or gateway account data.
- Remove safety/guard rails to mimic unrestricted public tools.
- Revert unrelated user changes.

---

## 17. Open Questions

1. Should the first unified UI replace `MediaAssetHarness.vue` entirely, or wrap/split it behind new `VideoStudioWorkbench` components?
2. Do we want a new aggregation endpoint now, or start frontend-only using existing endpoints?
3. Should inline text overlay templates be stored as Banner Studio projects, or deferred until after the library/voice integration?
4. Should generated captions be in scope for the first build slice, or only caption visibility/filtering?
5. Which first "producer recipes" matter most: dealer promo, product reveal, offer ad, testimonial, or event recap?
