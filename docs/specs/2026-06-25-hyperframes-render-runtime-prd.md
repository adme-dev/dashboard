# Hyperframes-Inspired Render Runtime PRD

**Date:** 2026-06-25
**Status:** Draft PRD
**Owner:** Product/Engineering
**Feature area:** Creative > Banner Studio, Creative > Video Studio
**References:**
- https://github.com/heygen-com/hyperframes
- https://github.com/palmier-io/palmier-pro
**Related docs:**
- `docs/banner-studio/PRD-banner-studio-pro.md`
- `docs/specs/2026-06-19-video-studio-enterprise-redesign-prd.md`
- `docs/superpowers/plans/2026-06-22-banner-render-async-pipeline.md`
- `docs/superpowers/specs/2026-06-18-video-studio-unified-producer-prd.md`

## Objective

Improve Banner Studio and Video Studio render reliability by adopting selected Hyperframes techniques: a formal browser composition runtime contract, seekable animation adapters, pre-render linting, deterministic frame timing, and better render diagnostics.

Add a related Video Studio agent-control track inspired by Palmier Pro: agent-readable timeline/media context, stable clip/range references, inspection tools, and undoable timeline mutations. Hyperframes informs how we render HTML/video reliably. Palmier informs how agents should safely understand and edit a video timeline.

This is not a proposal to replace our studios with Hyperframes or Palmier. The target is to preserve our existing Nuxt/Cloudflare/Banner Studio/Video Studio architecture while borrowing proven patterns at the product/API level.

Success means Banner Studio MP4 exports and Video Studio banner-overlay renders are easier to validate, easier to debug, and more deterministic across preview, container render, and final FFmpeg output.

## Background

Hyperframes' core model overlaps with our render path:

- Author video/compositions as HTML/CSS/media.
- Drive seekable animations frame by frame.
- Capture browser frames in headless Chrome.
- Encode/mix via FFmpeg.
- Provide agent-friendly validation and diagnostics around that workflow.

Our platform already does a smaller version of this:

- `server/utils/banner/htmlBuilder.ts` builds Banner Studio HTML from layer state.
- `workers/audio-jobs/container/bannerCapture.mjs` opens the HTML in Chromium, seeks GSAP, screenshots frames, and encodes MP4.
- `workers/audio-jobs/container/videoCompositeGraph.mjs` composites video, captions, and overlay image sequences with FFmpeg.
- Video Studio treats Banner Studio overlays as timeline-ready overlay clips.

The gap is that our browser composition contract is implicit. Render code reaches directly into GSAP globals, FPS is numeric, validation is distributed across endpoints, and render failures often lack actionable browser diagnostics.

Palmier Pro complements this from the editor side. It exposes a video editor through an MCP-style tool surface, uses project-frame timeline semantics, gives agents explicit media/timeline inspection tools, supports stable `@mention` context for assets/clips/ranges, and treats edits as validated, undoable mutations. Those ideas map well to our Video Studio producer and task-assist rails, but must be adopted as product patterns only because Palmier Pro is GPL-3.0 licensed.

## Product Goals

1. **Make browser-rendered creative deterministic**
   Banner and overlay renders should expose a stable runtime API that works the same in preview, export, and render containers.

2. **Fail before expensive render work**
   Missing media, invalid timing, unsafe font/media URLs, empty timelines, unsupported animation states, and oversized compositions should be caught before queue/container execution where practical.

3. **Improve render debugging**
   Failed jobs should include sanitized browser console, request, navigation, readiness, seek, and FFmpeg diagnostics.

4. **Preserve current studios**
   Banner Studio remains the authoring source for banners and overlays. Video Studio remains the AV timeline, producer, and final render surface.

5. **Keep Cloudflare-first deployment**
   The implementation must fit the existing Cloudflare Pages, Workers, Queues, R2, and container render rails.

## Non-Goals

- Replace Banner Studio with Hyperframes Studio.
- Replace Video Studio's AV timeline engine.
- Adopt Hyperframes' full monorepo, CLI, AWS Lambda renderer, or React studio UI.
- Copy Palmier Pro source code or import GPL-3.0 implementation into this repository.
- Replace our web-based Video Studio with a native macOS editing app model.
- Expose a local loopback MCP server from the browser app.
- Add a new external render SaaS dependency.
- Remove existing FFmpeg composite graph or audio render rails.
- Support every Hyperframes feature such as HDR, shader transitions, distributed rendering, or catalog blocks in the first slice.
- Change model governance, AI Gateway policy, or tenant safety controls.

