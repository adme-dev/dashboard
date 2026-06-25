# Implementation Plan: Hyperframes-Inspired Render Runtime

**Status:** Draft task plan - 2026-06-25
**PRD:** `docs/specs/2026-06-25-hyperframes-render-runtime-prd.md`
**Goal:** Adopt selected Hyperframes rendering techniques for Banner Studio and Video Studio without replacing the existing studios or render rails. Capture Palmier Pro-inspired Video Studio agent-control tasks as a follow-up track for timeline/media context, inspection, and undoable edits.

> **For agentic workers:** implement task-by-task. Keep each task independently verifiable and do not remove the legacy GSAP render fallback until a later approved migration.

## Architecture Decisions

- **Own the runtime contract locally.** Do not add Hyperframes as a dependency in the first slice.
- **Use Banner Studio as the first adoption point.** Banner HTML already has the tightest overlap with Hyperframes' HTML-to-video model.
- **Preserve render rail boundaries.** The render container remains stateless; workers/server own R2, queues, DB, and job state.
- **Prefer compatibility first.** Runtime contract is primary for new HTML, legacy GSAP probing remains fallback.
- **Defer BeginFrame and static-frame dedup.** They are valuable but riskier than contract, lint, and diagnostics.
- **Treat Palmier Pro as product/API research only.** It is GPL-3.0; do not copy implementation code or add it as a dependency unless a separate licensing decision is made.
- **Keep agent control server-side.** Palmier exposes a local MCP server for a native app. Our equivalent should be first-party server/tool-loop capabilities protected by tenant auth, project permissions, model policy, and audit logging.

## Phase 1: Runtime Contract Foundation

### Task 1: Add frame runtime types and FPS helpers

**Description:** Define the internal runtime contract types and exact FPS helpers used by Banner Studio and render workers.

**Acceptance criteria:**

- [ ] `RenderFps` supports integer FPS and exact rationals.
- [ ] Helpers parse integer input, format FFmpeg args, and convert to number for frame math.
- [ ] Runtime contract type documents `ready`, `duration`, `seek`, and diagnostics fields.
- [ ] Existing numeric FPS behavior is preserved for current callers.

**Verification:**

- [ ] `pnpm exec vitest run test/banner/renderRuntime.test.ts`
- [ ] `pnpm run typecheck`

**Dependencies:** None.

**Files likely touched:**

- `server/utils/banner/renderRuntime.ts`
- `test/banner/renderRuntime.test.ts`
- Potential shared type location if existing import boundaries require it.

**Estimated scope:** Small.

### Task 2: Inject `window.__engagrFrame` into generated banner HTML

**Description:** Update server and client Banner HTML builders so exported HTML exposes a stable runtime wrapper around the generated GSAP timeline.

**Acceptance criteria:**

- [ ] New exports expose `window.__engagrFrame.ready === true` after initialization.
- [ ] Runtime duration uses GSAP `totalDuration()` when available, then `duration()`, then a safe fallback.
- [ ] Runtime `seek(t)` pauses/seeks the timeline and keeps media layers in sync.
- [ ] Existing generated animation behavior remains unchanged visually.

**Verification:**

- [ ] `pnpm exec vitest run test/banner/serverHtmlBuilderParity.test.ts test/banner/renderJob.test.ts`
- [ ] Add/update a runtime contract assertion test.

**Dependencies:** Task 1.

**Files likely touched:**

- `server/utils/banner/htmlBuilder.ts`
- `app/utils/banner-html-builder.ts`
- `test/banner/serverHtmlBuilderParity.test.ts`
- `test/banner/renderRuntime.test.ts`

**Estimated scope:** Medium.

### Checkpoint: Runtime Contract

- [ ] Server/client HTML builders remain in parity.
- [ ] Generated HTML contains the runtime contract.
- [ ] No render container behavior has changed yet.

## Phase 2: Capture Path Integration

### Task 3: Update banner capture to prefer the runtime contract

**Description:** Change the container capture loop to wait for and use `window.__engagrFrame` when available, with legacy GSAP fallback retained.

**Acceptance criteria:**

- [ ] Capture waits for runtime readiness before reading duration.
- [ ] Capture seeks through runtime `seek(t)` for new HTML.
- [ ] Legacy HTML without runtime still renders via existing GSAP probing.
- [ ] Runtime duration is capped by existing export caps.
- [ ] Frame count and FFmpeg args still honor existing caps and defaults.

**Verification:**

- [ ] `pnpm exec vitest run test/banner/bannerRenderWorker.test.ts`
- [ ] Existing render job tests still pass.
- [ ] Manual or container smoke test with one generated Banner Studio MP4 if environment is available.

