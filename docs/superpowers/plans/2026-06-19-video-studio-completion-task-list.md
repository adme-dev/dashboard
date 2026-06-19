# Video Studio Completion Task List

**Date:** 2026-06-19
**Status:** Working backlog
**Feature area:** Creative > Video Studio
**Context:** Video Studio foundations are shipped. This list tracks the remaining cleanup, UX consolidation, AI Producer improvements, and QA work needed to move from foundation to complete editor.

## Current State

- AV project editing is live under Creative > Video Studio.
- Timeline supports video, overlay, voiceover, and music lanes.
- Cloudflare AI Gateway video generation is active; MuAPI remains non-selectable for tenant-facing flows.
- Voiceover, Banner Studio overlays, render jobs, video library, portal handoff, and social publishing hooks are wired.
- The main remaining work is product consolidation, UX cleanup, caption/overlay enhancements, and manual QA.

## Phase 1: Product Cleanup

- [x] Rename AV project screen from `Timeline editor` to `Video Studio`.
- [x] Keep audio projects labelled as `Timeline editor` or `Audio editor`.
- [x] Remove duplicate top-level actions between the page toolbar and Video Studio toolbar.
- [x] Make the Video Studio layout properly full width on desktop.
- [x] Replace nested card/accordion feel with a single editor workspace.
- [x] Move the old `MediaAssetHarness` content out of the bottom accordion and into proper prepare/activity panels.
- [x] Make the sidebar Creative link clearly open the AV Video Studio project list.
- [x] Add clearer empty states for new AV projects.

## Phase 2: Unified Layout

- [x] Define final workspace layout: `Library | Preview + Prepare | Producer`, with timeline underneath.
- [x] Make Library rail resizable or wider on large screens.
- [x] Make Producer rail collapsible.
- [x] Keep timeline always visible on desktop.
- [x] Add responsive tablet/mobile stacking.
- [x] Add a selected asset state that drives the center panel.
- [x] Add a selected clip state that drives timeline clip controls.

## Phase 3: Library Rail

- [x] Replace compact select-heavy filters with scan-friendly controls.
- [x] Add asset type filter chips: footage, still, generated, derivative, voiceover, music, overlay, caption.
- [x] Add source filters: upload, generation, Audio Studio, Banner Studio, render, derivative.
- [x] Add status filters: ready, queued, running, failed, blocked.
- [x] Add model/provider filter.
- [x] Add aspect ratio filter.
- [x] Add bucket/group filter.
- [x] Add search across title, prompt, filename, transcript, model, format.
- [x] Add sort: newest, oldest, duration, status.
- [x] Show thumbnails/previews for video and image assets.
- [x] Show playable previews for audio.
- [x] Add inline actions per asset: preview, add to timeline, generate from this, publish, inspect.
- [x] Hide empty bucket noise by default.
- [ ] Consider backend `GET /api/agency/video/projects/:id/studio-assets` aggregation endpoint if frontend aggregation gets brittle.

Decision: Library source filters now include rendered exports as a first-class source. Saved render assets are normalized as `render` when they come from a media render job, while Cloudflare AI Gateway outputs remain under `generation`; the filter rows wrap into stable scan-friendly grids instead of clipping source chips.

## Phase 4: Preview + Prepare Panel

- [x] Show selected library asset preview, not just timeline preview.
- [x] Add selected asset metadata: source, model, prompt, duration, aspect, status.
- [x] Add `Add to timeline` from selected asset.
- [x] Add `Generate from selected still/image`.
- [x] Add derivative preview support.
- [x] Move mask/lift/background/erase tools into this panel.
- [x] Show asset intelligence activity for selected asset.
- [x] Show failed/blocked AI job messages in-context.
- [x] Keep server render as source of truth, with preview labelled as assembly preview.

## Phase 5: AI Video Generation

- [x] Embed AI generation in the workbench instead of relying only on a slideover.
- [x] Keep Cloudflare AI Gateway as the only active real provider.
- [x] Keep MuAPI dormant/non-selectable.
- [x] Surface selectable models only.
- [x] Add model capability hints: image-to-video, duration, aspect, source required.
- [x] Add prompt templates for agency workflows.
- [x] Add regenerate from prior job.
- [x] Add generate from timeline still.
- [x] Add active job recovery after refresh.
- [x] Add failed job retry/prefill.
- [x] Add output asset inspection.
- [x] Add generated clip duplicate/reuse prompt actions.

## Phase 6: Voiceover

- [x] Keep voice generation inside Video Studio.
- [x] Add script field connected to producer brief.
- [x] Add generated voice preview before timeline insertion.
- [x] Add voiceover lane insertion.
- [x] Add voiceover asset reuse from library.
- [x] Show voice guard/policy violations clearly.
- [x] Add voice duration estimate or post-generation duration display.
- [x] Add `Replace existing voiceover` action.