## Users

### Agency Operator

Needs exports and client-ready videos to render predictably without having to understand browser/FFmpeg internals.

### Creative Lead

Needs confidence that previewed animation and final render match closely enough for review and approval.

### Engineer / Support Operator

Needs render failures to explain whether the issue was invalid creative, unreachable media, browser failure, queue/container failure, or FFmpeg failure.

## Current State

### Banner Studio

- HTML is generated from structured layer state.
- GSAP animation is generated inline.
- MP4 capture currently seeks the first GSAP global timeline child and screenshots each frame.
- Duration is inferred from GSAP duration with a fallback.
- FPS is passed as a numeric value into frame stepping and FFmpeg args.
- Export-time validation exists in pieces, but there is no dedicated composition linter.

### Video Studio

- Video timeline supports video, overlay, voiceover, music, and captions.
- Banner overlays are rendered to transparent frame sequences and composited into final video.
- The server FFmpeg render remains the authoritative final output.
- The current Video Studio PRD explicitly avoids replacing the AV timeline or building a frame-perfect browser compositor as the first priority.

## Hyperframes Techniques To Adopt

### 1. Runtime Composition Contract

Introduce a page-side runtime contract for generated Banner Studio HTML:

```ts
type EngagrFrameRuntime = {
  ready: boolean
  duration: number
  fps?: { num: number, den: number }
  seek: (timeSeconds: number) => void | Promise<void>
  getDiagnostics?: () => Record<string, unknown>
  getVisibleElements?: () => Array<{ id: string, type?: string, start?: number, end?: number }>
}
```

Generated HTML should expose this as `window.__engagrFrame`.

Render code should prefer this protocol and fall back to the current GSAP probing path only for legacy exports.

### 2. Seekable Animation Adapters

Add adapter helpers for GSAP-backed compositions:

- Pause timeline before seeking.
- Use `totalDuration()` when available, not only `duration()`.
- Seek by frame-derived time.
- Avoid returning timeline objects through `page.evaluate`.
- Keep video/audio element time sync in the adapter instead of scattered inline snippets where possible.

### 3. Exact FPS Handling

Represent FPS internally as a rational object:

```ts
type RenderFps = { num: number, den: number }
```

Use helpers to:

- Parse integer FPS and exact rational strings such as `30000/1001`.
- Reject ambiguous decimals in new APIs.
- Emit FFmpeg args as `30` or `30000/1001`.
- Convert to number only for frame arithmetic.

For first implementation, existing numeric UI inputs can map to `{ num: fps, den: 1 }`.

### 4. Pre-Render Composition Linting

Add a lightweight internal linter for Banner Studio and overlay HTML.

Initial rules:

- Composition exposes `window.__engagrFrame` or a recognized legacy GSAP timeline.
- Duration is finite, positive, and within export caps.
- Width, height, FPS, quality, and frame caps are valid.
- Media `src` values are safe and non-empty.
- Remote HTTP(S) media URLs are optionally HEAD-checkable from server context.
- Font URLs are safe and use supported formats.
- Layer IDs are unique enough for runtime seeking and diagnostics.
- Video/audio layers have usable timing windows.
- Captions/text overlays are not empty where required.

Lint findings should be structured:

```ts
type RenderLintFinding = {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  elementId?: string
  fixHint?: string
}
```

Errors block enqueue. Warnings are surfaced in job diagnostics and UI where useful.

### 5. Browser Capture Diagnostics

Capture sessions should retain a bounded browser diagnostic buffer:

- Navigation start/failure.
- Console errors/warnings.
- Failed requests and HTTP 4xx/5xx assets.
- Runtime readiness timeout.
- Seek failures.
- Screenshot failures.
- Chromium version and render mode.

Diagnostics must sanitize URLs by stripping query strings, hashes, credentials, data URLs, and blob URLs.

### 6. Render Error Classification

Distinguish:

- `invalid_composition`
- `unreachable_media`
- `runtime_not_ready`
- `seek_failed`
- `browser_transient`
- `browser_crash`
- `ffmpeg_failed`
- `container_timeout`

This should improve retry behavior and support messaging. Transient browser failures can be retried; invalid composition failures should not loop indefinitely.

### 7. Optional Static Frame Dedup

Later phase only. Hyperframes predicts static frame runs and reuses verified frame buffers. This could reduce render time for banners with long static holds, but it should not land until the runtime contract and diagnostics are stable.

## Palmier Pro Techniques To Adapt

### 1. Agent-Readable Timeline Context

Add a compact, stable Video Studio context format for agents:

- Project FPS, resolution, total frames, and current selection.
- Track list with stable track IDs and layer order.
- Clip list with stable clip IDs, media refs, start frame, duration, trims, speed, opacity, volume, transforms, captions, and linked audio/video relationships.
- Optional windowing by `startFrame`/`endFrame` for large timelines.

All agent-facing frame ranges should be explicit as start-inclusive/end-exclusive project frames.

### 2. Mentioned Assets, Clips, And Ranges

Support `@asset`, `@clip`, and `@range` context in Video Studio task-assist flows. Mentioned context should serialize stable IDs and normalized metadata so the assistant can act on exactly what the user selected instead of re-inferring intent from prose.

For media attachments, the assistant context should distinguish successfully attached media from failed attachments and avoid pretending failed media was inspected.

### 3. Timeline Inspection Tools

Expose inspection tools for the agent rail:

- `get_video_timeline`: compact current project state.
- `get_video_media`: media library assets and generation/import status.
- `inspect_video_media`: sampled frames, transcript, dimensions, duration, and metadata for one asset.
- `inspect_video_timeline`: composited preview frames from project-frame positions.
- `get_video_transcript`: post-edit timeline transcript mapped to project frames.
- `search_video_media`: visual/spoken search over indexed assets where available.

These should be internal server/tool-loop capabilities first, not public API commitments.

### 4. Storyboard Overview For Long Video Assets

Add a lightweight storyboard/contact-sheet overview for long video assets: sample visually distinct frames, burn timestamps, and return one compact image plus frame/time metadata. This helps agents and users reason about footage without loading many separate frames.

Implementation should use our existing container/FFmpeg or asset-intelligence rail rather than Palmier's AVFoundation implementation.

### 5. Validated Undoable Mutations

Agent-driven timeline edits should be validated upfront and applied as single undoable batches:

- Add/insert clips.
- Move clips.
- Split clips.
- Ripple-delete ranges.
- Set clip properties.
- Set keyframes.
- Add text/captions.
- Apply color/effect presets.

One invalid entry should reject the whole batch. This reduces partial timeline corruption and makes agent edits reviewable.

### 6. Model Catalog Resources

Expose generation model capabilities to the agent rail as structured resources, aligned with our existing model registry and policy controls. The agent should know what video/image/audio generation models are available, disabled, or tenant-restricted before attempting generation.

## User Experience Requirements

### Banner Studio

- Existing export modals and async render polling should remain familiar.
- If a render is blocked by validation, show actionable copy tied to the invalid layer, media asset, or format.
- If render fails after enqueue, show a concise failure category and a details expander for diagnostics.
- Existing PNG/JPG/GIF export should not change unless explicitly included in a later task.

### Video Studio

- Overlay composition validation should happen before adding or rendering overlay clips where practical.
- Render job failures should make clear whether the base video timeline or the Banner overlay caused the failure.
- Preview behavior should not be reworked in the first slice unless needed to use the same runtime protocol.
- Task-assist and producer flows should reference selected clips/assets/ranges through stable IDs and project-frame ranges.
- Agent-applied edits should be previewable, undoable, and rejected atomically on validation errors.

## Technical Approach

### Runtime Generation

Update `server/utils/banner/htmlBuilder.ts` and the matching client builder to inject a small runtime script.

The runtime wraps the generated GSAP timeline and media sync behavior. It is intentionally small and owned by our codebase.

### Capture Container

Update `workers/audio-jobs/container/bannerCapture.mjs` to:

1. Wait for `window.__engagrFrame.ready === true`.
2. Read `duration` from `window.__engagrFrame.duration`.
3. Seek through `window.__engagrFrame.seek(t)`.
4. Fall back to legacy GSAP probing for older HTML.
5. Collect browser diagnostics and return them to the worker alongside failures.

### Server/Worker Boundaries

- Server-side linter should run before enqueueing Banner Studio MP4 jobs.
- Worker/container linter or runtime readiness checks should still run defensively.
- Do not put database credentials inside the render container.
- Worker remains responsible for R2/DB persistence and job status updates.

### Video Studio Agent Boundary

Palmier's local MCP server pattern should translate into our existing server-side agent/tool-loop architecture. Do not expose a browser-local MCP server. Instead, add first-party Video Studio tools behind tenant auth, project permissions, existing model policy checks, and audit logging.

### Testing Strategy

Unit tests:

- FPS parsing/formatting.
- Runtime script generation.
- Linter rules.
- Diagnostic sanitization.
- Error classification.
- Legacy GSAP fallback behavior.

Integration tests:

- Generated banner HTML exposes runtime contract.
- Capture container can seek a sample composition through the runtime.
- Invalid media blocks enqueue.
- Legacy HTML still renders through fallback.

Manual/browser checks:

- Banner MP4 export with text/image/video/audio layers.
- Video Studio project with Banner overlay render.
- Failed remote media URL shows useful error.

## Commands

- Unit tests: `pnpm exec vitest run test/banner`
- Video tests: `pnpm exec vitest run test/video test/components/videoStudioRenderJobsPanel.test.ts`
- Typecheck: `pnpm run typecheck`
- Build: `pnpm run build`
- Worker/container-specific tests: use existing `workers/audio-jobs` test commands where available.

## Boundaries

### Always

- Preserve existing Banner Studio and Video Studio public workflows.
- Keep render containers stateless.
- Keep R2/DB persistence in workers/server code.
- Add tests for new pure helpers and validation logic.
- Sanitize diagnostics before storing or surfacing them.

### Ask First

- Adding Hyperframes as a dependency.
- Adding Palmier Pro as a dependency or copying any GPL-3.0 implementation.
- Adding a new browser/render dependency.
- Changing Cloudflare queue/container topology.
- Changing Video Studio's timeline schema.
- Making BeginFrame the only capture path.
- Exposing Video Studio editing tools to third-party MCP clients.

### Never

- Copy Hyperframes wholesale into the repository.
- Copy Palmier Pro source code into the repository.
- Store secrets or signed URLs in diagnostics.
- Retry invalid compositions indefinitely.
- Remove legacy render fallback in the first slice.
- Replace server FFmpeg final render authority with browser preview output.

## Success Criteria

- Generated Banner Studio export HTML exposes `window.__engagrFrame`.
- Banner MP4 render uses the runtime contract when present.
- Legacy GSAP render path remains available.
- Pre-render linter blocks at least invalid duration, missing media, unsafe media URL, and oversized format cases.
- Failed render jobs include a structured failure category and sanitized diagnostics.
- Existing Banner async MP4 tests continue passing.
- Existing Video Studio render/composite tests continue passing.
- Video Studio follow-up tasks are defined for agent-readable timeline context, media/timeline inspection, storyboard overview, and undoable timeline mutations.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Runtime contract diverges from preview behavior | High | Generate runtime from the same builder used by server/client export paths; add parity tests. |
| Validation blocks legitimate legacy creative | Medium | Ship linter in warning mode for legacy fallback except clear hard failures. |
| Browser diagnostics leak sensitive URLs | High | Centralize diagnostic sanitization and test query/hash/data/blob redaction. |
| BeginFrame is not available in Cloudflare container | Medium | Keep screenshot capture as default; evaluate BeginFrame separately. |
| Static dedup creates frame drift | Medium | Defer until runtime and visual regression checks exist. |

## Open Questions

- Should first-slice lint findings be shown in the Banner export modal before enqueue, or only surfaced after failed enqueue responses?
- Should Video Studio overlay validation run when adding the overlay clip, when rendering, or both?
- Do we want to support exact fractional FPS in UI now, or only prepare the internal type and helpers?
- Should diagnostics be stored in `banner_render_jobs.error` as text, a new JSON column, or a separate render diagnostics table?