**Dependencies:** Task 2.

**Files likely touched:**

- `workers/audio-jobs/container/bannerCapture.mjs`
- `workers/audio-jobs/src/bannerRenderContainer.ts`
- `test/banner/bannerRenderWorker.test.ts`

**Estimated scope:** Medium.

### Task 4: Add structured browser diagnostics

**Description:** Capture bounded browser console/request/navigation/runtime diagnostics during banner capture and return sanitized failure details to the worker.

**Acceptance criteria:**

- [ ] Diagnostics include console errors, failed requests, HTTP error responses, readiness timeout, seek failure, and FFmpeg failure context.
- [ ] URLs are sanitized before persistence/logging.
- [ ] Diagnostics are bounded to prevent large job payloads.
- [ ] Existing successful render output remains unchanged.

**Verification:**

- [ ] `pnpm exec vitest run test/banner/renderDiagnostics.test.ts test/banner/bannerRenderWorker.test.ts`
- [ ] Manual failed-media render shows useful error category without leaking query strings.

**Dependencies:** Task 3.

**Files likely touched:**

- `server/utils/banner/renderDiagnostics.ts`
- `workers/audio-jobs/container/bannerCapture.mjs`
- `workers/audio-jobs/src/bannerRenderWorker.ts`
- `test/banner/renderDiagnostics.test.ts`
- `test/banner/bannerRenderWorker.test.ts`

**Estimated scope:** Medium.

### Checkpoint: Runtime Capture

- [ ] New HTML renders through runtime contract.
- [ ] Legacy fallback still works.
- [ ] Failed captures produce actionable sanitized diagnostics.

## Phase 3: Pre-Render Linting

### Task 5: Add lightweight Banner render linter

**Description:** Implement pure lint helpers for generated banner HTML and render metadata before enqueue/container execution.

**Acceptance criteria:**

- [ ] Linter returns structured findings with code, severity, message, optional element ID, and fix hint.
- [ ] Errors cover invalid duration, invalid dimensions, missing media `src`, unsafe media/font URL, missing runtime/legacy timeline, and oversized format.
- [ ] Warnings cover legacy fallback usage and non-blocking metadata issues.
- [ ] Rules are pure and unit-tested.

**Verification:**

- [ ] `pnpm exec vitest run test/banner/renderLinter.test.ts`
- [ ] `pnpm run typecheck`

**Dependencies:** Task 1.

**Files likely touched:**

- `server/utils/banner/renderLinter.ts`
- `test/banner/renderLinter.test.ts`

**Estimated scope:** Medium.

### Task 6: Block invalid MP4 enqueue with linter findings

**Description:** Run the linter before Banner Studio MP4 enqueue and return structured validation failures to the API/UI.

**Acceptance criteria:**

- [ ] Hard linter errors block enqueue.
- [ ] Warning findings do not block enqueue but are recorded where useful.
- [ ] API responses map findings to actionable user-facing messages.
- [ ] Existing valid MP4 enqueue behavior remains unchanged.

**Verification:**

- [ ] `pnpm exec vitest run test/banner/renderJob.test.ts test/banner/exportPoll.test.ts`
- [ ] Manual: missing media URL blocks before queue execution.

**Dependencies:** Task 5.

**Files likely touched:**

- `server/utils/banner/renderJob.ts`
- `server/api/agency/banner-studio/export-video.post.ts`
- Banner export modal component if surfacing findings immediately.
- `test/banner/renderJob.test.ts`

**Estimated scope:** Medium.

### Checkpoint: Validation

- [ ] Invalid composition cases fail before expensive render work.
- [ ] Valid existing exports still enqueue.
- [ ] UI/API can distinguish errors from warnings.

## Phase 4: Video Studio Overlay Integration

### Task 7: Validate Banner overlays used by Video Studio render

**Description:** Apply runtime/lint checks to Banner overlay HTML before it becomes a Video Studio overlay render input.

**Acceptance criteria:**

- [ ] Video render failures identify overlay composition issues separately from base video timeline issues.
- [ ] Overlay HTML with runtime contract renders normally.
- [ ] Legacy overlays still render through fallback with warning diagnostics.
- [ ] Existing Video Studio composite tests continue passing.

**Verification:**

- [ ] `pnpm exec vitest run test/audio/videoCompositeRenderWorker.test.ts test/audio/bannerOverlay.test.ts`
- [ ] `pnpm exec vitest run test/video/renderJobSummary.test.ts`