## Phase 7: Overlays

- [x] Keep Banner Studio overlay path as authoritative short-term.
- [x] Improve overlay picker inside Video Studio.
- [x] Add overlay preview thumbnail or format preview.
- [x] Add overlay lane insertion with duration/start controls.
- [x] Add `Replace selected overlay` action.
- [x] Spike inline overlay templates: title card, lower third, offer card, CTA, caption-safe title.
- [x] Decide whether inline templates become Banner Studio projects or a new overlay subtype.

Decision: inline overlay templates should create or reuse Banner Studio projects before timeline insertion; do not introduce a second overlay subtype until Banner Studio cannot cover the workflow.

## Phase 8: Captions

- [x] Keep existing caption VTT visibility/filtering.
- [x] Add `Generate captions` action using Workers AI Whisper.
- [x] Generate captions from uploaded/generated video.
- [x] Generate captions from voiceover asset.
- [x] Store generated VTT against video asset or caption asset.
- [x] Add caption preview/download.
- [x] Add captions as overlay/render input.
- [x] Add caption style presets later: platform default, bold social, subtitle-safe.

Decision: first caption pass stores a single-cue VTT plus transcript on `video_assets`; caption clips now burn transcript text into the composite render with a default FFmpeg text style. Segmented VTT parsing and richer style presets remain follow-up work.

Decision: caption clips now expose three burn-in presets from the selected clip inspector. `platform_default`, `bold_social`, and `subtitle_safe` save through the existing undo/autosave edit flow and map to distinct FFmpeg drawtext size, box, border, and safe-margin settings in both the Nitro renderer and audio-jobs container renderer.

## Phase 9: AI Producer

- [x] Redesign Producer rail as guided command surface.
- [x] Sections: brief, format, script, voice, overlays, captions, draft plan, render.
- [x] Make selected asset influence producer brief/plan.
- [x] Add recipe selection: dealer promo, product reveal, offer ad, testimonial, event recap.
- [x] Build draft timeline plan.
- [x] Apply visual plan to timeline.
- [x] Extend plan to include voiceover placement.
- [x] Extend plan to include overlay placement.
- [x] Extend plan to include caption requirement.
- [x] Add plan validation before applying.
- [x] Add `Undo applied plan` or checkpoint prompt.

Decision: producer apply is now guarded by a reusable plan validator. It only applies timeline-ready visual clips, explains skipped draft steps, and tells the user to use the editor Undo control after inserts instead of creating a separate producer-local rollback path.

Decision: assembly plans now append explicit review-only `place-voiceover`, `place-overlay`, and `create-caption` steps when the brief or selected asset calls for them. Visual `place-asset` steps remain the only auto-applied plan steps until lane-specific apply controls are added.

## Phase 10: Timeline Editing

- [x] Keep current video/overlay/voice/music lanes.
- [x] Improve clip selection affordance.
- [x] Add clip inspector panel.
- [x] Add selected clip replace action.
- [x] Add split/delete/trim discoverability.
- [x] Improve effect controls for selected video clips.
- [x] Add per-clip effect preview clarity.
- [x] Add fit/fill/crop controls for video/still clips.
- [x] Add timeline zoom polish.
- [x] Add keyboard shortcut help.

Decision: selected clips now show a compact inspector below the timeline with track, timing, source, effects/style details, and explicit Split/Delete actions. Split is only enabled for audio clips because the current editor slice action is audio-only; trim discoverability and video/overlay/caption split remain future work.

Decision: selected library assets can now replace compatible selected timeline clips from the selected asset panel. Video/generated/derivative assets replace video clips, audio assets replace audio clips, Banner Studio assets replace overlays, and captioned assets replace caption clips while preserving the selected clip start time.

Decision: timeline controls now explain selected-clip actions inline, make trim handles visibly draggable, improve selected/hover clip affordance, and only enable Split when the active clip is audio to match the current editor capability.

Decision: selected video effects now render as switch-like cards with active state, effect hints, selected-effect summary, previewed/render-only badges, and a clearer note that the editor preview is approximate while server render remains authoritative.

Decision: video clips now support an optional `fit` framing field (`fit`, `fill`, `crop`) with renderer fallbacks that preserve legacy footage/still behavior. The selected clip panel exposes framing as a segmented control that saves through the same undo/autosave path as effects.

Decision: timeline zoom math is now shared and unit-tested. The timeline toolbar shows current pixels-per-second, explicit zoom in/out controls, fit-to-window, and a shortcut help panel available from the toolbar or `?`; the Video Studio route imports its media workspace components explicitly so local dev renders without unresolved-component warnings.

## Phase 11: Render + Distribution

