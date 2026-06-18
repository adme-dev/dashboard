# Video Studio Unified Producer Handoff

**Date:** 2026-06-18
**Status:** First implementation slice shipped to `main`; manual QA and approval-gated spikes remain.

## What Shipped

- Unified Video Studio workbench shell for AV projects: `app/components/media/VideoStudioWorkbench.vue`.
- Filtered multi-source library rail: `app/components/media/VideoStudioLibraryRail.vue`.
- Normalized asset aggregation: `app/composables/useVideoStudioAssets.ts`, `app/utils/video/videoStudioAssets.ts`.
- Native voice composer using the existing voiceover API/audio asset store: `app/components/media/VideoStudioVoiceComposer.vue`.
- Banner Studio overlay picker/composer inside the producer rail: `app/components/media/VideoStudioOverlayComposer.vue`.
- Producer rail with selected asset context, recipes, brief/format controls, draft plan review, and apply-to-timeline: `app/components/media/VideoStudioProducerRail.vue`.
- First producer recipe defaults: `app/utils/video/producerRecipes.ts`.
- Caption metadata visibility, caption filter, and VTT link in the library rail.
- Render jobs panel in the workbench with download, save-to-library, portal-send, and social-publish affordances: `app/components/media/VideoStudioRenderJobsPanel.vue`.

## Commits

- `74579f70 feat(video): add studio library rail`
- `38758001 feat(video): add studio voice composer`
- `4404b248 feat(video): surface audio assets in studio library`
- `4897697a feat(video): add studio overlay composer`
- `c4dcee0e feat(video): add studio producer rail`
- `cc422b19 feat(video): add producer recipes`
- `2bd09e2b feat(video): surface caption assets in studio`
- `55ac5aa2 feat(video): add studio render jobs panel`

## Verification Run

- `pnpm exec vitest run test/app/videoGenerationForm.test.ts test/app/videoAssetHarnessDerivatives.test.ts`
- `pnpm exec vitest run test/app/videoStudioAssets.test.ts test/app/videoProducerRecipes.test.ts test/components/videoStudioWorkbench.test.ts test/components/videoStudioLibraryRail.test.ts test/components/videoStudioVoiceComposer.test.ts test/components/videoStudioOverlayComposer.test.ts test/components/videoStudioProducerRail.test.ts test/components/videoStudioRenderJobsPanel.test.ts test/video/aiAssemblyTimeline.test.ts`
- `pnpm run build`
- `git diff --check`

Known build warnings are unchanged: missing local `JWT_SECRET`, Tailwind sourcemap warnings, chunk-size warnings, and Groq/OpenTelemetry ESM `this` warnings.

## Deferred Or Manual

- Manual browser QA: open audio and AV projects, confirm timeline editing, generate/add voiceover, add overlays, build/apply producer plan, render, save asset, send to portal, and publish to social compose.
- Approval-gated: inline overlay templates.
- Approval-gated: caption generation spike using Workers AI Whisper.
- Deferred refactor: fully split `MediaAssetHarness.vue` into embeddable prepare/activity modules; the existing harness remains available in the workbench details slot when enabled.
- Manual decision: whether caption generation and inline overlay templates belong in the first launch slice or later.

## Current Workspace Caveat

The working tree still has unrelated local entries that were present during implementation and were intentionally not touched:

- `.claude/scheduled_tasks.lock` deleted
- `graphify-out/` untracked
