# Video V1.3 — AV Editor UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped audio Media Studio editor with video + overlay tracks and a **frame-accurate canvas compositor preview** so an operator assembles footage + ken-burns stills + a Banner GSAP overlay + audio on one multitrack timeline and renders to MP4.

**Architecture:** Reuse the kind-agnostic edit core (`timelineEdit`/`timelineGeometry`), undo/autosave/versions, and the Web-Audio master clock untouched. The audio planner is made to **skip** video/overlay clips (audio engine schedules only audio → zero audio regression), and the audio engine's duration gains a floor of the full timeline length so a video-only project's clock still advances. Video/overlay clips render in the timeline via a pure `DisplayClip` mapper. The preview is a **canvas base compositor** (footage drawn via `drawImage`, stills via `drawImage` + ken-burns transform) with the GSAP overlay rendered in a clock-synced `<iframe>` stacked on top — both slaved to the audio clock that the existing rAF loop already mirrors.

**Why the overlay is a DOM layer, not rasterized into the canvas:** the overlay is GSAP-animated HTML/CSS/SVG. Browsers cannot cheaply or accurately rasterize arbitrary animated HTML onto a `<canvas>` (that is exactly why the V1.2 *render* path uses headless-Chromium screenshots). So the compositor draws the base footage/stills to the canvas frame-accurately and stacks the overlay as an absolutely-positioned `<iframe>` seeked to the same clock. This is visually WYSIWYG and frame-accurate per layer; the V1.2 server render remains the single source of truth for the final pixels.

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>`), Nuxt UI v4, Web Audio API, GSAP (in the banner iframe), Cloudflare R2 (footage/stills), Vitest + happy-dom. Render via the existing V1.2 `render-video` endpoint + `media_render_jobs` polling.

**Flag:** The whole AV editor is usable; only the **"Render video"** action is gated behind `VIDEO_STUDIO_ENABLED` (mirrored to the client as `public.videoStudioEnabled`). The server endpoint already 404s when off.

---

## File Structure

**Pure logic (TDD — full unit coverage):**
- `app/utils/audio/audioSchedulePlanner.ts` — *modify*: skip `type` `'video'`/`'overlay'` clips.
- `app/composables/useAudioEngine.ts` — *modify*: duration floor `max(audioDuration, state.duration_sec)`.
- `server/utils/audio/clipSources.ts` — *modify*: skip clips without an `r2_key` (overlay).
- `app/utils/audio/timelineEdit.ts` — *modify*: add `addVideoClip`, `addOverlayClip`, `trimVisualClip` (audio fns untouched).
- `app/utils/audio/timelineDisplay.ts` — *new*: `toDisplayLanes(timeline, scheduledClips)` → unified `DisplayClip` lanes.
- `app/utils/video/composite.ts` — *new*: pure compositor helpers (`fitRect`, `kenBurnsTransformAt`, `activeVisualClipAt`, `resolveOverlayFormatKeyClient`, `extractBannerLayers`).

**Backend:**
- `server/api/agency/audio/projects/[id]/upload-media.post.ts` — *new*: multipart footage/still → R2 → `{ r2_key, url }`.
- `server/utils/storage.ts` — *modify*: add `media-video` (500MB) + `media-image` (50MB) upload categories.
- `nuxt.config.ts` — *modify*: add `public.videoStudioEnabled`.

**Composable / components:**
- `app/composables/useMediaProjectEditor.ts` — *modify*: AV add actions, kind-aware trim/slice dispatch, `uploadMedia`, `renderVideoAction` + jobs polling, expose `mediaType`.
- `app/components/media/MediaTimeline.client.vue` — *modify*: render video/overlay lanes via `DisplayClip`.
- `app/components/media/MediaAvPreview.client.vue` — *new*: canvas base compositor + overlay iframe.
- `app/components/media/MediaOverlayPicker.vue` — *new*: pick a Banner project + format key.
- `app/components/media/MediaMediaPicker.vue` — *new*: upload footage/still.
- `app/pages/agency/audio/projects/[id].vue` — *modify*: AV preview pane, add-menu, render button + jobs panel.
- `app/pages/agency/audio/projects/index.vue` — *modify*: "New video project" (AV create).

**Out of scope (deferred):** per-format overlay aspect (V1.2b follow-up), transitions/scene grouping (V3), V1.4 export/distribution, AI generation (V2), marketing coming-soon flip (do at V1.4 launch), footage/overlay *slice* (audio-only in V1.3).

---

## Conventions for every task

- Run tests from the worktree root: `cd /Users/paulgiurin/Documents/Projects/dashboard/.claude/worktrees/video-studio-v1-3`.
- Test runner: `pnpm exec vitest run <path>` (one-shot). If a fresh worktree errors on `~~/` alias resolution in tests, run `pnpm exec nuxt prepare` once first.
- Server imports use `~~/server/...`; app imports use `~~/app/...` or `~/...`.
- Clip `type` may be **absent** on audio clips created in-session by `addClip` (it omits `type`). Treat **missing `type` as audio** everywhere — only `type === 'video'` / `type === 'overlay'` are non-audio.
- Commit after each task with the message shown in its final step.

---

## Task 1: Audio planner skips video/overlay clips

**Files:**
- Modify: `app/utils/audio/audioSchedulePlanner.ts:54-69`
- Test: `test/audio/audioSchedulePlanner.test.ts` (add a case; create the file if absent)

- [ ] **Step 1: Write the failing test**

Add to `test/audio/audioSchedulePlanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planTimeline } from '~~/app/utils/audio/audioSchedulePlanner'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

