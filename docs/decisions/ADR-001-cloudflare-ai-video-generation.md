# ADR-001: Cloudflare AI Gateway Only For AI Video Generation

## Status
Accepted

## Date
2026-06-18

## Context
We are building an agency video editor inside the existing AV media project workflow. The R&D reference was `Anil-matcha/Open-Generative-AI`, which is useful as a generative media studio reference, but it is not a full non-linear editor and should not be treated as an integration dependency.

The user explicitly rejected MuAPI for this path. Available generation models should come through the Cloudflare AI Gateway / Workers AI surface already used by the project.

Key product requirements:
- Generate image-to-video clips from approved source images.
- Store completed outputs as first-class `video_assets`.
- Let users retry/reuse prompts and send generated clips into the existing timeline.
- Keep unsupported editing modes hidden until a Cloudflare model explicitly supports them.

## Decision
Use Cloudflare AI Gateway as the only active AI video provider for the tenant-facing video editor.

Open Generative AI is treated as UX prior art only. The patterns borrowed are:
- Prompt templates.
- Image-to-video first composer.
- Recent generation history.
- Retry/regenerate from prior jobs.
- Direct add-to-timeline from completed generations.
- Future capability gates for extend, end-frame, and video-to-video workflows.

MuAPI models are not registered in the active model registry. Current selectable models are Cloudflare image-to-video models only.

## Alternatives Considered

### Integrate MuAPI
- Pros: Existing third-party video endpoints may cover more generation/editing modes.
- Cons: User explicitly rejected it; adds another provider contract and billing/compliance path.
- Rejected.

### Fork Or Embed Open Generative AI
- Pros: Faster access to a complete generative-media UI shell.
- Cons: Mismatched architecture, provider assumptions, and product scope. It is a generation studio, not our AV editor.
- Rejected.

### Expose Text-To-Video Immediately
- Pros: More generative options.
- Cons: Current tenant-safe policy is I2V-first, especially for vehicle/dealer workflows. T2V is dormant/internal until model and policy support are verified.
- Deferred.

### Build Extend / End-Frame / V2V Controls Now
- Pros: Matches common generative-video editor workflows.
- Cons: Current Cloudflare model registry does not prove these capabilities. Showing controls would create unsupported submissions.
- Deferred behind explicit model capability metadata.

## Consequences
- The active model picker remains Cloudflare-only.
- Tenant-facing generation submission accepts only active selectable Cloudflare AI Gateway models; hidden, internal, disabled, mock, and legacy-provider models fail closed even if named in tenant policy.
- Submission also validates requested mode, duration, aspect ratio, resolution, explicit subject type, and source-image requirement against the selected model before compliance, policy, budget, job creation, or enqueue work.
- UI templates only use currently selectable image-to-video modes.
- Completed generation jobs can be added directly to the timeline through the same `video_assets` path as the video library.
- Future edit modes must be enabled by `VideoGenerationCapabilities`, not by optimistic UI assumptions.
- Timeline stills that are not backed by `video_assets` can be registered as generation source assets only after the picker flushes the draft timeline and the server verifies both project ownership and that the still clip exists on the current AV project timeline.
- Save-dependent actions such as timeline-still source registration, render, and version snapshot must stop if the draft timeline save fails.
- I2V source registration rejects non-image R2 keys instead of guessing a content type from unsupported extensions.
- Idempotency reuse is scoped to the same tenant and project; a reused key for another project is treated as a conflict.

## Verification
Current focused verification commands:

```bash
pnpm test:run test/video-generation/cfInputs.test.ts test/video-generation/aiGatewayProvider.test.ts test/video-generation/modelRegistry.test.ts test/video-generation/modelsApi.test.ts test/video-generation/surface.test.ts test/app/videoGenerationForm.test.ts test/video-generation/muapiProvider.test.ts test/video/generationStatusVisibility.test.ts test/video/videoLibraryTimeline.test.ts test/audio/timelineEditAv.test.ts test/video/generationTemplates.test.ts test/video/modelPresentation.test.ts test/video-generation/sourceFromTimelineStill.test.ts test/video-generation/sourceFromAsset.test.ts test/video-generation/sourceAssetsUpload.test.ts test/video-generation/sourceAssets.test.ts test/video-generation/sourceAssetStore.test.ts test/video-generation/resolveSourceUrls.test.ts test/audio/mediaEditorAv.test.ts test/video-generation/sourceContentTypes.test.ts test/video-generation/timelineStillSource.test.ts test/video-generation/generationApi.test.ts test/video-generation/budget.test.ts test/video-generation/jobsListApi.test.ts test/video-generation/worker.test.ts test/video-generation/reconcile.test.ts test/video-generation/jobsList.test.ts test/video-generation/webhook.test.ts test/video-generation/webhookEndpoint.test.ts
pnpm exec vue-tsc --noEmit --pretty false --skipLibCheck
```