**Dependencies:** Tasks 3, 5.

**Files likely touched:**

- `server/utils/audio/bannerOverlay.ts`
- `workers/audio-jobs/src/videoCompositeRender.ts`
- `workers/audio-jobs/src/bannerRenderWorker.ts`
- Relevant audio/video tests.

**Estimated scope:** Medium.

### Task 8: Surface render failure categories in studio UI

**Description:** Show concise render failure categories and diagnostics in Banner Studio and Video Studio render job panels.

**Acceptance criteria:**

- [ ] Failed jobs show category such as invalid composition, unreachable media, runtime not ready, browser transient, or FFmpeg failed.
- [ ] Detail expander shows sanitized diagnostics where available.
- [ ] Retry affordance is only emphasized for retryable/transient categories.
- [ ] Existing job status display remains intact.

**Verification:**

- [ ] `pnpm exec vitest run test/components/videoStudioRenderJobsPanel.test.ts test/components/videoStudioRenderStatusStrip.test.ts`
- [ ] Add/extend Banner export modal test if one exists for errors.

**Dependencies:** Task 4.

**Files likely touched:**

- `app/components/media/VideoStudioRenderJobsPanel.vue`
- `app/components/media/VideoStudioRenderStatusStrip.vue`
- `app/components/banner/CustomBannerExportModal.client.vue`
- `app/utils/video/renderJobSummary.ts`
- Related component tests.

**Estimated scope:** Medium.

### Checkpoint: Studio UX

- [ ] Banner and Video Studio users can understand common render failures.
- [ ] Support/debugging has sanitized browser-level evidence.
- [ ] Retry behavior is more intentional.

## Phase 5: Optional Performance Spike

### Task 9: Evaluate BeginFrame capture and static-frame dedup

**Description:** Run a contained spike comparing current screenshot capture against BeginFrame and verified static-frame reuse for representative banner compositions.

**Acceptance criteria:**

- [ ] Spike documents whether BeginFrame is available in our render container.
- [ ] Spike measures render time and frame parity for at least static, animated, video, and overlay-heavy banners.
- [ ] Static-frame dedup is not enabled by default unless verification proves no drift.
- [ ] Recommendation is written before implementation.

**Verification:**

- [ ] Add a short findings doc under `docs/research/` or update this plan.
- [ ] No production behavior changes without follow-up approval.

**Dependencies:** Runtime and diagnostics checkpoints complete.

**Files likely touched:**

- Spike-only scripts/docs unless follow-up approved.

**Estimated scope:** Small research task.

## Phase 6: Video Studio Agent-Control Follow-Up

### Task 10: Define compact Video Studio agent context

**Description:** Add a stable, compact timeline/media context shape for Video Studio assistant and producer flows, inspired by Palmier's project-frame tool contracts.

**Acceptance criteria:**

- [ ] Context includes project FPS, resolution, total frames, tracks, clips, selected asset/clip/range IDs, and linked audio/video relationships.
- [ ] Timeline ranges are documented as start-inclusive/end-exclusive project frames.
- [ ] Large timelines support `startFrame`/`endFrame` windowing.
- [ ] Context omits default clip fields where safe to reduce token load.
- [ ] The shape is documented as an internal tool-loop contract, not a public API.

**Verification:**

- [ ] `pnpm exec vitest run test/video-studio/agentContext.test.ts`
- [ ] `pnpm run typecheck`

**Dependencies:** Existing Video Studio project/timeline state utilities.

**Files likely touched:**

- `server/utils/video/agentContext.ts`
- `server/utils/ai/mcp/videoRunner.ts`
- `test/video-studio/agentContext.test.ts`

**Estimated scope:** Medium.

### Task 11: Add mentioned asset, clip, and range context

**Description:** Support selected or explicitly mentioned Video Studio assets, clips, and timeline ranges in task-assist prompts and tool calls.

**Acceptance criteria:**

- [ ] Agent context can carry `asset`, `clip`, and `timeline_range` mentions with stable IDs.
- [ ] Media attachments record whether inspection succeeded or failed.
- [ ] Prompt context tells the model not to describe failed attachments as inspected.
- [ ] Mentioned ranges include start frame, end frame, duration frames, FPS, and semantic notes.

**Verification:**

- [ ] `pnpm exec vitest run test/server/api/agencyTaskAssist.test.ts test/video-studio/agentMentions.test.ts`

**Dependencies:** Task 10.

**Files likely touched:**

- `server/api/agency/ai/task-assist.post.ts`
- `server/utils/video/agentMentions.ts`
- `test/video-studio/agentMentions.test.ts`