describe('planTimeline — AV clip kinds', () => {
  it('schedules audio clips but skips video and overlay clips', () => {
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 0, ducking: [],
      tracks: [
        { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'video', id: 'v1', asset_id: null, r2_key: 'media/p/footage.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
        ] },
        { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1', gsap_format_key: 'fb_story', opacity: 1 }
        ] },
        { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'audio', id: 'a1', asset_id: null, r2_key: 'audio/vo.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 3, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
        ] }
      ]
    } as unknown as TimelineState

    const plan = planTimeline(state)
    const ids = plan.clips.map(c => c.clipId)
    expect(ids).toEqual(['a1'])               // only the audio clip is scheduled
  })

  it('schedules legacy audio clips that have no `type` field', () => {
    const state = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, ducking: [],
      tracks: [{ id: 'm', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { id: 'legacy', asset_id: null, r2_key: 'audio/m.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 2, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
      ] }]
    } as unknown as TimelineState
    expect(planTimeline(state).clips.map(c => c.clipId)).toEqual(['legacy'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/audioSchedulePlanner.test.ts`
Expected: FAIL — the AV case currently returns `['v1','o1','a1']` (or throws on the overlay's missing fields).

- [ ] **Step 3: Implement the skip**

In `app/utils/audio/audioSchedulePlanner.ts`, inside the `for (const clip of track.clips)` loop (currently line 55), add as the FIRST line of the loop body:

```ts
    for (const clip of track.clips) {
      // V1.3: the audio engine schedules ONLY audio clips. Video/overlay clips have no
      // decodable audio buffer (overlays have no r2_key at all). Missing `type` ===
      // legacy audio clip (addClip omits it), so only EXPLICIT video/overlay are skipped.
      if ((clip as { type?: string }).type === 'video' || (clip as { type?: string }).type === 'overlay') continue
      clips.push({
```

Leave the rest of the push body unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/audio/audioSchedulePlanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/audioSchedulePlanner.ts test/audio/audioSchedulePlanner.test.ts
git commit -m "feat(video): audio planner skips video/overlay clips (zero audio regression)"
```

---

## Task 2: Audio engine duration floor = full timeline length

The engine's `durationSec` is computed from audio clips only. A video-only AV project would have audio duration 0, so `tick()` auto-pauses immediately and the clock never advances. Floor the engine duration at `state.duration_sec` (which `computeDuration` already derives over ALL clip kinds).

**Files:**
- Modify: `app/composables/useAudioEngine.ts:64-71`
- Test: `test/audio/audioEngineDuration.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { createAudioEngine } from '~~/app/composables/useAudioEngine'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

// Minimal mock AudioContext — load() only needs createGain + destination + currentTime.
function mockCtx() {
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} })
  }
}

describe('audio engine duration floor', () => {
  it('floors durationSec at state.duration_sec for a video-only AV timeline (no audio clips)', async () => {
    const engine = createAudioEngine({
      ctx: mockCtx() as any,
      resolveBuffer: async () => ({ duration: 0 }),
      setTimer: () => () => {}
    })
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 8, ducking: [],
      tracks: [{ id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'video', id: 'v1', asset_id: null, r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 8, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
      ] }]
    } as unknown as TimelineState
    await engine.load(state)
    expect(engine.duration()).toBe(8)   // not 0
  })

  it('does not shorten an audio timeline whose decoded buffers exceed state.duration_sec', async () => {
    const engine = createAudioEngine({
      ctx: mockCtx() as any,
      resolveBuffer: async () => ({ duration: 10 }),   // decoded buffer is 10s
      setTimer: () => () => {}
    })
    const state = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, ducking: [],
      tracks: [{ id: 'm', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'audio', id: 'a1', asset_id: null, r2_key: 'm.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
      ] }]
    } as unknown as TimelineState
    await engine.load(state)
    expect(engine.duration()).toBe(10)  // decoded buffer wins over state.duration_sec (0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/audioEngineDuration.test.ts`
Expected: FAIL — first case returns `0`.

- [ ] **Step 3: Implement the floor**

In `app/composables/useAudioEngine.ts`, at the end of `load()` (after the `for (const clip of plan.clips)` loop closes, currently line 71), add:

```ts
    // V1.3: floor the transport duration at the full timeline length so a video-only AV
    // project (no audio clips → audio durationSec 0) still advances the clock. computeDuration
    // (baked into state.duration_sec on every edit) spans audio + video + overlay clips.
    // For pure audio this never shortens — decoded-buffer durations above already win.
    durationSec = Math.max(durationSec, (state as { duration_sec?: number }).duration_sec ?? 0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/audio/audioEngineDuration.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing audio engine tests for regression**

Run: `pnpm exec vitest run test/audio/`
Expected: all PASS (the floor only ever raises duration).

- [ ] **Step 6: Commit**

```bash
git add app/composables/useAudioEngine.ts test/audio/audioEngineDuration.test.ts
git commit -m "feat(video): engine duration floors at full timeline length (video-only clock advances)"
```

---

## Task 3: collectClipKeys skips keyless (overlay) clips

`collectClipKeys` adds `clip.r2_key` for every clip; overlay clips have none → it adds `undefined`, which the clip-sources endpoint then tries to presign (caught + omitted, but wasteful and sloppy). Skip falsy keys. Video footage keys remain included, so the preview gets presigned footage URLs on reload.

**Files:**
- Modify: `server/utils/audio/clipSources.ts:9-13`
- Test: `test/audio/clipSources.test.ts` (add a case; create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

describe('collectClipKeys — AV', () => {
  it('includes video footage keys and excludes keyless overlay clips', () => {
    const state = {
      schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
      duration_sec: 0, ducking: [],
      tracks: [
        { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'video', id: 'v1', asset_id: null, r2_key: 'media/p/footage.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
        ] },
        { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1', gsap_format_key: 'fb_story', opacity: 1 }
        ] }
      ]
    } as unknown as TimelineState
    const keys = collectClipKeys(state)
    expect(keys).toEqual(['media/p/footage.mp4'])
    expect(keys).not.toContain(undefined)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/clipSources.test.ts`
Expected: FAIL — `keys` contains `undefined`.

- [ ] **Step 3: Implement the skip**

Replace `server/utils/audio/clipSources.ts:11`:

```ts
    for (const clip of track.clips) {
      const key = (clip as { r2_key?: string }).r2_key
      if (key) keys.add(key)   // overlay clips have no r2_key — skip them
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/audio/clipSources.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/clipSources.ts test/audio/clipSources.test.ts
git commit -m "feat(video): collectClipKeys skips keyless overlay clips, keeps footage keys"
```

---

## Task 4: Pure edit helpers — addVideoClip, addOverlayClip, trimVisualClip

The shipped `addClip`/`trimClip`/`sliceClipAt` are audio-only (they read/write `source_*`/`fade_*`). Add **new** kind-specific helpers; leave the audio functions untouched (zero regression).

**Files:**
- Modify: `app/utils/audio/timelineEdit.ts` (append new functions)
- Test: `test/audio/timelineEditAv.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { addVideoClip, addOverlayClip, trimVisualClip } from '~~/app/utils/audio/timelineEdit'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

function avState(): TimelineState {
  return {
    schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
    duration_sec: 0, ducking: [],
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] },
      { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] }
    ]
  } as unknown as TimelineState
}

describe('addVideoClip', () => {
  it('adds an uploaded-footage clip with the given duration', () => {
    const next = addVideoClip(avState(), { trackId: 'vid', id: 'v1', r2Key: 'media/p/f.mp4', startSec: 2, durationSec: 6, baseSource: 'uploaded_footage' })
    const clip: any = next.tracks[0].clips[0]
    expect(clip).toMatchObject({ type: 'video', id: 'v1', r2_key: 'media/p/f.mp4', timeline_start_sec: 2, duration_sec: 6, base_source: 'uploaded_footage', kenburns: null, source_in_sec: 0, source_out_sec: null, audio_mode: 'mute' })
    expect(next.duration_sec).toBe(8)
  })

  it('adds a still_kenburns clip with a default kenburns object', () => {
    const next = addVideoClip(avState(), { trackId: 'vid', id: 's1', r2Key: 'media/p/i.jpg', startSec: 0, durationSec: 5, baseSource: 'still_kenburns' })
    const clip: any = next.tracks[0].clips[0]
    expect(clip.base_source).toBe('still_kenburns')
    expect(clip.kenburns).toEqual({ zoom_from: 1, zoom_to: 1.1, pan_from: [0, 0], pan_to: [0, 0] })
  })
})

describe('addOverlayClip', () => {
  it('adds an overlay clip referencing a banner project + format', () => {
    const next = addOverlayClip(avState(), { trackId: 'ov', id: 'o1', gsapProjectId: 'b1', gsapFormatKey: 'fb_story', startSec: 1, durationSec: 4 })
    const clip: any = next.tracks[1].clips[0]
    expect(clip).toMatchObject({ type: 'overlay', id: 'o1', gsap_project_id: 'b1', gsap_format_key: 'fb_story', timeline_start_sec: 1, duration_sec: 4, opacity: 1 })
    expect(next.duration_sec).toBe(5)
  })
})

describe('trimVisualClip', () => {
  it('end-trims an overlay clip by shrinking duration', () => {
    let s = addOverlayClip(avState(), { trackId: 'ov', id: 'o1', gsapProjectId: 'b1', gsapFormatKey: 'fb_story', startSec: 0, durationSec: 5 })
    s = trimVisualClip(s, { clipId: 'o1', edge: 'end', newTimeSec: 3 })
    expect((s.tracks[1].clips[0] as any).duration_sec).toBe(3)
  })

  it('start-trims a footage clip: advances start + source_in and shrinks duration', () => {
    let s = addVideoClip(avState(), { trackId: 'vid', id: 'v1', r2Key: 'f.mp4', startSec: 0, durationSec: 6, baseSource: 'uploaded_footage' })
    s = trimVisualClip(s, { clipId: 'v1', edge: 'start', newTimeSec: 2 })
    const c: any = s.tracks[0].clips[0]
    expect(c.timeline_start_sec).toBe(2)
    expect(c.source_in_sec).toBe(2)
    expect(c.duration_sec).toBe(4)
  })

  it('keeps duration >= 0.1 on an over-aggressive end trim', () => {
    let s = addOverlayClip(avState(), { trackId: 'ov', id: 'o1', gsapProjectId: 'b1', gsapFormatKey: 'fb_story', startSec: 1, durationSec: 5 })
    s = trimVisualClip(s, { clipId: 'o1', edge: 'end', newTimeSec: 0 })   // before the start
    expect((s.tracks[1].clips[0] as any).duration_sec).toBeCloseTo(0.1, 5)
  })

  it('returns the same reference when the clip id is unknown', () => {
    const s = avState()
    expect(trimVisualClip(s, { clipId: 'nope', edge: 'end', newTimeSec: 3 })).toBe(s)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/timelineEditAv.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the helpers**

Append to `app/utils/audio/timelineEdit.ts` (after `moveClip`):

```ts
// ─── V1.3 AV edit helpers ──────────────────────────────────────────────────────
// New clip-kind helpers. The audio addClip/trimClip/sliceClipAt above are LEFT
// UNTOUCHED (they assume source_*/fade_* fields only audio clips have).

const DEFAULT_KENBURNS = { zoom_from: 1, zoom_to: 1.1, pan_from: [0, 0] as [number, number], pan_to: [0, 0] as [number, number] }

/** Append a video clip (uploaded footage or a ken-burns still) to a video track. */
export function addVideoClip(
  state: TimelineState,
  { trackId, id, r2Key, startSec, durationSec, baseSource }:
    { trackId: string; id: string; r2Key: string; startSec: number; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  if (!track) return state
  track.clips.push({
    type: 'video', id, asset_id: null, r2_key: r2Key,
    timeline_start_sec: Math.max(0, startSec),
    source_in_sec: 0, source_out_sec: null,
    duration_sec: Math.max(0.1, durationSec),
    base_source: baseSource,
    kenburns: baseSource === 'still_kenburns' ? { ...DEFAULT_KENBURNS } : null,
    audio_mode: 'mute'
  } as unknown as Clip)
  next.duration_sec = computeDuration(next)
  return next
}

/** Append an overlay clip (a Banner Studio project + format key) to an overlay track. */
export function addOverlayClip(
  state: TimelineState,
  { trackId, id, gsapProjectId, gsapFormatKey, startSec, durationSec }:
    { trackId: string; id: string; gsapProjectId: string; gsapFormatKey: string | null; startSec: number; durationSec: number }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  if (!track) return state
  track.clips.push({
    type: 'overlay', id,
    timeline_start_sec: Math.max(0, startSec),
    duration_sec: Math.max(0.1, durationSec),
    gsap_project_id: gsapProjectId,
    gsap_format_key: gsapFormatKey,
    opacity: 1
  } as unknown as Clip)
  next.duration_sec = computeDuration(next)
  return next
}

/** Trim a VIDEO or OVERLAY clip. Overlays + stills resize duration only; footage also
 * shifts source_in_sec on a start-trim so the visible window stays consistent. Audio
 * clips must go through trimClip (this returns state unchanged for them). */
export function trimVisualClip(
  state: TimelineState,
  { clipId, edge, newTimeSec }: { clipId: string; edge: 'start' | 'end'; newTimeSec: number }
): TimelineState {
  const found = findClip(state, clipId)
  if (!found) return state
  const c = found.clip as any
  if (c.type !== 'video' && c.type !== 'overlay') return state
  const MIN = 0.1
  const next = cloneState(state)
  const clip = findClip(next, clipId)!.clip as any
  if (edge === 'end') {
    clip.duration_sec = Math.max(MIN, newTimeSec - clip.timeline_start_sec)
    if (clip.type === 'video' && clip.source_out_sec != null) {
      clip.source_out_sec = clip.source_in_sec + clip.duration_sec
    }
  } else {
    // start-trim: clamp the advance so duration stays >= MIN and start stays >= 0
    const maxAdvance = clip.duration_sec - MIN
    const requested = newTimeSec - clip.timeline_start_sec
    const advance = Math.max(-clip.timeline_start_sec, Math.min(requested, maxAdvance))
    clip.timeline_start_sec = clip.timeline_start_sec + advance
    clip.duration_sec = clip.duration_sec - advance
    if (clip.type === 'video') {
      clip.source_in_sec = Math.max(0, clip.source_in_sec + advance)
      if (clip.source_out_sec != null) clip.source_out_sec = clip.source_in_sec + clip.duration_sec
    }
  }
  next.duration_sec = computeDuration(next)
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/audio/timelineEditAv.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing edit-core tests for regression**

Run: `pnpm exec vitest run test/audio/timelineEdit.test.ts`
Expected: all PASS (audio functions unchanged).

- [ ] **Step 6: Commit**

```bash
git add app/utils/audio/timelineEdit.ts test/audio/timelineEditAv.test.ts
git commit -m "feat(video): pure AV edit helpers — addVideoClip/addOverlayClip/trimVisualClip"
```

---

## Task 5: DisplayClip mapper — unify audio ScheduledClips + raw video/overlay clips

The timeline component renders `ScheduledClip[]` (audio-only after Task 1). Add a pure mapper producing one `DisplayClip[]` per lane: audio lanes from ScheduledClips (keeps the waveform path), video/overlay lanes from raw timeline clips.

**Files:**
- Create: `app/utils/audio/timelineDisplay.ts`
- Test: `test/audio/timelineDisplay.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { toDisplayLanes, type DisplayClip } from '~~/app/utils/audio/timelineDisplay'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

describe('toDisplayLanes', () => {
  const state = {
    schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
    duration_sec: 6, ducking: [],
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'video', id: 'v1', asset_id: null, r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
      ] },
      { id: 'ov', name: 'Overlay', kind: 'overlay', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 1, duration_sec: 4, gsap_project_id: 'b1', gsap_format_key: 'fb_story', opacity: 1 }
      ] },
      { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] }
    ]
  } as unknown as TimelineState

  const scheduled: ScheduledClip[] = [
    { clipId: 'a1', trackId: 'vo', r2_key: 'vo.mp3', timelineStartSec: 0, sourceInSec: 0, durationSec: 3, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear' }
  ]

  it('maps video lanes from raw clips and audio lanes from ScheduledClips', () => {
    const lanes = toDisplayLanes(state, scheduled)
    expect(lanes.map(l => l.id)).toEqual(['vid', 'ov', 'vo'])

    const vid = lanes[0].clips[0]
    expect(vid).toMatchObject<Partial<DisplayClip>>({ clipId: 'v1', trackId: 'vid', kind: 'video', timelineStartSec: 0, durationSec: 5, r2_key: 'f.mp4', baseSource: 'uploaded_footage' })

    const ov = lanes[1].clips[0]
    expect(ov).toMatchObject<Partial<DisplayClip>>({ clipId: 'o1', trackId: 'ov', kind: 'overlay', timelineStartSec: 1, durationSec: 4 })

    const vo = lanes[2].clips[0]
    expect(vo).toMatchObject<Partial<DisplayClip>>({ clipId: 'a1', trackId: 'vo', kind: 'audio', timelineStartSec: 0, durationSec: 3, r2_key: 'vo.mp3' })
  })

  it('treats voiceover/music/sfx tracks as audio and reads ScheduledClips for them', () => {
    const lanes = toDisplayLanes(state, scheduled)
    expect(lanes.find(l => l.id === 'vo')!.clips[0].kind).toBe('audio')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/timelineDisplay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapper**

Create `app/utils/audio/timelineDisplay.ts`:

```ts
// app/utils/audio/timelineDisplay.ts — PURE. Unifies the audio scheduler's ScheduledClips
// and the raw video/overlay clips from the timeline into one DisplayClip[] per lane, so
// MediaTimeline can render every track kind with the kind-agnostic geometry helpers.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

export interface DisplayClip {
  clipId: string
  trackId: string
  timelineStartSec: number
  durationSec: number | null
  kind: 'audio' | 'video' | 'overlay'
  /** audio + video clips carry an r2_key (waveform / poster). Overlay clips do not. */
  r2_key?: string
  baseSource?: 'uploaded_footage' | 'still_kenburns'
  label: string
}

export interface DisplayLane {
  id: string
  name: string
  kind: string
  muted: boolean
  clips: DisplayClip[]
}

/** Map a timeline + its audio ScheduledClips into per-lane DisplayClips.
 * Audio lanes (voiceover/music/sfx) read ScheduledClips (preserving the waveform path);
 * video/overlay lanes read the raw timeline clips. */
export function toDisplayLanes(timeline: TimelineState, scheduled: ScheduledClip[]): DisplayLane[] {
  const byTrack = new Map<string, ScheduledClip[]>()
  for (const sc of scheduled) {
    const list = byTrack.get(sc.trackId) ?? []
    list.push(sc)
    byTrack.set(sc.trackId, list)
  }

  return timeline.tracks.map((t) => {
    const isVideo = t.kind === 'video'
    const isOverlay = t.kind === 'overlay'
    let clips: DisplayClip[]
    if (isVideo || isOverlay) {
      clips = t.clips.map((c: any): DisplayClip => ({
        clipId: c.id,
        trackId: t.id,
        timelineStartSec: c.timeline_start_sec,
        durationSec: c.duration_sec ?? null,
        kind: isVideo ? 'video' : 'overlay',
        r2_key: c.r2_key,
        baseSource: c.base_source,
        label: isVideo
          ? (c.base_source === 'still_kenburns' ? 'Still' : 'Footage')
          : 'Overlay'
      }))
    } else {
      clips = (byTrack.get(t.id) ?? []).map((sc): DisplayClip => ({
        clipId: sc.clipId,
        trackId: sc.trackId,
        timelineStartSec: sc.timelineStartSec,
        durationSec: sc.durationSec,
        kind: 'audio',
        r2_key: sc.r2_key,
        label: sc.clipId
      }))
    }
    return { id: t.id, name: t.name, kind: t.kind, muted: t.muted, clips }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/audio/timelineDisplay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/timelineDisplay.ts test/audio/timelineDisplay.test.ts
git commit -m "feat(video): DisplayClip mapper unifies audio + video/overlay lanes"
```

---

## Task 6: Pure compositor + overlay helpers

Pure math/selection helpers for the preview component (kept testable; the component stays thin).

**Files:**
- Create: `app/utils/video/composite.ts`
- Test: `test/video/composite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { fitRect, kenBurnsTransformAt, activeVisualClipAt, resolveOverlayFormatKeyClient, extractBannerLayers } from '~~/app/utils/video/composite'

describe('fitRect (object-fit: cover)', () => {
  it('scales a 16:9 source to cover a 9:16 frame, cropping width', () => {
    const r = fitRect(1920, 1080, 1080, 1920)
    expect(r.height).toBe(1920)                 // height fills
    expect(Math.round(r.width)).toBe(3413)      // 1920 * (1920/1080)
    expect(r.y).toBe(0)
    expect(Math.round(r.x)).toBe(Math.round((1080 - r.width) / 2))
  })
})

describe('kenBurnsTransformAt', () => {
  const kb = { zoom_from: 1, zoom_to: 1.5, pan_from: [0, 0] as [number, number], pan_to: [10, 20] as [number, number] }
  it('returns the from-values at t=0 and to-values at t=duration', () => {
    expect(kenBurnsTransformAt(kb, 0, 4)).toMatchObject({ zoom: 1, panX: 0, panY: 0 })
    expect(kenBurnsTransformAt(kb, 4, 4)).toMatchObject({ zoom: 1.5, panX: 10, panY: 20 })
  })
  it('interpolates linearly at the midpoint', () => {
    expect(kenBurnsTransformAt(kb, 2, 4)).toMatchObject({ zoom: 1.25, panX: 5, panY: 10 })
  })
})

describe('activeVisualClipAt', () => {
  const clips = [
    { id: 'a', timeline_start_sec: 0, duration_sec: 3 },
    { id: 'b', timeline_start_sec: 3, duration_sec: 3 }
  ]
  it('picks the clip whose [start,end) contains t', () => {
    expect(activeVisualClipAt(clips as any, 1)?.id).toBe('a')
    expect(activeVisualClipAt(clips as any, 3)?.id).toBe('b')
    expect(activeVisualClipAt(clips as any, 6)).toBeNull()
  })
})

describe('resolveOverlayFormatKeyClient', () => {
  it('mirrors the server aspect mapping', () => {
    expect(resolveOverlayFormatKeyClient(1080, 1920)).toBe('fb_story')
    expect(resolveOverlayFormatKeyClient(1920, 1080)).toBe('tt_land')
    expect(resolveOverlayFormatKeyClient(1080, 1080)).toBe('ig_sq')
  })
})

describe('extractBannerLayers', () => {
  it('returns the layers for the given format key', () => {
    const canvasData = { fb_story: { layers: [{ id: 'l1' }], bgColor: '#000' } }
    expect(extractBannerLayers(canvasData, 'fb_story')).toEqual([{ id: 'l1' }])
  })
  it('returns [] when the format key is missing', () => {
    expect(extractBannerLayers({}, 'nope')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/video/composite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `app/utils/video/composite.ts`:

```ts
// app/utils/video/composite.ts — PURE helpers for the AV preview compositor. No DOM.

export interface FitRect { x: number; y: number; width: number; height: number }

/** object-fit: cover — scale (sw×sh) to fully cover (dw×dh), centred, cropping overflow. */
export function fitRect(sw: number, sh: number, dw: number, dh: number): FitRect {
  if (sw <= 0 || sh <= 0) return { x: 0, y: 0, width: dw, height: dh }
  const scale = Math.max(dw / sw, dh / sh)
  const width = sw * scale
  const height = sh * scale
  return { x: (dw - width) / 2, y: (dh - height) / 2, width, height }
}

export interface KenBurns { zoom_from: number; zoom_to: number; pan_from: [number, number]; pan_to: [number, number] }

/** Linear-interpolate a ken-burns transform at local time t within [0, duration]. */
export function kenBurnsTransformAt(kb: KenBurns, t: number, durationSec: number): { zoom: number; panX: number; panY: number } {
  const p = durationSec > 0 ? Math.max(0, Math.min(1, t / durationSec)) : 0
  return {
    zoom: kb.zoom_from + (kb.zoom_to - kb.zoom_from) * p,
    panX: kb.pan_from[0] + (kb.pan_to[0] - kb.pan_from[0]) * p,
    panY: kb.pan_from[1] + (kb.pan_to[1] - kb.pan_from[1]) * p
  }
}

/** The last clip (top-most in array order) whose [start, start+duration) contains t, else null. */
export function activeVisualClipAt<T extends { timeline_start_sec: number; duration_sec: number }>(clips: T[], t: number): T | null {
  let hit: T | null = null
  for (const c of clips) {
    if (t >= c.timeline_start_sec && t < c.timeline_start_sec + c.duration_sec) hit = c
  }
  return hit
}

/** Client mirror of server resolveOverlayFormatKey (bannerOverlay.ts) — aspect → format. */
export function resolveOverlayFormatKeyClient(width: number, height: number): string {
  const r = width / height
  if (r < 0.85) return 'fb_story'
  if (r > 1.2) return 'tt_land'
  return 'ig_sq'
}

/** Pull a banner project's layers for a format key out of its canvasData JSON. */
export function extractBannerLayers(canvasData: Record<string, { layers?: unknown[] }> | null | undefined, formatKey: string): unknown[] {
  return (canvasData?.[formatKey]?.layers as unknown[]) ?? []
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/video/composite.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/video/composite.ts test/video/composite.test.ts
git commit -m "feat(video): pure compositor + overlay preview helpers"
```

---

## Task 7: Expose VIDEO_STUDIO_ENABLED to the client

**Files:**
- Modify: `nuxt.config.ts:165-178` (the `public` block)

- [ ] **Step 1: Add the public mirror**

In `nuxt.config.ts`, inside `runtimeConfig.public`, after the `aiToolsEnabled` line (currently line 177), add:

```ts
      aiToolsEnabled: process.env.AI_TOOLS_ENABLED === 'true',
      // Client-visible mirror of VIDEO_STUDIO_ENABLED — gates ONLY the "Render video"
      // button in the AV editor (the server endpoint is the real boundary; it 404s when off).
      videoStudioEnabled: process.env.VIDEO_STUDIO_ENABLED === 'true'
```

- [ ] **Step 2: Verify it parses**

Run: `pnpm exec nuxt prepare`
Expected: completes without error (regenerates `.nuxt` types including the new public key).

- [ ] **Step 3: Commit**

```bash
git add nuxt.config.ts
git commit -m "feat(video): expose videoStudioEnabled to client runtimeConfig"
```

---

## Task 8: Media upload endpoint (footage / stills → R2)

**Files:**
- Modify: `server/utils/storage.ts` (add two upload categories)
- Create: `server/api/agency/audio/projects/[id]/upload-media.post.ts`
- Test: `test/audio/uploadMediaCategories.test.ts` (new — covers the storage-category guards)

- [ ] **Step 1: Write the failing test (storage category guards)**

```ts
import { describe, it, expect } from 'vitest'
import { validateFileType, validateFileSize } from '~~/server/utils/storage'

describe('media upload categories', () => {
  it('accepts mp4/webm/quicktime for media-video up to 500MB', () => {
    expect(validateFileType('video/mp4', 'media-video')).toBe(true)
    expect(validateFileType('video/webm', 'media-video')).toBe(true)
    expect(validateFileType('video/quicktime', 'media-video')).toBe(true)
    expect(validateFileType('image/png', 'media-video')).toBe(false)
    expect(validateFileSize(500 * 1024 * 1024, 'media-video')).toBe(true)
    expect(validateFileSize(500 * 1024 * 1024 + 1, 'media-video')).toBe(false)
  })
  it('accepts jpeg/png/webp for media-image up to 50MB', () => {
    expect(validateFileType('image/jpeg', 'media-image')).toBe(true)
    expect(validateFileType('image/png', 'media-image')).toBe(true)
    expect(validateFileType('image/webp', 'media-image')).toBe(true)
    expect(validateFileType('video/mp4', 'media-image')).toBe(false)
    expect(validateFileSize(50 * 1024 * 1024, 'media-image')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/uploadMediaCategories.test.ts`
Expected: FAIL — categories unknown.

- [ ] **Step 3: Add the storage categories**

In `server/utils/storage.ts`, locate the category config object (the one with `avatars`/`attachments`/etc. around lines 52-81, used by `validateFileType`/`validateFileSize`). Add two entries matching the existing shape:

```ts
  'media-video': {
    allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxSize: 500 * 1024 * 1024   // 500MB — matches office-recordings
  },
  'media-image': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 50 * 1024 * 1024    // 50MB
  },
```

> If `generateStorageKey`'s category type is a string union, add `'media-video' | 'media-image'` to it. If `validateFileType(type, category)` uses a `Record<string, …>` keyed lookup, no type change is needed — confirm by reading the function before editing.

- [ ] **Step 4: Run the category test to verify it passes**

Run: `pnpm exec vitest run test/audio/uploadMediaCategories.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the upload endpoint**

Create `server/api/agency/audio/projects/[id]/upload-media.post.ts`:

```ts
// server/api/agency/audio/projects/[id]/upload-media.post.ts
// Multipart upload of footage (video) or a still (image) for an AV media project.
// Validates kind/type/size, uploads to R2 under a project-scoped key, and returns a
// presigned GET URL so the editor preview can load it immediately. Mirrors the
// task-attachments upload pattern (auth + type/size guards + scoped key).
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import {
  uploadFile, getPresignedDownloadUrl, getPublicUrl, isStorageConfigured,
  generateStorageKey, validateFileType, validateFileSize
} from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!

  // Project must exist + be an AV project (org-scoped via the gateway).
  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (existing.project.mediaType !== 'av') {
    throw createError({ statusCode: 400, statusMessage: 'upload-media requires an AV project' })
  }

  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, statusMessage: 'Expected multipart form data' })

  const file = form.find(f => f.name === 'file')
  const kindField = form.find(f => f.name === 'kind')
  const kind = kindField?.data ? new TextDecoder().decode(kindField.data) : ''
  if (!file?.data || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  if (kind !== 'footage' && kind !== 'still') {
    throw createError({ statusCode: 400, statusMessage: "kind must be 'footage' or 'still'" })
  }

  const category = kind === 'footage' ? 'media-video' : 'media-image'
  const fileType = file.type || 'application/octet-stream'
  const fileSize = file.data.length

  if (!validateFileType(fileType, category)) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported ${kind} type: ${fileType}` })
  }
  if (!validateFileSize(fileSize, category)) {
    throw createError({ statusCode: 400, statusMessage: `${kind} exceeds the size limit` })
  }

  // Project-scoped key: media/<projectId>/<footage|still>/<timestamp>-<name>-<uuid>.<ext>
  const key = generateStorageKey(`media/${id}/${kind}`, file.filename)
  await uploadFile(file.data, key, fileType, { projectId: id, kind })

  const url = isStorageConfigured()
    ? (getPublicUrl(key) ?? await getPresignedDownloadUrl(key, 60 * 60))
    : `/api/_uploads/${key}`

  setResponseStatus(event, 201)
  return { r2_key: key, url, fileName: file.filename, fileType, fileSize, kind }
})
```

> Read `generateStorageKey` before wiring: it is called as `generateStorageKey(category, filename, entityId?)` and builds `<category>/<entityId?>/<ts>-<name>-<uuid>.<ext>`. Passing the full `media/<id>/<kind>` as the category yields the scoped key above. If its signature differs, adapt to produce the same `media/<projectId>/<kind>/…` shape.

- [ ] **Step 6: Run all touched tests + the audio suite**

Run: `pnpm exec vitest run test/audio/uploadMediaCategories.test.ts test/audio/`
Expected: PASS (no regression).

- [ ] **Step 7: Commit**

```bash
git add server/utils/storage.ts server/api/agency/audio/projects/\[id\]/upload-media.post.ts test/audio/uploadMediaCategories.test.ts
git commit -m "feat(video): media upload endpoint (footage/stills → R2) + storage categories"
```

---

## Task 9: Composable — AV actions, kind-aware trim, upload, render polling

Extend `useMediaProjectEditor` with AV add actions, kind-aware trim dispatch (so video/overlay don't crash the audio `trimClip`), an `uploadMedia` helper, render enqueue + jobs polling, and a `mediaType` getter. Extract the two pure pieces (trim dispatch + a poll-step reducer) so they're unit-tested.

**Files:**
- Modify: `app/composables/useMediaProjectEditor.ts`
- Test: `test/audio/mediaEditorAv.test.ts` (new — pure helpers only)

- [ ] **Step 1: Write the failing test (pure helpers)**

```ts
import { describe, it, expect } from 'vitest'
import { clipKindOf, nextPollDelay } from '~~/app/composables/useMediaProjectEditor'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const state = {
  schema_version: 2, media_type: 'av', sample_rate: 48000, fps: 30, width: 1080, height: 1920,
  duration_sec: 0, ducking: [],
  tracks: [
    { id: 'vid', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
      { type: 'video', id: 'v1', r2_key: 'f.mp4', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: null, duration_sec: 5, base_source: 'uploaded_footage', kenburns: null, audio_mode: 'mute' }
    ] },
    { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false, clips: [
      { id: 'a1', r2_key: 'vo.mp3', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 3, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }
    ] }
  ]
} as unknown as TimelineState

describe('clipKindOf', () => {
  it('returns video for a video clip, audio for a legacy untyped audio clip, null when not found', () => {
    expect(clipKindOf(state, 'v1')).toBe('video')
    expect(clipKindOf(state, 'a1')).toBe('audio')   // no `type` field → audio
    expect(clipKindOf(state, 'nope')).toBeNull()
  })
})

describe('nextPollDelay', () => {
  it('stops (null) for terminal statuses and returns a positive delay otherwise', () => {
    expect(nextPollDelay('done')).toBeNull()
    expect(nextPollDelay('failed')).toBeNull()
    expect(nextPollDelay('queued')).toBeGreaterThan(0)
    expect(nextPollDelay('rendering')).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/audio/mediaEditorAv.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement composable changes**

In `app/composables/useMediaProjectEditor.ts`:

(a) Extend the imports from `timelineEdit`:

```ts
import {
  cloneState,
  addClip, addTrack, deleteClip, moveClip, trimClip, sliceClipAt,
  addVideoClip, addOverlayClip, trimVisualClip
} from '~~/app/utils/audio/timelineEdit'
```

(b) Add two exported pure helpers at module scope (above `useMediaProjectEditor`):

```ts
/** Resolve a clip's kind from the timeline. Missing `type` === audio (addClip omits it). */
export function clipKindOf(state: TimelineState, clipId: string): 'audio' | 'video' | 'overlay' | null {
  for (const t of state.tracks) {
    const c = t.clips.find((x: any) => x.id === clipId) as any
    if (c) return c.type === 'video' ? 'video' : c.type === 'overlay' ? 'overlay' : 'audio'
  }
  return null
}

/** Poll cadence for render jobs: null = stop (terminal), else ms until next poll. */
export function nextPollDelay(status: string): number | null {
  if (status === 'done' || status === 'failed') return null
  return 2500
}
```

(c) Make `trimClipAction` kind-aware (replace the existing body):

```ts
  function trimClipAction(clipId: string, edge: 'start' | 'end', newTimeSec: number) {
    if (!timeline.value) return
    const kind = clipKindOf(timeline.value, clipId)
    if (kind === 'video' || kind === 'overlay') {
      applyEdit(trimVisualClip(timeline.value, { clipId, edge, newTimeSec }))
      return
    }
    if (!engine) return
    applyEdit(trimClip(timeline.value, { clipId, edge, newTimeSec, sourceDurationSec: engine.clipSourceDuration(clipId) }))
  }
```

(d) Guard `sliceAction` so it only slices audio clips (footage/overlay slice is out of scope for V1.3 and `sliceClipAt` would corrupt them):

```ts
  function sliceAction(clipId: string, timeSec: number) {
    if (!timeline.value || !engine) return
    if (clipKindOf(timeline.value, clipId) !== 'audio') return   // V1.3: audio-only slice
    applyEdit(sliceClipAt(timeline.value, {
      clipId, timeSec,
      leftId: crypto.randomUUID(),
      rightId: crypto.randomUUID(),
      sourceDurationSec: engine.clipSourceDuration(clipId)
    }))
  }
```

(e) Add AV add-actions + upload + render, after `addClipToKindTrackAction`:

```ts
  // ─── V1.3 AV actions ──────────────────────────────────────────────────────────

  /** Upload footage/still → R2 → merge its presigned URL into sources → return r2_key + duration. */
  async function uploadMedia(file: File, kind: 'footage' | 'still'): Promise<{ r2Key: string; url: string; durationSec: number }> {
    // Read intrinsic duration client-side (footage) before upload; stills default to 5s.
    const durationSec = kind === 'footage' ? await readVideoDuration(file) : 5
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const res = await $fetch<{ r2_key: string; url: string }>(`/api/agency/audio/projects/${projectId}/upload-media`, { method: 'POST', body: fd })
    mergeSource(res.r2_key, res.url)
    return { r2Key: res.r2_key, url: res.url, durationSec }
  }

  /** Add a video clip (footage or still). Ensures a video track exists. One undo step. */
  function addVideoClipAction(r2Key: string, durationSec: number, baseSource: 'uploaded_footage' | 'still_kenburns', startSec: number) {
    if (!timeline.value) return
    let next = timeline.value
    let track = next.tracks.find(t => t.kind === 'video')
    if (!track) { const tid = crypto.randomUUID(); next = addTrack(next, { id: tid, kind: 'video' }); track = next.tracks.find(t => t.id === tid)! }
    applyEdit(addVideoClip(next, { trackId: track.id, id: crypto.randomUUID(), r2Key, startSec: Math.max(0, startSec), durationSec, baseSource }))
  }

  /** Add an overlay clip from a Banner project + format. Ensures an overlay track exists. */
  function addOverlayClipAction(gsapProjectId: string, gsapFormatKey: string, durationSec: number, startSec: number) {
    if (!timeline.value) return
    let next = timeline.value
    let track = next.tracks.find(t => t.kind === 'overlay')
    if (!track) { const tid = crypto.randomUUID(); next = addTrack(next, { id: tid, kind: 'overlay' }); track = next.tracks.find(t => t.id === tid)! }
    applyEdit(addOverlayClip(next, { trackId: track.id, id: crypto.randomUUID(), gsapProjectId, gsapFormatKey, startSec: Math.max(0, startSec), durationSec }))
  }

  // ─── Render jobs ────────────────────────────────────────────────────────────
  const renderJobs = ref<any[]>([])
  const rendering = ref(false)
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  async function refreshRenderJobs() {
    try {
      const res = await $fetch<{ jobs: any[] }>(`/api/agency/audio/projects/${projectId}/render-jobs`)
      renderJobs.value = res.jobs
    } catch { /* surfaced via UI emptiness */ }
  }

  function scheduleJobPoll() {
    if (pollTimer) clearTimeout(pollTimer)
    const active = renderJobs.value.some(j => j.status === 'queued' || j.status === 'rendering')
    const delay = active ? nextPollDelay('rendering') : null
    if (delay == null) return
    pollTimer = setTimeout(async () => { await refreshRenderJobs(); scheduleJobPoll() }, delay)
  }

  /** Enqueue a composite-video render. Returns false (with a flag-off signal) on 404. */
  async function renderVideoAction(formats?: string[]): Promise<{ ok: boolean; flagOff?: boolean }> {
    if (rendering.value) return { ok: false }
    rendering.value = true
    try {
      await doSave()  // make sure the server's draft matches what we render
      await $fetch(`/api/agency/audio/projects/${projectId}/render-video`, { method: 'POST', body: formats?.length ? { formats } : {} })
      await refreshRenderJobs()
      scheduleJobPoll()
      return { ok: true }
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.response?.status === 404) return { ok: false, flagOff: true }
      return { ok: false }
    } finally {
      rendering.value = false
    }
  }
```

(f) Add the `readVideoDuration` helper at module scope (above the composable):

```ts
/** Read a video File's intrinsic duration (seconds) via an object URL. Falls back to 5s. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5) }
      v.onerror = () => { URL.revokeObjectURL(url); resolve(5) }
      v.src = url
    } catch { resolve(5) }
  })
}
```

(g) Expose `mediaType` (computed from the timeline) and the new actions/state in the return object:

```ts
  const mediaType = computed(() => timeline.value?.media_type ?? 'audio')
```

Add `computed` to the `vue` import at the top, and add to the returned object:

```ts
    mediaType,
    // AV actions
    uploadMedia, addVideoClipAction, addOverlayClipAction,
    renderVideoAction, refreshRenderJobs, renderJobs, rendering,
```

(h) In `onBeforeUnmount`, also clear the poll timer:

```ts
  onBeforeUnmount(() => { cancelAnimationFrame(raf); if (pollTimer) clearTimeout(pollTimer); engine?.dispose(); engine = null })
```

- [ ] **Step 4: Run the pure-helper test + audio regression**

Run: `pnpm exec vitest run test/audio/mediaEditorAv.test.ts test/audio/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMediaProjectEditor.ts test/audio/mediaEditorAv.test.ts
git commit -m "feat(video): editor composable AV actions, kind-aware trim, upload, render polling"
```

---

## Task 10: MediaTimeline renders video/overlay lanes (via DisplayClip)

Refactor `MediaTimeline.client.vue` to derive a single `displayLanes` from `toDisplayLanes(props.timeline, props.clips)` and render/interact on `DisplayClip`. Audio lanes behave identically (waveform path keyed by clipId+r2_key, kind `'audio'`); video lanes show a poster/film strip; overlay lanes show a badge.

**Files:**
- Modify: `app/components/media/MediaTimeline.client.vue`

- [ ] **Step 1: Swap the lane source + interaction model to DisplayClip**

Add imports:

```ts
import { toDisplayLanes, type DisplayClip } from '~~/app/utils/audio/timelineDisplay'
```

Replace the `lanes` computed (currently lines 115-122) with:

```ts
const lanes = computed(() => toDisplayLanes(props.timeline, props.clips))
```

Throughout the `<script>`, change every `ScheduledClip` interaction reference to operate on `DisplayClip`/`displayLanes`:
- `rect(clip)`, `fmtDur(clip)`: change the param type to `DisplayClip` (fields `timelineStartSec`/`durationSec` are identical).
- `getSnapTargets`, `clipUnderPlayhead`, `onPointerUp` (the `props.clips.find(...)` for trim): replace `props.clips` with a flat list of all display clips:

```ts
const allDisplayClips = computed<DisplayClip[]>(() => lanes.value.flatMap(l => l.clips))
```

  Use `allDisplayClips.value` instead of `props.clips` in `getSnapTargets`, `clipUnderPlayhead`, and `onPointerUp`'s `find`.

- [ ] **Step 2: Branch clip rendering by kind in the template**

In the lane `v-for` for clips, replace the single waveform-container + label block with kind-aware content. Inside the clip `<div>` (the one with `@pointerdown … 'move'`), keep the two trim handles, but replace the middle (waveform + label) with:

```vue
          <!-- Audio: wavesurfer waveform -->
          <div
            v-if="clip.kind === 'audio'"
            :ref="(el) => { if (el) { waveContainers[clip.clipId] = el as HTMLElement; mountWaveform(clip.clipId, clip.r2_key as string, el as HTMLElement) } }"
            class="absolute inset-0 pointer-events-none overflow-hidden"
          />
          <!-- Video: icon strip -->
          <div v-else-if="clip.kind === 'video'" class="absolute inset-0 flex items-center gap-1 px-2 pointer-events-none">
            <UIcon :name="clip.baseSource === 'still_kenburns' ? 'i-lucide-image' : 'i-lucide-film'" class="size-3.5 text-inverted/80" />
          </div>
          <!-- Overlay: badge dots -->
          <div v-else class="absolute inset-0 flex items-center gap-1 px-2 pointer-events-none">
            <UIcon name="i-lucide-shapes" class="size-3.5 text-inverted/80" />
          </div>

          <!-- Clip label -->
          <span class="relative z-10 truncate px-2 text-xs font-medium text-inverted ml-1">
            {{ clip.label }} · {{ fmtDur(clip) }}
          </span>
```

Update the clip block's background class to colour-code kinds (replace the `lane.muted ? 'bg-muted' : 'bg-primary'` entry):

```ts
            clip.kind === 'video' ? 'bg-blue-600 dark:bg-blue-500'
              : clip.kind === 'overlay' ? 'bg-fuchsia-600 dark:bg-fuchsia-500'
              : lane.muted ? 'bg-muted' : 'bg-primary',
```

In the waveform reactive `watch` (lines 364-381) and `mountWaveform`, guard to audio clips only:

```ts
    for (const [clipId, el] of Object.entries(waveContainers.value)) {
      const clip = allDisplayClips.value.find(c => c.clipId === clipId)
      if (clip && clip.kind === 'audio' && clip.r2_key && el) mountWaveform(clipId, clip.r2_key, el)
    }
```

and in the destroy loop replace `props.clips.map(c => c.clipId)` with `allDisplayClips.value.map(c => c.clipId)`.

- [ ] **Step 3: Type the rect/fmtDur params**

```ts
function rect(clip: DisplayClip) { const fallback = Math.max(0, props.duration - clip.timelineStartSec); return clipRect(clip, internalPxPerSec.value, fallback) }
function fmtDur(clip: DisplayClip) { const fallback = Math.max(0, props.duration - clip.timelineStartSec); const d = clip.durationSec ?? fallback; return `${d.toFixed(1)}s` }
```

- [ ] **Step 4: Manually verify audio + AV rendering**

Run: `pnpm exec nuxt prepare && pnpm exec vitest run test/audio/`
Expected: tests PASS. (Visual verification happens in Task 14's UAT.)

- [ ] **Step 5: Commit**

```bash
git add app/components/media/MediaTimeline.client.vue
git commit -m "feat(video): MediaTimeline renders video + overlay lanes via DisplayClip"
```

---

## Task 11: MediaAvPreview.client.vue — canvas base compositor + overlay iframe

A new client-only component that draws the active footage/still to a `<canvas>` (frame-accurate, with ken-burns) and stacks the active overlay's GSAP `<iframe>` on top, both slaved to the `currentTime` prop. No second rAF — it renders reactively off `currentTime` (the parent's rAF already updates it every frame during playback) and manages `<video>` play/pause via the `isPlaying` prop.

**Files:**
- Create: `app/components/media/MediaAvPreview.client.vue`

- [ ] **Step 1: Write the component**

Create `app/components/media/MediaAvPreview.client.vue`:

```vue
<script setup lang="ts">
// MediaAvPreview.client.vue — frame-accurate AV preview. Base layer (footage + ken-burns
// stills) is composited onto a <canvas> via drawImage; the GSAP overlay is an <iframe>
// stacked on top, seeked to the same clock. Slaved to the `currentTime` prop (the editor's
// rAF updates it each frame during playback); <video> elements play/pause via `isPlaying`.
// The V1.2 server render remains authoritative for final pixels.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { buildBannerHTML } from '~~/app/utils/banner-html-builder'
import { fitRect, kenBurnsTransformAt, activeVisualClipAt, extractBannerLayers } from '~~/app/utils/video/composite'

const props = defineProps<{
  timeline: TimelineState
  currentTime: number
  isPlaying: boolean
  /** r2_key → presigned URL (from the editor's sources map) */
  sources: Record<string, string>
}>()

const W = computed(() => props.timeline.width ?? 1080)
const H = computed(() => props.timeline.height ?? 1920)
const aspect = computed(() => `${W.value} / ${H.value}`)

const canvasRef = ref<HTMLCanvasElement | null>(null)

// ─── Source elements (created lazily, keyed by clipId) ──────────────────────────
const videoEls = new Map<string, HTMLVideoElement>()
const imgEls = new Map<string, HTMLImageElement>()

const videoClips = computed(() =>
  props.timeline.tracks.filter(t => t.kind === 'video').flatMap(t => t.clips as any[])
)
const overlayClips = computed(() =>
  props.timeline.tracks.filter(t => t.kind === 'overlay').flatMap(t => t.clips as any[])
)

function getVideoEl(clip: any): HTMLVideoElement | null {
  const url = props.sources[clip.r2_key]
  if (!url) return null
  let el = videoEls.get(clip.id)
  if (!el) {
    el = document.createElement('video')
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'
    el.src = url
    videoEls.set(clip.id, el)
  } else if (el.src !== url) {
    el.src = url
  }
  return el
}

function getImgEl(clip: any): HTMLImageElement | null {
  const url = props.sources[clip.r2_key]
  if (!url) return null
  let el = imgEls.get(clip.id)
  if (!el) { el = new Image(); el.crossOrigin = 'anonymous'; el.src = url; imgEls.set(clip.id, el) }
  return el
}

// ─── Base-layer draw ────────────────────────────────────────────────────────────
function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W.value, H.value)

  const active = activeVisualClipAt(videoClips.value, props.currentTime)
  if (!active) return
  const local = props.currentTime - active.timeline_start_sec

  if (active.base_source === 'still_kenburns') {
    const img = getImgEl(active)
    if (!img || !img.complete || img.naturalWidth === 0) return
    const kb = active.kenburns ?? { zoom_from: 1, zoom_to: 1.1, pan_from: [0, 0], pan_to: [0, 0] }
    const { zoom, panX, panY } = kenBurnsTransformAt(kb, local, active.duration_sec)
    const base = fitRect(img.naturalWidth, img.naturalHeight, W.value, H.value)
    const dw = base.width * zoom, dh = base.height * zoom
    const dx = base.x - (dw - base.width) / 2 - panX
    const dy = base.y - (dh - base.height) / 2 - panY
    ctx.drawImage(img, dx, dy, dw, dh)
  } else {
    const v = getVideoEl(active)
    if (!v || v.readyState < 2 || v.videoWidth === 0) return
    const r = fitRect(v.videoWidth, v.videoHeight, W.value, H.value)
    ctx.drawImage(v, r.x, r.y, r.width, r.height)
  }
}

// Re-draw whenever the clock moves (parent rAF drives this every frame while playing).
watch(() => props.currentTime, () => { draw(); syncVideoSeek(); syncOverlays() })

// ─── Footage play/pause + seek sync ─────────────────────────────────────────────
function syncVideoSeek() {
  const active = activeVisualClipAt(videoClips.value, props.currentTime)
  for (const clip of videoClips.value) {
    const el = videoEls.get(clip.id)
    if (!el) continue
    const isActive = active?.id === clip.id
    if (!isActive) { if (!el.paused) el.pause(); continue }
    if (active.base_source === 'still_kenburns') continue
    const want = (props.currentTime - clip.timeline_start_sec) + (clip.source_in_sec ?? 0)
    if (!props.isPlaying) {
      // Scrubbing: seek and redraw on the seeked frame.
      if (Math.abs(el.currentTime - want) > 0.05) { el.onseeked = () => { draw(); el.onseeked = null }; el.currentTime = Math.max(0, want) }
    } else if (el.paused) {
      if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = Math.max(0, want)
      void el.play().catch(() => {})
    }
  }
}

watch(() => props.isPlaying, (playing) => {
  if (!playing) { for (const el of videoEls.values()) if (!el.paused) el.pause() }
  else syncVideoSeek()
})

// ─── Overlay iframes ─────────────────────────────────────────────────────────────
const overlayHtml = ref<Record<string, string>>({})   // clipId → srcdoc
const overlayRefs = ref<Record<string, HTMLIFrameElement | null>>({})

async function buildOverlayHtmlFor(clip: any) {
  if (overlayHtml.value[clip.id]) return
  try {
    const proj = await $fetch<{ canvasData: Record<string, { layers?: unknown[] }> }>(`/api/agency/banner-studio/projects/${clip.gsap_project_id}`)
    const fmtKey = clip.gsap_format_key || Object.keys(proj.canvasData ?? {})[0]
    if (!fmtKey) return
    const layers = extractBannerLayers(proj.canvasData, fmtKey) as any
    overlayHtml.value = { ...overlayHtml.value, [clip.id]: buildBannerHTML(fmtKey, layers, { includeAnimations: true }) }
  } catch { /* overlay just won't preview */ }
}

watch(overlayClips, (clips) => { for (const c of clips) void buildOverlayHtmlFor(c) }, { immediate: true, deep: true })

function gsapTimelineOf(iframe: HTMLIFrameElement | null): any {
  const w = iframe?.contentWindow as any
  try { return w?.gsap?.globalTimeline?.getChildren?.(false)?.[0] ?? null } catch { return null }
}

function syncOverlays() {
  for (const clip of overlayClips.value) {
    const iframe = overlayRefs.value[clip.id]
    const tl = gsapTimelineOf(iframe)
    if (!tl) continue
    const isActive = props.currentTime >= clip.timeline_start_sec && props.currentTime < clip.timeline_start_sec + clip.duration_sec
    if (!isActive) continue
    try { tl.pause(); tl.seek(Math.max(0, props.currentTime - clip.timeline_start_sec)) } catch { /* not ready */ }
  }
}

function overlayActive(clip: any): boolean {
  return props.currentTime >= clip.timeline_start_sec && props.currentTime < clip.timeline_start_sec + clip.duration_sec
}

function onOverlayLoad(clip: any) {
  const tl = gsapTimelineOf(overlayRefs.value[clip.id])
  if (tl) { try { tl.pause(); tl.seek(Math.max(0, props.currentTime - clip.timeline_start_sec)) } catch { /* noop */ } }
}

onMounted(() => { draw() })
onBeforeUnmount(() => {
  for (const el of videoEls.values()) { try { el.pause(); el.removeAttribute('src'); el.load() } catch { /* noop */ } }
  videoEls.clear(); imgEls.clear()
})
</script>

<template>
  <div class="relative mx-auto bg-black rounded-lg overflow-hidden border border-default"
       :style="{ aspectRatio: aspect, maxHeight: '60vh' }">
    <canvas
      ref="canvasRef"
      :width="W"
      :height="H"
      class="absolute inset-0 h-full w-full object-contain"
    />
    <!-- Overlay iframes stacked on top, sized to the frame -->
    <template v-for="clip in overlayClips" :key="clip.id">
      <iframe
        v-if="overlayHtml[clip.id]"
        v-show="overlayActive(clip)"
        :ref="(el) => { overlayRefs[clip.id] = el as HTMLIFrameElement | null }"
        :srcdoc="overlayHtml[clip.id]"
        :style="{ opacity: clip.opacity ?? 1 }"
        class="absolute inset-0 h-full w-full border-0 pointer-events-none"
        sandbox="allow-scripts allow-same-origin"
        @load="onOverlayLoad(clip)"
      />
    </template>
    <!-- Empty state -->
    <div v-if="!videoClips.length && !overlayClips.length"
         class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
      <UIcon name="i-lucide-clapperboard" class="size-8" />
      <p class="text-sm">Add footage, a still, or an overlay to preview</p>
    </div>
  </div>
</template>
```

> Note: `buildBannerHTML` is in `app/utils/banner-html-builder.ts` (already importable client-side). The overlay `<iframe>` uses `srcdoc` with `sandbox="allow-scripts allow-same-origin"` so `contentWindow.gsap` is reachable for seeking, matching the Banner Thumbnail precedent.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec nuxt prepare`
Expected: completes (component is auto-imported as `MediaAvPreview`).

- [ ] **Step 3: Commit**

```bash
git add app/components/media/MediaAvPreview.client.vue
git commit -m "feat(video): MediaAvPreview canvas compositor + clock-synced overlay iframe"
```

---

## Task 12: MediaOverlayPicker.vue — pick a Banner project + format

**Files:**
- Create: `app/components/media/MediaOverlayPicker.vue`

- [ ] **Step 1: Write the component**

Create `app/components/media/MediaOverlayPicker.vue`:

```vue
<script setup lang="ts">
// MediaOverlayPicker.vue — USlideover to pick a Banner Studio project + a format key for an
// overlay clip. Emits pick({ gsapProjectId, gsapFormatKey }). Format keys come from the
// project's canvasData object keys.
import { ref, computed } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', payload: { gsapProjectId: string; gsapFormatKey: string; projectName: string }): void
}>()

interface BannerProject { id: string; name: string; clientName?: string; canvasData: Record<string, unknown>; thumbnailUrl: string | null }

const { data, pending, refresh } = useFetch('/api/agency/banner-studio/projects', { query: { limit: 100 }, lazy: true })
const projects = computed((): BannerProject[] => (data.value as any)?.projects ?? (data.value as any) ?? [])

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return projects.value
  return projects.value.filter(p => (p.name ?? '').toLowerCase().includes(q))
})

const selectedId = ref<string | null>(null)
const selectedFormat = ref<string | null>(null)

function formatsFor(p: BannerProject): string[] { return Object.keys(p.canvasData ?? {}) }

function selectProject(p: BannerProject) {
  selectedId.value = p.id
  selectedFormat.value = formatsFor(p)[0] ?? null
}

function confirm() {
  const p = projects.value.find(x => x.id === selectedId.value)
  if (!p || !selectedFormat.value) return
  emit('pick', { gsapProjectId: p.id, gsapFormatKey: selectedFormat.value, projectName: p.name })
  emit('update:open', false)
  selectedId.value = null; selectedFormat.value = null
}
</script>

<template>
  <USlideover :open="open" title="Add overlay" description="Pick a Banner Studio project and a format to overlay on the video." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-4 h-full min-h-0">
        <div class="flex gap-2">
          <UInput v-model="search" placeholder="Search banner projects…" icon="i-lucide-search" size="sm" class="flex-1" />
          <UButton icon="i-lucide-refresh-cw" variant="ghost" color="neutral" size="sm" :loading="pending" aria-label="Refresh" @click="refresh()" />
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-0.5">
          <div v-if="pending && !projects.length" class="space-y-2">
            <USkeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
          </div>
          <UAlert v-else-if="!filtered.length" color="neutral" variant="subtle" icon="i-lucide-inbox" title="No banner projects" description="Create one in Banner Studio first." />

          <div v-for="p in filtered" :key="p.id"
               class="rounded-lg border bg-elevated p-3 transition-colors"
               :class="selectedId === p.id ? 'border-primary ring-1 ring-primary' : 'border-default hover:border-primary/50'">
            <button class="flex w-full items-center gap-3 text-left" @click="selectProject(p)">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <UIcon name="i-lucide-shapes" class="size-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ p.name }}</p>
                <p v-if="p.clientName" class="truncate text-xs text-muted">{{ p.clientName }}</p>
              </div>
              <UBadge :label="`${formatsFor(p).length} formats`" size="xs" variant="subtle" color="neutral" />
            </button>

            <!-- Format chooser for the selected project -->
            <div v-if="selectedId === p.id" class="mt-3 flex flex-wrap gap-1.5">
              <UButton v-for="fk in formatsFor(p)" :key="fk" :label="fk" size="xs"
                       :variant="selectedFormat === fk ? 'solid' : 'soft'"
                       :color="selectedFormat === fk ? 'primary' : 'neutral'"
                       @click="selectedFormat = fk" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-default pt-3">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="emit('update:open', false)" />
          <UButton color="primary" label="Add overlay" :disabled="!selectedId || !selectedFormat" @click="confirm" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
```

> The list endpoint returns either `{ projects: [...] }` or a bare array depending on the handler; the `projects` computed handles both. Verify the actual shape of `/api/agency/banner-studio/projects` (index.get.ts) during wiring and simplify if it's consistent.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec nuxt prepare`
Expected: completes (auto-imported as `MediaOverlayPicker`).

- [ ] **Step 3: Commit**

```bash
git add app/components/media/MediaOverlayPicker.vue
git commit -m "feat(video): MediaOverlayPicker — banner project + format picker"
```

---

## Task 13: MediaMediaPicker.vue — footage / still upload

**Files:**
- Create: `app/components/media/MediaMediaPicker.vue`

- [ ] **Step 1: Write the component**

Create `app/components/media/MediaMediaPicker.vue`:

```vue
<script setup lang="ts">
// MediaMediaPicker.vue — USlideover to upload footage (video) or a still (image) into the
// AV editor. Emits uploaded({ r2Key, durationSec, baseSource }) after a successful upload so
// the page can add the clip at the playhead.
import { ref } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'uploaded', payload: { r2Key: string; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }): void
}>()

const uploader = defineModel<((file: File, kind: 'footage' | 'still') => Promise<{ r2Key: string; url: string; durationSec: number }>) | null>('uploader', { default: null })

const kind = ref<'footage' | 'still'>('footage')
const uploading = ref(false)
const error = ref<string | null>(null)
const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)

const KIND_OPTIONS = [
  { label: 'Footage (video)', value: 'footage' },
  { label: 'Still (image)', value: 'still' }
]

function pickFile() { fileInput.value?.click() }

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''                       // allow re-picking the same file
  if (!file || !uploader.value) return
  uploading.value = true; error.value = null
  try {
    const res = await uploader.value(file, kind.value)
    emit('uploaded', { r2Key: res.r2Key, durationSec: res.durationSec, baseSource: kind.value === 'footage' ? 'uploaded_footage' : 'still_kenburns' })
    toast.add({ title: 'Media added', color: 'success' })
    emit('update:open', false)
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Upload failed'
    toast.add({ title: 'Upload failed', description: error.value ?? '', color: 'error' })
  } finally {
    uploading.value = false
  }
}

const accept = () => (kind.value === 'footage' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp')
</script>

<template>
  <USlideover :open="open" title="Add footage or still" description="Upload a video clip or an image (ken-burns) to the timeline." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Media type">
          <USelect v-model="kind" :items="KIND_OPTIONS" value-key="value" />
        </UFormField>

        <UButton
          icon="i-lucide-upload"
          :label="uploading ? 'Uploading…' : (kind === 'footage' ? 'Choose a video file' : 'Choose an image file')"
          color="primary"
          block
          :loading="uploading"
          @click="pickFile"
        />
        <input ref="fileInput" type="file" class="hidden" :accept="accept()" @change="onFile" >

        <p class="text-xs text-muted">
          {{ kind === 'footage' ? 'MP4, WebM or MOV up to 500MB.' : 'JPEG, PNG or WebP up to 50MB. Stills animate with a ken-burns move.' }}
        </p>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="error" />
      </div>
    </template>
  </USlideover>
</template>
```

> `uploader` is passed in from the page (the composable's `uploadMedia`) via `v-model:uploader` so the component stays free of `projectId` plumbing. If `defineModel` for a function prop is awkward in this Nuxt UI version, switch to a plain `prop` named `uploader` (function type) — same call site.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec nuxt prepare`
Expected: completes (auto-imported as `MediaMediaPicker`).

- [ ] **Step 3: Commit**

```bash
git add app/components/media/MediaMediaPicker.vue
git commit -m "feat(video): MediaMediaPicker — footage/still upload slideover"
```

---

## Task 14: Editor page — AV preview pane, add-menu, render button + jobs panel

Wire everything into `app/pages/agency/audio/projects/[id].vue`: show the `MediaAvPreview` above the timeline for AV projects, add an "Add" dropdown (audio / footage·still / overlay), and a gated "Render video" button + a jobs panel.

**Files:**
- Modify: `app/pages/agency/audio/projects/[id].vue`

- [ ] **Step 1: Add AV state, handlers, and the flag**

In `<script setup>`:

```ts
const config = useRuntimeConfig()
const videoStudioEnabled = computed(() => Boolean((config.public as any).videoStudioEnabled))
const isAv = computed(() => editor.mediaType.value === 'av')

// Pickers
const overlayPickerOpen = ref(false)
const mediaPickerOpen = ref(false)

function onOverlayPick(p: { gsapProjectId: string; gsapFormatKey: string }) {
  editor.addOverlayClipAction(p.gsapProjectId, p.gsapFormatKey, 5, editor.currentTime.value)
}
function onMediaUploaded(p: { r2Key: string; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }) {
  editor.addVideoClipAction(p.r2Key, p.durationSec, p.baseSource, editor.currentTime.value)
}

// Render
const renderToast = useToast()
async function onRenderVideo() {
  const res = await editor.renderVideoAction()
  if (res.ok) renderToast.add({ title: 'Render queued', description: 'Your video is rendering.', color: 'success' })
  else if (res.flagOff) renderToast.add({ title: 'Video rendering is disabled', description: 'Ask an admin to enable VIDEO_STUDIO_ENABLED.', color: 'warning' })
  else renderToast.add({ title: 'Failed to queue render', color: 'error' })
}

function jobStatusColor(s: string) { return s === 'done' ? 'success' : s === 'failed' ? 'error' : 'info' }

onMounted(() => { if (isAv.value) void editor.refreshRenderJobs() })
```

(Ensure `ref`, `computed`, `onMounted` are imported — they already are.)

- [ ] **Step 2: Add the preview pane + add-menu to the template**

Inside the `<template v-else-if="editor.status.value === 'ready' && editor.timeline.value">` block, BEFORE the `<MediaTimeline …>`, add the preview pane (AV only):

```vue
        <!-- AV preview (frame-accurate compositor) -->
        <MediaAvPreview
          v-if="isAv"
          :timeline="editor.timeline.value"
          :current-time="editor.currentTime.value"
          :is-playing="editor.isPlaying.value"
          :sources="editor.sources.value"
        />
```

Replace the single "Add clip" button in the edit toolbar with an Add dropdown for AV (keep the plain button for audio). Replace the existing `<!-- Add clip -->` `UButton` with:

```vue
        <!-- Add (audio: single button; AV: menu) -->
        <UButton
          v-if="!isAv"
          icon="i-lucide-plus-circle" size="sm" variant="soft" color="primary" label="Add clip"
          @click="pickerOpen = true"
        />
        <UDropdownMenu
          v-else
          :items="[[
            { label: 'Audio clip', icon: 'i-lucide-music', onSelect: () => { pickerOpen = true } },
            { label: 'Footage / still', icon: 'i-lucide-film', onSelect: () => { mediaPickerOpen = true } },
            { label: 'Overlay', icon: 'i-lucide-shapes', onSelect: () => { overlayPickerOpen = true } }
          ]]"
        >
          <UButton icon="i-lucide-plus-circle" size="sm" variant="soft" color="primary" label="Add" trailing-icon="i-lucide-chevron-down" />
        </UDropdownMenu>

        <!-- Render video (AV only; gated) -->
        <UButton
          v-if="isAv && videoStudioEnabled"
          icon="i-lucide-clapperboard" size="sm" variant="soft" color="primary" label="Render video"
          :loading="editor.rendering.value"
          @click="onRenderVideo"
        />
        <UTooltip v-else-if="isAv" text="Video rendering is disabled (VIDEO_STUDIO_ENABLED off)">
          <UButton icon="i-lucide-clapperboard" size="sm" variant="ghost" color="neutral" label="Render video" disabled />
        </UTooltip>
```

After the transport bar (after its closing `</div>`), add the jobs panel (AV only):

```vue
        <!-- Render jobs (AV) -->
        <div v-if="isAv && editor.renderJobs.value.length" class="rounded-lg border border-default bg-elevated p-3 space-y-2">
          <p class="text-xs font-medium text-muted">Render jobs</p>
          <div v-for="job in editor.renderJobs.value" :key="job.id" class="flex items-center gap-3 text-sm">
            <UBadge :label="job.status" size="xs" variant="subtle" :color="jobStatusColor(job.status)" />
            <span class="text-muted tabular-nums">{{ new Date(job.createdAt).toLocaleString() }}</span>
            <span v-if="job.error" class="text-error truncate">{{ job.error }}</span>
            <div class="ml-auto flex gap-2">
              <UButton v-for="(key, fmt) in (job.variants || {})" :key="fmt" :label="String(fmt)" size="xs" variant="soft" color="neutral"
                       :to="`/api/_uploads/${key}`" target="_blank" />
            </div>
          </div>
        </div>
```

Finally, add the two new pickers near the existing `<MediaAssetPicker …>` at the end of the template:

```vue
  <!-- Footage / still uploader -->
  <MediaMediaPicker v-model:open="mediaPickerOpen" :uploader="editor.uploadMedia" @uploaded="onMediaUploaded" />

  <!-- Overlay picker -->
  <MediaOverlayPicker v-model:open="overlayPickerOpen" @pick="onOverlayPick" />
```

> The variant download links use `/api/_uploads/<key>` for the local/dev fallback. When R2 is configured, swap to a presigned-URL fetch (a small `renders/[jobId].get.ts` that presigns `variants` is a clean V1.4 follow-up); for V1.3 the dev path is sufficient to confirm the job pipeline.

- [ ] **Step 3: Update the page header copy for AV**

Change the subtitle line to branch:

```vue
          <p class="text-sm text-muted">{{ isAv ? 'Video editor — assemble footage, stills, overlays and audio, then render.' : 'Multitrack editor — drag, trim, slice, and layer your clips.' }}</p>
```

- [ ] **Step 4: Verify it compiles + full audio suite**

Run: `pnpm exec nuxt prepare && pnpm exec vitest run test/audio/ test/video/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/agency/audio/projects/\[id\].vue
git commit -m "feat(video): AV editor page — preview pane, add-menu, gated render + jobs panel"
```

---

## Task 15: Projects index — "New video project"

**Files:**
- Modify: `app/pages/agency/audio/projects/index.vue`

- [ ] **Step 1: Add an AV-create path**

In `<script setup>`, add a project-kind ref and update `createProject` to send `mediaType`:

```ts
const newKind = ref<'audio' | 'av'>('audio')

async function createProject() {
  if (creating.value) return
  creating.value = true
  try {
    const body: Record<string, unknown> = { title: newTitle.value.trim() || null, mediaType: newKind.value }
    // Audio seeds two empty lanes; AV is auto-seeded server-side via emptyAvTimeline().
    if (newKind.value === 'audio') body.initialState = defaultTimelineState()
    const res = await $fetch<{ project: MediaProject }>('/api/agency/audio/projects', { method: 'POST', body })
    toast.add({ title: 'Project created', color: 'success' })
    createOpen.value = false; newTitle.value = ''; newKind.value = 'audio'
    await navigateTo(`/agency/audio/projects/${res.project.id}`)
  } catch (e: any) {
    toast.add({ title: 'Failed to create project', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    creating.value = false
  }
}
```

- [ ] **Step 2: Add the kind selector + retitle the modal**

In the create modal, add a kind selector above the title field and make the modal title generic:

```vue
  <UModal v-model:open="createOpen" title="New project">
    <template #content>
      <div class="p-4 space-y-4">
        <UFormField label="Project type">
          <USelect
            v-model="newKind"
            :items="[{ label: 'Audio (multitrack)', value: 'audio' }, { label: 'Video (footage + overlay)', value: 'av' }]"
            value-key="value"
          />
        </UFormField>
        <UFormField label="Project title">
          <UInput v-model="newTitle" placeholder="e.g. Q3 Radio Campaign" autofocus @keydown.enter="createProject" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="createOpen = false" />
          <UButton color="primary" label="Create project" :loading="creating" @click="createProject" />
        </div>
      </div>
    </template>
  </UModal>
```

Optionally update the page header subtitle to "Multitrack audio + video timeline sessions".

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec nuxt prepare`
Expected: completes.

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/audio/projects/index.vue
git commit -m "feat(video): projects list supports creating AV (video) projects"
```

---

## Task 16: Final review — full test run, audio regression, typecheck

- [ ] **Step 1: Run the complete media/video test surface**

Run: `pnpm exec vitest run test/audio/ test/video/`
Expected: all PASS, including the pre-existing audio suite (zero regression).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec nuxt prepare && pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.json 2>&1 | tail -20`
Expected: no NEW errors attributable to the new/changed files (the repo has ~60 pre-existing `index.d.ts` errors — compare against `git stash`-clean if unsure; do not fix pre-existing ones).

- [ ] **Step 3: Self-review against the spec**

Re-read `docs/superpowers/specs/2026-06-09-video-v1-3-av-editor-ui-design.md` §4–§6 and confirm each is delivered:
- AV create/open ✓ (Task 15, index.post already seeds AV)
- video + overlay lanes ✓ (Tasks 5, 10)
- frame-accurate compositor preview ✓ (Tasks 6, 11) — note: overlay is a clock-synced DOM layer, not canvas-rasterized (documented above)
- footage/stills upload + overlay picker ✓ (Tasks 8, 12, 13)
- "Render video" + job polling ✓ (Tasks 9, 14), gated to the render button only (Task 7)
- zero audio regression ✓ (planner/engine/collectClipKeys all keep audio + legacy paths; audio suite green)

- [ ] **Step 4: Manual UAT checklist (operator/author, browser)**

With `VIDEO_STUDIO_ENABLED=true` locally and R2 configured (or the local `/api/_uploads` fallback):
1. Create a "Video" project → opens the AV editor with Video/Overlay/Voiceover/Music lanes + an empty preview.
2. Add → Footage: upload an MP4 → a blue clip appears on the Video lane; the preview shows the first frame.
3. Add → Still: upload an image → preview shows it; scrub the playhead → ken-burns moves.
4. Add → Overlay: pick a banner project + format → a fuchsia clip on the Overlay lane; scrub → the overlay animates in sync over the base.
5. Add → Audio clip: add a voiceover → waveform renders; press Play → audio plays, video + overlay advance together.
6. Move/trim a video and an overlay clip; undo/redo; confirm autosave "Saved".
7. Click "Render video" → toast "Render queued", a job row appears and polls to `done`/`failed`.
8. Open an existing **audio** project → behaves exactly as before (no preview pane, single "Add clip" button, no render button).

- [ ] **Step 5: Final verification note**

The container/queue render path itself is operator verify-live (per V1.2 memory): a real composite render must be eyeballed once `video-render` queues + the Chromium container are deployed and `VIDEO_STUDIO_ENABLED` is flipped. V1.3 wires and queues correctly; it does not change the V1.2 render internals.

---

## Notes / deferred

- **Marketing coming-soon entry:** deferred to V1.4 launch per the roadmap (no coming-soon status pattern exists on the marketing pages yet).
- **Per-format overlay aspect:** still the V1.2b follow-up (the render resolves one overlay HTML from `formats[0]`); unaffected by V1.3.
- **Footage/overlay slice:** audio-only in V1.3 (guarded). Splitting footage is a small additive follow-up (a `sliceVisualClip` helper).
- **Render variant download:** uses the `/api/_uploads` dev path; a presigned `renders/[jobId].get.ts` is a clean V1.4 addition.
