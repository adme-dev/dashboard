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

- [ ] Define final workspace layout: `Library | Preview + Prepare | Producer`, with timeline underneath.
- [ ] Make Library rail resizable or wider on large screens.
- [ ] Make Producer rail collapsible.
- [ ] Keep timeline always visible on desktop.
- [ ] Add responsive tablet/mobile stacking.
- [ ] Add a selected asset state that drives the center panel.
- [ ] Add a selected clip state that drives timeline clip controls.

## Phase 3: Library Rail

- [ ] Replace compact select-heavy filters with scan-friendly controls.
- [ ] Add asset type filter chips: footage, still, generated, derivative, voiceover, music, overlay, caption.
- [ ] Add source filters: upload, generation, Audio Studio, Banner Studio, render, derivative.
- [ ] Add status filters: ready, queued, running, failed, blocked.
- [ ] Add model/provider filter.
- [ ] Add aspect ratio filter.
- [ ] Add bucket/group filter.
- [ ] Add search across title, prompt, filename, transcript, model, format.
- [ ] Add sort: newest, oldest, duration, status.
- [ ] Show thumbnails/previews for video and image assets.
- [ ] Show playable previews for audio.
- [ ] Add inline actions per asset: preview, add to timeline, generate from this, publish, inspect.
- [ ] Hide empty bucket noise by default.
- [ ] Consider backend `GET /api/agency/video/projects/:id/studio-assets` aggregation endpoint if frontend aggregation gets brittle.

## Phase 4: Preview + Prepare Panel

- [ ] Show selected library asset preview, not just timeline preview.
- [ ] Add selected asset metadata: source, model, prompt, duration, aspect, status.
- [ ] Add `Add to timeline` from selected asset.
- [ ] Add `Generate from selected still/image`.
- [ ] Add derivative preview support.
- [ ] Move mask/lift/background/erase tools into this panel.
- [ ] Show asset intelligence activity for selected asset.
- [ ] Show failed/blocked AI job messages in-context.
- [ ] Keep server render as source of truth, with preview labelled as assembly preview.

## Phase 5: AI Video Generation

- [ ] Embed AI generation in the workbench instead of relying only on a slideover.
- [ ] Keep Cloudflare AI Gateway as the only active real provider.
- [ ] Keep MuAPI dormant/non-selectable.
- [ ] Surface selectable models only.
- [ ] Add model capability hints: image-to-video, duration, aspect, source required.
- [ ] Add prompt templates for agency workflows.
- [ ] Add regenerate from prior job.
- [ ] Add generate from timeline still.
- [ ] Add active job recovery after refresh.
- [ ] Add failed job retry/prefill.
- [ ] Add output asset inspection.
- [ ] Add generated clip duplicate/reuse prompt actions.

## Phase 6: Voiceover

- [ ] Keep voice generation inside Video Studio.
- [ ] Add script field connected to producer brief.
- [ ] Add generated voice preview before timeline insertion.
- [ ] Add voiceover lane insertion.
- [ ] Add voiceover asset reuse from library.
- [ ] Show voice guard/policy violations clearly.
- [ ] Add voice duration estimate or post-generation duration display.
- [ ] Add `Replace existing voiceover` action.

## Phase 7: Overlays

- [ ] Keep Banner Studio overlay path as authoritative short-term.
- [ ] Improve overlay picker inside Video Studio.
- [ ] Add overlay preview thumbnail or format preview.
- [ ] Add overlay lane insertion with duration/start controls.
- [ ] Add `Replace selected overlay` action.
- [ ] Spike inline overlay templates: title card, lower third, offer card, CTA, caption-safe title.
- [ ] Decide whether inline templates become Banner Studio projects or a new overlay subtype.

## Phase 8: Captions

- [ ] Keep existing caption VTT visibility/filtering.
- [ ] Add `Generate captions` action using Workers AI Whisper.
- [ ] Generate captions from uploaded/generated video.
- [ ] Generate captions from voiceover asset.
- [ ] Store generated VTT against video asset or caption asset.
- [ ] Add caption preview/download.
- [ ] Add captions as overlay/render input.
- [ ] Add caption style presets later: platform default, bold social, subtitle-safe.

## Phase 9: AI Producer

- [ ] Redesign Producer rail as guided command surface.
- [ ] Sections: brief, format, script, voice, overlays, captions, draft plan, render.
- [ ] Make selected asset influence producer brief/plan.
- [ ] Add recipe selection: dealer promo, product reveal, offer ad, testimonial, event recap.
- [ ] Build draft timeline plan.
- [ ] Apply visual plan to timeline.
- [ ] Extend plan to include voiceover placement.
- [ ] Extend plan to include overlay placement.
- [ ] Extend plan to include caption requirement.
- [ ] Add plan validation before applying.
- [ ] Add `Undo applied plan` or checkpoint prompt.

## Phase 10: Timeline Editing

- [ ] Keep current video/overlay/voice/music lanes.
- [ ] Improve clip selection affordance.
- [ ] Add clip inspector panel.
- [ ] Add selected clip replace action.
- [ ] Add split/delete/trim discoverability.
- [ ] Improve effect controls for selected video clips.
- [ ] Add per-clip effect preview clarity.
- [ ] Add fit/fill/crop controls for video/still clips.
- [ ] Add timeline zoom polish.
- [ ] Add keyboard shortcut help.

## Phase 11: Render + Distribution

- [ ] Add render format selector in the workbench.
- [ ] Show render queue state near timeline.
- [ ] Show completed renders with direct download.
- [ ] Save render to video library.
- [ ] Send render to client portal.
- [ ] Publish render to social composer.
- [ ] Generate social caption from rendered video/brief.
- [ ] Add render failure details.
- [ ] Add retry render action.
- [ ] Confirm overlay resolution works per format.
- [ ] Fix known limitation: mixed-aspect multi-format overlay resolution currently reuses first overlay aspect.

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
- [ ] Manual QA: audio project behavior unchanged.
- [ ] Add component tests for layout/filter interactions.
- [ ] Add tests for selected asset prepare actions.
- [ ] Add tests for producer plan with voice/overlay once implemented.
- [ ] Run focused video/audio test suite.
- [ ] Run production build.
- [ ] Deploy and verify production feature flags.

## Suggested First Sprint

1. UI cleanup and full-width layout.
2. Library filter redesign.
3. Move old AI Producer/harness out of accordion into proper panels.
4. Selected asset preview/prep panel.
5. Manual QA pass on current flow.
