# Video V1.2a — Render rails + base/audio composite design

**Status:** Draft for review — 2026-06-09
**Slice:** V1.2a of the Video V1 roadmap (`docs/engagr-ai-media-studio-video-v1-roadmap.md`). The render spine, split: **V1.2a = rails + base/audio** (this doc); **V1.2b = overlay integration** (next, separate spec).
**Goal:** an AV timeline's **base layer (footage + `still_kenburns`) + audio bed** renders to an MP4 in R2, on a real `video-render` Queue + Container + endpoint, over the existing **audio-jobs** rails — deterministically, with status in `media_render_jobs`. Overlay tracks are ignored in V1.2a (V1.2b adds them). Flag-gated, dormant.
**Builds on:** the V1.1 AV schema (`schema_version 2`), the composite-render spike (proved ffmpeg composite + cost), and the SP1 audio render spine (mirrored below).

---

## 1. What's reused vs new (from the SP1 map)

**Reused as-is (media-agnostic):**
- `media_render_jobs` table + the gateway render-job fns (`createRenderJob`, `markRenderJobRendering/Done/Failed`, `listRenderJobs`) — `channels` carries our **format keys**, `variants` JSONB carries format→R2 key.
- The worker DI orchestration pattern (`runTimelineRenderJob` + injected deps), the container-call shape (worker pulls R2 sources → base64 → POST to a stateless container → bytes back → worker uploads to R2), the `.mjs`-port + sync-test discipline, and the `RenderContainer` (ffmpeg already baked — **no Chromium needed in V1.2a** since there's no overlay).

**New in V1.2a:**
- Pure `videoCompositeGraph.ts` (+ `.mjs` port + sync test) — the AV composite ffmpeg-arg builder.
- `videoProfiles.ts` — per-format video output profiles.
- A `/render-composite` route on the existing container `server.mjs`.
- `videoCompositeRender.ts` worker orchestrator + a `video-render` queue branch in the audio-jobs worker.
- `VIDEO_RENDER_QUEUE` producer binding + `video-render`/`-dlq` consumer (wrangler) — operator-activated.
- A `render-video` endpoint (reuses `createRenderJob`).

---

## 2. The pure composite builder (`server/utils/audio/videoCompositeGraph.ts`)

Mirrors `timelineFiltergraph.ts`. **Pure, no I/O, dual-importable** (Nitro + container). Single `ffmpeg` invocation producing a muxed MP4.

**`buildCompositePlan(state: TimelineState, profile: VideoFormat): CompositePlan`** where:
```
CompositePlan = {
  inputs: { r2_key: string }[]   // index-ordered: video-clip sources first, then audio-clip sources
  filterComplex: string          // video base chain + audio mix chain
  vLabel: string                 // '[vout]'
  aLabel: string                 // '[aout]'
  durationSec: number
  profile: VideoFormat
}
```

**Video base chain** (the `video` track's clips, ignoring `overlay` tracks in V1.2a):
- Build a base canvas: `color=c=black:s={W}x{H}:r={fps}:d={duration}` as a synthetic input (or `[0:v]` if a clip starts at 0 — use an explicit black base for robust gap handling).
- For each video clip, build its stream:
  - **footage** (`base_source: 'uploaded_footage'`): `trim=start={source_in}:end={source_out}`, `scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}`, `setpts=PTS-STARTPTS`.
  - **still** (`base_source: 'still_kenburns'`): `scale`, then `zoompan=z='{ken-burns expr from kenburns}':d={duration*fps}:s={W}x{H}:fps={fps}` (pan/zoom from `kenburns.{zoom_from,zoom_to,pan_from,pan_to}`).
  - Position on the timeline: `overlay` the clip stream onto the running base with `enable='between(t,{start},{start+duration})'` and a `setpts` shift, OR `tpad`/`adelay`-equivalent for video. (Implementation detail: overlay-with-enable onto the black canvas is the robust general approach for positioned, possibly-gapped clips.)
  - Chain overlays left-to-right → final `[vbase]` → `[vout]`.

**Audio mix chain** (the `voiceover`/`music`/`sfx` tracks): **reuse the audio filtergraph logic.** The AV timeline's audio tracks are the same `Track`/audio-`Clip` shape, so the existing per-clip/per-track/ducking chain from `buildTimelineFiltergraph` applies. Compose its `inputs` + `filterComplex` into this plan with input indices offset after the video inputs, relabel its `[mix]` → `[aout]`. (Video clips default `audio_mode: 'mute'` in V1, so their own audio is dropped — the audio bed owns the soundtrack.)

**Args builder `buildCompositeRenderArgs(plan, inputPaths, outPath)`** (mirrors `buildMasterRenderArgs`): `-i` each input, `-filter_complex {plan.filterComplex}`, `-map {vLabel} -map {aLabel}`, video codec/bitrate/`-pix_fmt yuv420p`/`-r {fps}` + `-c:a aac` per `profile`, `-movflags +faststart`, `-shortest`, `-y outPath`. Pinned for determinism.

> The video-base sequencing (overlay-onto-canvas with `enable`) is the one genuinely fiddly part — it gets thorough unit tests (arg-shape assertions for footage, still/zoompan, positioning, gaps), exactly like the audio filtergraph tests.

---

## 3. Video profiles (`server/utils/audio/videoProfiles.ts`)

Mirrors `profiles.ts`:
```ts
export interface VideoFormat {
  format: 'reels_9x16' | 'square_1x1' | 'youtube_16x9'
  codec: 'h264'
  width: number; height: number; fps: number
  videoBitrate: string     // e.g. '8M'
  audioLufs: number        // -14 social
  maxDurationSec: number | null
}
export const DEFAULT_VIDEO_FORMATS: Record<VideoFormat['format'], VideoFormat> = { /* 1080x1920, 1080x1080, 1920x1080 */ }
export function videoFormatFor(key: string, overrides?): VideoFormat | null
```
V1.2a renders **one** requested format per job entry (fan-out across formats is the same `channels[]` loop the audio variants use — kept simple here; multi-format is trivial follow-on).

---

## 4. Container route (`workers/audio-jobs/container/server.mjs`)

Add a `POST /render-composite` branch (alongside `/render-timeline`, `/render`):
- Body `{ plan, files: [{ b64 }] }` (same shape as `/render-timeline`).
- Write each input to `/tmp/inN`, run `buildCompositeRenderArgs(plan, paths, '/tmp/out.mp4')`, return the MP4 bytes (`content-type: video/mp4`).
- Imports `buildCompositeRenderArgs` from the new `container/videoCompositeGraph.mjs` port. **No Chromium** in V1.2a.

---

## 5. Worker orchestrator + queue branch (`workers/audio-jobs/`)

- `src/videoCompositeRender.ts` — `runVideoCompositeJob(msg, deps)` mirroring `runTimelineRenderJob`: `markRendering` → `loadTimelineState(timelineId)` → for each format: `renderComposite({ projectId, jobId, state, profile })` → collect `variants` (format→R2 key) → `markDone(jobId, variants, costCents)`; `markFailed` + rethrow on error (queue retries).
- `src/videoCompositeContainer.ts` — `renderComposite(...)` mirroring `timelineMasterRender.ts`: `buildCompositePlan(state, profile)` → pull each `plan.inputs[].r2_key` from `AUDIO_BUCKET` → base64 → `getContainer(env.RENDER, 'vid:{jobId}')` `.renewActivityTimeout()` → `fetch('/render-composite', { plan, files })` → `AUDIO_BUCKET.put('media/{projectId}/{jobId}/{format}.mp4', bytes)` → return the R2 key.
- `src/index.ts` — add a `batch.queue === 'video-render'` branch wiring the real deps (mirrors the `timeline-render` branch).
- Reuse `src/db.ts` (`dbLoadTimelineState`, `dbMarkRender*`).

---

## 6. Queue wiring (operator-activated; dormant)

- `workers/audio-jobs/wrangler.toml` — add a `video-render` consumer (`max_batch_size=1`, `dead_letter_queue=video-render-dlq`, `max_retries=3`), mirroring `timeline-render`.
- Producer: `VIDEO_RENDER_QUEUE` binding on the Pages project (operator adds; beware the Direct-Upload `dist/wrangler.json` override — the `MUSIC_QUEUE`/`TIMELINE_RENDER_QUEUE` precedent).
- A producer helper `enqueueVideoRender(event, msg)` (mirrors `renderQueue.ts`), reading `event.context.cloudflare.env.VIDEO_RENDER_QUEUE`.

---

## 7. Render endpoint (`server/api/agency/audio/projects/[id]/render-video.post.ts`)

- `requireWriteAccess`; load project; **require `media_type === 'av'`** (else 400). Validate the current timeline (`TimelineStateSchema` + `validateTimeline`).
- `createRenderJob({ projectId, requestedBy, channels: formats })` (reuse — snapshots the timeline into an immutable version).
- `enqueueVideoRender(event, { jobId, projectId, timelineId, formats })`; on enqueue failure → `markRenderJobFailed` + 502 (mirrors `render.post.ts`).
- `202`. Reuse the existing `render-jobs.get.ts` for status (it's project-scoped, media-agnostic).
- **Flag gate:** the whole path behind `VIDEO_STUDIO_ENABLED` (off) — return 404/403 when unset, so it's dormant in prod.

---

## 8. Scope

**In:** §2 builder (+`.mjs` port + sync test), §3 profiles, §4 container route, §5 worker orchestrator+branch (DI-tested), §6 queue wiring, §7 endpoint, flag gating. Unit tests for the pure builder + profiles + worker orchestrator (mocked deps, mirroring `timelineRenderWorker.test.ts`).

**Out (later):** overlay layer entirely → **V1.2b** (banner-HTML server port, headless capture, alpha composite); editor UI → V1.3; multi-format fan-out polish; any real container deploy/live render (operator-activated). No new migration (reuses `media_render_jobs`).

---

## 9. Success criteria

- `buildCompositePlan` over an AV timeline (a footage clip + a `still_kenburns` clip + VO + music tracks) produces a valid plan: correct ordered inputs, a `filterComplex` with the video base chain (trim/scale/zoompan/positioned-overlay) + the audio mix chain, mapped `[vout]`/`[aout]`, correct duration. Unit-tested without ffmpeg.
- `.ts` and `.mjs` composite builders are byte-identical (sync test).
- `runVideoCompositeJob` (mocked deps) drives markRendering → render per format → markDone with the right `variants`, and markFailed+rethrow on error.
- The `render-video` endpoint (mocked gateway/queue) enqueues for an `av` project, rejects an `audio` project (400), and is dormant when `VIDEO_STUDIO_ENABLED` is unset.
- Full `test/audio/` suite stays green (zero regression — audio render path untouched).
- No SQL migration.

## 10. Files

- `server/utils/audio/videoCompositeGraph.ts` + `test/audio/videoCompositeGraph.test.ts`
- `server/utils/audio/videoProfiles.ts` + `test/audio/videoProfiles.test.ts`
- `workers/audio-jobs/container/videoCompositeGraph.mjs` + `test/audio/videoCompositeGraphSync.test.ts`
- `workers/audio-jobs/container/server.mjs` (add `/render-composite`)
- `workers/audio-jobs/src/videoCompositeRender.ts` + `videoCompositeContainer.ts` + `test/audio/videoCompositeRenderWorker.test.ts`
- `workers/audio-jobs/src/index.ts` (add `video-render` branch) · `workers/audio-jobs/wrangler.toml` (queue)
- `server/utils/audio/renderQueue.ts` (add `enqueueVideoRender`)
- `server/api/agency/audio/projects/[id]/render-video.post.ts` + `test/audio/renderVideoApi.test.ts`