- [x] Add render format selector in the workbench.
- [x] Show render queue state near timeline.
- [x] Show completed renders with direct download.
- [x] Save render to video library.
- [x] Send render to client portal.
- [x] Publish render to social composer.
- [x] Generate social caption from rendered video/brief.
- [x] Add render failure details.
- [x] Add retry render action.
- [x] Confirm overlay resolution works per format.
- [x] Fix known limitation: mixed-aspect multi-format overlay resolution currently reuses first overlay aspect.

Decision: render format selection now lives in the always-visible Video Studio workbench header beside the primary Render action. The selector uses the backend-supported format keys (`reels_9x16`, `square_1x1`, `youtube_16x9`) and passes only the selected formats into the existing render-video endpoint; the render jobs rail remains focused on queue history and completed-render actions.

Decision: a compact render queue strip now sits directly above the timeline for AV projects. It summarizes queued/rendering/completed/failed jobs and exposes direct download buttons for the latest completed render variants, while the Producer rail keeps the fuller publish/portal/library actions.

Decision: failed render jobs now show full failure details in the Producer render panel instead of a clipped error line. Failed jobs also expose a Retry action that queues a fresh render through the existing render flow, using the current default render format behavior rather than adding a second backend retry endpoint.

Decision: mixed-aspect render requests now resolve Banner Studio overlay HTML separately for each requested output format. The Pages producer enqueues `resolvedOverlaysByFormat`, keyed by render format, while the video render worker keeps the legacy `resolvedOverlays` fallback for older queue messages already in flight.

Decision: completed render variants now have focused server coverage for save-to-library, client-portal review creation, and social composer draft creation. Social drafts use the stable signed public render URL and pass the project title into the AI caption generator so the generated caption is project-specific instead of format-only.

## Phase 12: QA + Reliability

- [ ] Manual QA: create AV project.
- [ ] Manual QA: upload footage/still.
- [ ] Manual QA: generate AI video.
- [ ] Manual QA: add generated video to timeline.
- [ ] Manual QA: generate voiceover.
- [ ] Manual QA: add Banner overlay.
- [ ] Manual QA: build/apply producer plan.
- [ ] Manual QA: render video.
- [ ] Manual QA: save render as asset.
- [ ] Manual QA: send render to portal.
- [ ] Manual QA: publish to social composer.
- [ ] Manual QA: reload page with active jobs.
- [x] Manual QA: audio project behavior unchanged.
- [x] Add component tests for layout/filter interactions.
- [x] Add tests for selected asset prepare actions.
- [x] Add tests for producer plan with voice/overlay once implemented.
- [x] Run focused video/audio test suite.
- [x] Run production build.
- [x] Deploy and verify production feature flags.

Decision: Phase 12 component coverage now includes runtime interaction tests for Library filtering/search/action emits, Workbench toolbar/render/collapse emits, and Selected Asset prepare actions including add, replace, generate-from-asset, caption generation, and add-caption flows. Producer rail tests already cover voice/overlay/caption draft-plan validation states.

Decision: focused Video Studio/audio QA suite passed on 2026-06-19 with 19 files and 101 tests covering workbench, library, selected asset, producer, voice, overlay, render jobs, timeline edit/render, distribution, clip inspector/effects, timeline placement, video library insertion, and social draft creation. Production `pnpm run build` also passed; warnings remain the known local `JWT_SECRET`, third-party ESM top-level `this`, VueUse annotation, and large chunk warnings.

Decision: production feature flags were verified on 2026-06-19 after adding the missing Cloudflare Pages production secret `VIDEO_GENERATION_TEST_TENANT_ID=agency` and deploying `c36f979b.agency-dashboard-6cm.pages.dev`. The custom domain `/agency/audio/projects?mediaType=av` returned 200, the logged-in model endpoint for AV project `bfa93ac8-fc95-412c-bae4-81307cb7ede4` returned enabled policy plus three tenant-facing Cloudflare AI Gateway models (`aigateway/seedance-i2v`, `aigateway/wan-i2v`, `aigateway/hailuo-i2v`), and the Video Studio UI showed generation templates instead of the no-models warning. Regular Audio Studio behavior was smoke-tested by opening `/agency/audio/projects`, then opening existing audio project `d7923bf6-6e0b-44f3-8db1-aa5d00bb2de4`, which loaded the non-AV Timeline editor with voiceover/music lanes.

Decision: live-cost or live-write manual QA rows remain unchecked unless performed deliberately in production or against a dedicated test tenant. Existing production data shows generated video, voiceover, overlay options, and completed render jobs, but that is not equivalent to executing fresh generation, render, portal, library-save, or social-publish actions during this QA pass.

## Suggested First Sprint

1. UI cleanup and full-width layout.
2. Library filter redesign.
3. Move old AI Producer/harness out of accordion into proper panels.
4. Selected asset preview/prep panel.
5. Manual QA pass on current flow.