**Estimated scope:** Medium.

### Task 12: Add Video Studio inspection tools

**Description:** Add internal tool-loop capabilities for timeline/media inspection so agents can verify what they are editing.

**Acceptance criteria:**

- [ ] `get_video_timeline` returns compact project state.
- [ ] `get_video_media` returns media assets and generation/import status.
- [ ] `inspect_video_media` returns sampled frames, transcript, dimensions, duration, and metadata where available.
- [ ] `inspect_video_timeline` returns composited preview frames for requested project frames.
- [ ] `get_video_transcript` returns post-edit transcript mapped to project frames where available.
- [ ] Tools enforce tenant/project authorization.

**Verification:**

- [ ] `pnpm exec vitest run test/ai/toolLoop.test.ts test/video-studio/inspectionTools.test.ts`

**Dependencies:** Task 10.

**Files likely touched:**

- `server/utils/ai/mcp/videoRunner.ts`
- `server/utils/video/inspectionTools.ts`
- `test/video-studio/inspectionTools.test.ts`

**Estimated scope:** Large.

### Task 13: Add video asset storyboard overview

**Description:** Generate a compact storyboard/contact-sheet overview for long video assets using our existing FFmpeg/container or asset-intelligence rail.

**Acceptance criteria:**

- [ ] Overview samples visually distinct frames across a video asset.
- [ ] Output includes one compact JPEG/PNG contact sheet plus timestamp/frame metadata.
- [ ] Near-duplicate frames are reduced enough to avoid wasting agent context.
- [ ] Long assets can be inspected with overview first, then narrowed by frame/time range.
- [ ] Implementation does not copy Palmier's AVFoundation code.

**Verification:**

- [ ] `pnpm exec vitest run test/server/api/videoAssetHarness.test.ts test/video-studio/storyboardOverview.test.ts`

**Dependencies:** Existing asset extraction/intelligence pipeline.

**Files likely touched:**

- `server/api/agency/video/assets/[id]/extract.post.ts`
- `server/utils/video/storyboardOverview.ts`
- `workers/asset-intelligence/src/worker.ts`
- `test/video-studio/storyboardOverview.test.ts`

**Estimated scope:** Medium.

### Task 14: Design undoable agent timeline mutations

**Description:** Specify and implement the first narrow set of validated, undoable agent timeline mutations.

**Acceptance criteria:**

- [ ] Initial tools cover add/insert clips, move clips, split clip, ripple-delete ranges, and set clip properties.
- [ ] A mutation batch validates all entries before applying any state change.
- [ ] One invalid entry rejects the entire batch with structured errors.
- [ ] Applied batches create a single undo step or equivalent revision.
- [ ] Timeline mutation behavior has focused tests for overlap, linked audio, ripple, and frame math.

**Verification:**

- [ ] `pnpm exec vitest run test/video-studio/timelineMutations.test.ts test/ai/toolLoop.test.ts`

**Dependencies:** Tasks 10 and 12.

**Files likely touched:**

- `server/utils/video/timelineMutations.ts`
- `server/utils/ai/mcp/videoRunner.ts`
- `test/video-studio/timelineMutations.test.ts`

**Estimated scope:** Large.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Runtime wrapper changes final animation output | High | Keep generated GSAP unchanged; wrapper only controls seek/readiness; parity tests. |
| Legacy banners fail after capture refactor | High | Keep fallback path and add explicit fallback tests. |
| Linter blocks valid creative | Medium | Start with narrow hard errors and warning mode for uncertain rules. |
| Diagnostics leak sensitive URLs | High | Central sanitizer with tests for credentials, query strings, hashes, data URLs, and blob URLs. |
| Container-specific browser behavior differs locally | Medium | Keep screenshot path default; make BeginFrame a later spike only. |
| GPL-3.0 source contaminates proprietary code | High | Use Palmier only as product/API research; do not copy source or port implementation details. |
| Agent timeline edits corrupt project state | High | Require validate-before-apply batches, undo/revision support, and focused mutation tests before enabling writes. |

## Open Questions

- Should linter warnings be stored with render jobs for observability, or only returned during enqueue?
- Do we need a JSON diagnostics column on `banner_render_jobs`, or should diagnostics stay in the existing text error field initially?
- Should exact rational FPS be exposed in UI or remain internal for now?
- Should overlay validation run when adding an overlay clip, at render time, or both?
- Should Video Studio agent mutation tools be read-only first, then write-enabled behind a feature flag?
- Should storyboard overviews live in the asset-intelligence worker or the audio/video render worker?
