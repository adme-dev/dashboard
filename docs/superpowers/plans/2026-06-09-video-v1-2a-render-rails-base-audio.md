# Video V1.2a — Render rails + base/audio composite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render an AV timeline's base (footage + `still_kenburns`) + audio bed to an MP4 in R2 via a `video-render` Queue + Container + endpoint over the audio-jobs rails. Overlay tracks ignored (V1.2b). Flag-gated/dormant. No migration.

**Architecture:** Mirror the SP1 audio render spine. New pure `videoCompositeGraph` builder (folds in the existing audio filtergraph for the audio bed via input-index offset), `videoProfiles`, a `/render-composite` container route, a DI worker orchestrator + `video-render` queue branch, queue wiring, and a flag-gated `render-video` endpoint reusing `createRenderJob`.

**Tech Stack:** TypeScript, Zod, Vitest, ffmpeg, Cloudflare Queues/Containers. Tests under `test/audio/` (repo default vitest config). Run a file: `pnpm exec vitest run test/audio/<file>.test.ts`.

**Spec:** `docs/superpowers/specs/2026-06-09-video-v1-2a-render-rails-base-audio-design.md`
**Worktree:** branch `worktree-video-studio-v1`, worktree `.claude/worktrees/video-studio-v1`.

**Verify-live note (carry into the slice):** like SP1, the pure builder is verified by **arg-shape tests** (the filtergraph string structure); true ffmpeg correctness on a real multi-clip render is an **operator verify-live item** when the queue/container is activated. Do not claim a real render works — only that the args are well-formed and the suite is green.

---

## Task 1: `videoProfiles.ts` (pure, TDD)

**Files:** Create `server/utils/audio/videoProfiles.ts`, Test `test/audio/videoProfiles.test.ts`

- [ ] **Step 1: Failing test** — `test/audio/videoProfiles.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { videoFormatFor, DEFAULT_VIDEO_FORMATS } from '~~/server/utils/audio/videoProfiles'

describe('videoFormatFor', () => {
  it('returns the reels 9:16 profile', () => {
    const f = videoFormatFor('reels_9x16')!
    expect(f.width).toBe(1080); expect(f.height).toBe(1920); expect(f.fps).toBe(30); expect(f.codec).toBe('h264')
  })
  it('returns square and youtube profiles', () => {
    expect(videoFormatFor('square_1x1')!.width).toBe(1080)
    expect(videoFormatFor('square_1x1')!.height).toBe(1080)
    expect(videoFormatFor('youtube_16x9')!.width).toBe(1920)
    expect(videoFormatFor('youtube_16x9')!.height).toBe(1080)
  })
  it('returns null for unknown and applies overrides', () => {
    expect(videoFormatFor('nope')).toBeNull()
    expect(videoFormatFor('reels_9x16', { fps: 25 })!.fps).toBe(25)
  })
  it('has three default formats', () => {
    expect(Object.keys(DEFAULT_VIDEO_FORMATS)).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run → fail** — `pnpm exec vitest run test/audio/videoProfiles.test.ts`

- [ ] **Step 3: Implement** — `server/utils/audio/videoProfiles.ts`:
```ts
// Per-format video output profiles. Mirrors profiles.ts (audio). Pure.
export type VideoFormatKey = 'reels_9x16' | 'square_1x1' | 'youtube_16x9'

export interface VideoFormat {
  format: VideoFormatKey
  codec: 'h264'
  width: number
  height: number
  fps: number
  videoBitrate: string     // ffmpeg -b:v
  audioLufs: number        // social default -14 (applied in a later loudness pass; recorded here)
  maxDurationSec: number | null
}

export const DEFAULT_VIDEO_FORMATS: Record<VideoFormatKey, VideoFormat> = {
  reels_9x16:   { format: 'reels_9x16',   codec: 'h264', width: 1080, height: 1920, fps: 30, videoBitrate: '8M', audioLufs: -14, maxDurationSec: 90 },
  square_1x1:   { format: 'square_1x1',   codec: 'h264', width: 1080, height: 1080, fps: 30, videoBitrate: '8M', audioLufs: -14, maxDurationSec: null },
  youtube_16x9: { format: 'youtube_16x9', codec: 'h264', width: 1920, height: 1080, fps: 30, videoBitrate: '12M', audioLufs: -14, maxDurationSec: null }
}

export function videoFormatFor(key: string, overrides?: Partial<VideoFormat>): VideoFormat | null {
  const base = DEFAULT_VIDEO_FORMATS[key as VideoFormatKey]
  if (!base) return null
  return overrides ? { ...base, ...overrides } : { ...base }
}
```

- [ ] **Step 4: Run → pass** — `pnpm exec vitest run test/audio/videoProfiles.test.ts`
- [ ] **Step 5: Commit** — `git add server/utils/audio/videoProfiles.ts test/audio/videoProfiles.test.ts && git commit -m "feat(video): video output format profiles"`

---

## Task 2: `videoCompositeGraph.ts` — the AV composite builder (pure, TDD) ⭐ the core

**Files:** Create `server/utils/audio/videoCompositeGraph.ts`, Test `test/audio/videoCompositeGraph.test.ts`

This builder composes a base-video chain (positioned footage/stills on a black canvas) with the **reused audio filtergraph** (input indices offset after the video inputs). Tests pin the arg shape.

- [ ] **Step 1: Failing tests** — `test/audio/videoCompositeGraph.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { buildCompositePlan, buildCompositeRenderArgs } from '~~/server/utils/audio/videoCompositeGraph'

const profile = videoFormatFor('reels_9x16')!

function avState() {
  return TimelineStateSchema.parse({
    schema_version: 2, media_type: 'av',
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', clips: [
        { type: 'video', id: 'f1', r2_key: 'media/f1.mp4', timeline_start_sec: 0, duration_sec: 6, source_in_sec: 2, source_out_sec: 8, base_source: 'uploaded_footage' },
        { type: 'video', id: 's1', r2_key: 'media/s1.jpg', timeline_start_sec: 6, duration_sec: 4, base_source: 'still_kenburns', kenburns: { zoom_from: 1, zoom_to: 1.2 } }
      ] },
      { id: 'ovl', name: 'Overlay', kind: 'overlay', clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 10, gsap_project_id: 'b1' }
      ] },
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a1', r2_key: 'audio/vo.mp3', timeline_start_sec: 0, source_out_sec: 10 }
      ] },
      { id: 'music', name: 'Music', kind: 'music', clips: [
        { id: 'a2', r2_key: 'audio/music.mp3', timeline_start_sec: 0, source_out_sec: 10 }
      ] }
    ]
  })
}

describe('buildCompositePlan', () => {
  it('orders inputs as video-clips then audio-clips (overlay clips excluded)', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(p.inputs.map(i => i.r2_key)).toEqual(['media/f1.mp4', 'media/s1.jpg', 'audio/vo.mp3', 'audio/music.mp3'])
  })
  it('builds a black base canvas at the profile size/fps', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(p.filterComplex).toContain('color=c=black:s=1080x1920:r=30')
  })
  it('trims + scales footage and positions it by timeline_start', () => {
    const fc = buildCompositePlan(avState(), profile).filterComplex
    expect(fc).toContain('[0:v]trim=start=2:end=8')
    expect(fc).toContain('overlay=enable=\'between(t,0.000,6.000)\'')
  })
  it('uses zoompan for the still and positions it', () => {
    const fc = buildCompositePlan(avState(), profile).filterComplex
    expect(fc).toContain('[1:v]')
    expect(fc).toContain('zoompan')
    expect(fc).toContain('overlay=enable=\'between(t,6.000,10.000)\'')
  })
  it('outputs [vout] yuv420p', () => {
    expect(buildCompositePlan(avState(), profile).filterComplex).toContain('format=yuv420p[vout]')
  })
  it('folds in the audio filtergraph with input indices offset by the video count (2)', () => {
    const fc = buildCompositePlan(avState(), profile).filterComplex
    // audio inputs are ffmpeg inputs 2 and 3 → audio chain must reference [2:a]/[3:a], never [0:a]/[1:a]
    expect(fc).toContain('[2:a]')
    expect(fc).toContain('[3:a]')
    expect(fc).not.toMatch(/\[0:a\]|\[1:a\]/)
    expect(fc).toContain('[aout]')   // renamed from [mix]
  })
  it('exposes [vout] and [aout] labels', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(p.vLabel).toBe('[vout]'); expect(p.aLabel).toBe('[aout]')
  })
})

describe('buildCompositeRenderArgs', () => {
  it('maps both video and audio and encodes h264/aac per profile', () => {
    const p = buildCompositePlan(avState(), profile)
    const a = buildCompositeRenderArgs(p, ['f1','s1','vo','music'], 'out.mp4')
    expect(a.filter(x => x === '-map')).toHaveLength(2)
    expect(a[a.indexOf('-map') + 1]).toBe('[vout]')
    expect(a).toContain('libx264'); expect(a).toContain('aac')
    expect(a[a.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
    expect(a[a.length - 1]).toBe('out.mp4')
  })
  it('throws when inputPaths length != plan.inputs length', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(() => buildCompositeRenderArgs(p, ['only-one'], 'out.mp4')).toThrow()
  })
})
```

- [ ] **Step 2: Run → fail** — `pnpm exec vitest run test/audio/videoCompositeGraph.test.ts`

- [ ] **Step 3: Implement** — `server/utils/audio/videoCompositeGraph.ts`:
```ts
// PURE timeline → ffmpeg composite args (base video + audio bed). No I/O.
// Dual-imported by Nitro and the audio-jobs Container (.mjs port). Overlay tracks
// are IGNORED in V1.2a (V1.2b composites the alpha overlay layer).
import type { TimelineState } from './timelineSchema'
import { computeDuration } from './timelineSchema'
import { buildTimelineFiltergraph, type FiltergraphInput } from './timelineFiltergraph'
import type { VideoFormat } from './videoProfiles'

export interface CompositePlan {
  inputs: FiltergraphInput[]   // video-clip inputs first, then audio-clip inputs
  filterComplex: string
  vLabel: string               // '[vout]'
  aLabel: string | null        // '[aout]' or null when no audio tracks
  durationSec: number
  profile: VideoFormat
}

const AUDIO_KINDS = ['voiceover', 'music', 'sfx']

function kenburnsExpr(k: any, W: number, H: number, fps: number, dur: number): string {
  const zf = k?.zoom_from ?? 1, zt = k?.zoom_to ?? 1.1
  const frames = Math.max(1, Math.round(dur * fps))
  // linear zoom from zf→zt over the clip; centered. Pan kept simple in V1.2a.
  const step = ((zt - zf) / frames).toFixed(6)
  return `zoompan=z='${zf}+${step}*on':d=${frames}:s=${W}x${H}:fps=${fps}`
}

export function buildCompositePlan(state: TimelineState, profile: VideoFormat): CompositePlan {
  const W = profile.width, H = profile.height, fps = profile.fps
  const duration = computeDuration(state)

  // --- video base chain ---
  const videoInputs: FiltergraphInput[] = []
  const vChains: string[] = [`color=c=black:s=${W}x${H}:r=${fps}:d=${duration.toFixed(3)}[vb0]`]
  let baseLabel = 'vb0', baseN = 0, idx = 0

  for (const track of state.tracks.filter(t => t.kind === 'video' && !t.muted)) {
    for (const clip of track.clips as any[]) {
      const i = idx++
      videoInputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      const start = clip.timeline_start_sec, dur = clip.duration_sec
      const parts: string[] = []
      if (clip.base_source === 'still_kenburns') {
        parts.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, kenburnsExpr(clip.kenburns, W, H, fps, dur))
      } else {
        parts.push(
          clip.source_out_sec != null ? `trim=start=${clip.source_in_sec}:end=${clip.source_out_sec}` : `trim=start=${clip.source_in_sec}`,
          'setpts=PTS-STARTPTS',
          `scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`
        )
      }
      parts.push(`setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`)
      const clipLabel = `vc${i}`
      vChains.push(`[${i}:v]${parts.join(',')}[${clipLabel}]`)
      const outLabel = `vb${++baseN}`
      vChains.push(`[${baseLabel}][${clipLabel}]overlay=enable='between(t,${start.toFixed(3)},${(start + dur).toFixed(3)})'[${outLabel}]`)
      baseLabel = outLabel
    }
  }
  vChains.push(`[${baseLabel}]format=yuv420p[vout]`)

  // --- audio bed: reuse the audio filtergraph, offset its [k:a] inputs by V ---
  const V = videoInputs.length
  const audioState = { ...state, tracks: state.tracks.filter(t => AUDIO_KINDS.includes(t.kind)) } as TimelineState
  const audioPlan = buildTimelineFiltergraph(audioState)
  const hasAudio = audioPlan.inputs.length > 0
  const offsetAudio = hasAudio
    ? audioPlan.filterComplex.replace(/\[(\d+):a\]/g, (_m, n) => `[${Number(n) + V}:a]`).replace(/\[mix\]/g, '[aout]')
    : ''

  const filterComplex = [...vChains, offsetAudio].filter(Boolean).join(';')

  return {
    inputs: [...videoInputs, ...audioPlan.inputs],
    filterComplex,
    vLabel: '[vout]',
    aLabel: hasAudio ? '[aout]' : null,
    durationSec: duration,
    profile
  }
}

export function buildCompositeRenderArgs(plan: CompositePlan, inputPaths: string[], outputPath: string): string[] {
  if (inputPaths.length !== plan.inputs.length) {
    throw new Error(`inputPaths (${inputPaths.length}) must match plan.inputs (${plan.inputs.length})`)
  }
  const args = ['-hide_banner', '-nostats']
  for (const p of inputPaths) args.push('-i', p)
  args.push('-filter_complex', plan.filterComplex, '-map', plan.vLabel)
  if (plan.aLabel) args.push('-map', plan.aLabel)
  args.push('-r', String(plan.profile.fps), '-c:v', 'libx264', '-b:v', plan.profile.videoBitrate, '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (plan.aLabel) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push('-shortest', '-y', outputPath)
  return args
}
```

- [ ] **Step 4: Run → pass** — `pnpm exec vitest run test/audio/videoCompositeGraph.test.ts`
- [ ] **Step 5: Full audio suite (regression)** — `pnpm exec vitest run test/audio/`
- [ ] **Step 6: Commit** — `git add server/utils/audio/videoCompositeGraph.ts test/audio/videoCompositeGraph.test.ts && git commit -m "feat(video): pure AV composite builder (base video + reused audio bed)"`

---

## Task 3: `.mjs` container port + sync test

**Files:** Create `workers/audio-jobs/container/videoCompositeGraph.mjs`, `workers/audio-jobs/container/videoProfiles.mjs` (if the port needs the type — port only what the container uses), Test `test/audio/videoCompositeGraphSync.test.ts`

NOTE: the existing audio sync test is `test/audio/timelineFiltergraphSync.test.ts` — read it for the exact pattern. The container port must import the **already-ported** `timelineFiltergraph.mjs` (it exists) for the audio reuse, mirroring how the `.ts` imports `timelineFiltergraph.ts`.

- [ ] **Step 1: Write the `.mjs` port** — `workers/audio-jobs/container/videoCompositeGraph.mjs`: a hand-port of `videoCompositeGraph.ts` to plain JS (no types), importing `buildTimelineFiltergraph` from `./timelineFiltergraph.mjs` and taking `profile` as a plain object (no VideoFormat import needed — it's a runtime object). Keep `buildCompositePlan` + `buildCompositeRenderArgs` byte-identical in behavior.

- [ ] **Step 2: Write the sync/parity test** — `test/audio/videoCompositeGraphSync.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { buildCompositePlan as ts, buildCompositeRenderArgs as tsArgs } from '~~/server/utils/audio/videoCompositeGraph'
// @ts-expect-error — .mjs port, no types
import { buildCompositePlan as mjs, buildCompositeRenderArgs as mjsArgs } from '../../workers/audio-jobs/container/videoCompositeGraph.mjs'

const profile = videoFormatFor('reels_9x16')!
function av() {
  return TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [
    { id: 'vid', name: 'V', kind: 'video', clips: [
      { type: 'video', id: 'f1', r2_key: 'm/f.mp4', timeline_start_sec: 0, duration_sec: 5, base_source: 'uploaded_footage' }
    ] },
    { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
      { id: 'a1', r2_key: 'a/vo.mp3', timeline_start_sec: 0, source_out_sec: 5 }
    ] }
  ] })
}
describe('videoCompositeGraph .ts ↔ .mjs parity', () => {
  it('produces identical plans', () => {
    expect(mjs(av(), profile)).toEqual(ts(av(), profile))
  })
  it('produces identical args', () => {
    const p = ts(av(), profile)
    expect(mjsArgs(p, ['a', 'b'], 'o.mp4')).toEqual(tsArgs(p, ['a', 'b'], 'o.mp4'))
  })
})
```

- [ ] **Step 3: Run → pass** — `pnpm exec vitest run test/audio/videoCompositeGraphSync.test.ts` (fix the `.mjs` until parity holds)
- [ ] **Step 4: Commit** — `git add workers/audio-jobs/container/videoCompositeGraph.mjs test/audio/videoCompositeGraphSync.test.ts && git commit -m "feat(video): container .mjs port of composite builder + parity test"`

---

## Task 4: Container `/render-composite` route

**Files:** Modify `workers/audio-jobs/container/server.mjs`

Read the existing `/render-timeline` branch first for the exact `readBody`/temp-file/`runFfmpeg` helpers.

- [ ] **Step 1: Add the route** — after the `/render-timeline` branch, add:
```js
if (req.method === 'POST' && req.url === '/render-composite') {
  const payload = JSON.parse((await readBody(req)).toString('utf8')) // { plan, files: [{ b64 }] }
  const dir = mkdtempSync(join(tmpdir(), 'composite-'))
  try {
    const paths = payload.files.map((f, i) => {
      const p = join(dir, `in${i}`)
      writeFileSync(p, Buffer.from(f.b64, 'base64'))
      return p
    })
    const outPath = join(dir, 'out.mp4')
    const pass = await runFfmpeg(buildCompositeRenderArgs(payload.plan, paths, outPath))
    if (pass.code !== 0) { res.writeHead(500); return res.end('composite render failed') }
    const out = readFileSync(outPath)
    res.writeHead(200, { 'content-type': 'video/mp4' })
    return res.end(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
```
Add `import { buildCompositeRenderArgs } from './videoCompositeGraph.mjs'` at the top, and ensure `mkdtempSync`/`rmSync`/`tmpdir`/`join`/`writeFileSync`/`readFileSync` are imported (mirror the existing `/render-timeline` imports — reuse whatever it already uses; match its temp-dir style).

- [ ] **Step 2: Sanity-check it parses** — `node --check workers/audio-jobs/container/server.mjs && echo OK`
- [ ] **Step 3: Commit** — `git add workers/audio-jobs/container/server.mjs && git commit -m "feat(video): container /render-composite route"`

---

## Task 5: Worker orchestrator + container caller (DI, TDD)

**Files:** Create `workers/audio-jobs/src/videoCompositeContainer.ts`, `workers/audio-jobs/src/videoCompositeRender.ts`, Test `test/audio/videoCompositeRenderWorker.test.ts`. Read `src/timelineMasterRender.ts` + `src/timelineRenderWorker.ts` (provided patterns) and `test/audio/timelineRenderWorker.test.ts` for the exact test style.

- [ ] **Step 1: `videoCompositeContainer.ts`** (mirror `timelineMasterRender.ts`):
```ts
import { getContainer } from '@cloudflare/containers'
import { buildCompositePlan } from '../container/videoCompositeGraph.mjs'

export interface CompositeRenderEnv {
  RENDER: unknown
  AUDIO_BUCKET: {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: any): Promise<unknown>
  }
}

export async function renderComposite(
  env: CompositeRenderEnv,
  args: { projectId: string; jobId: string; state: any; profile: any }
): Promise<{ key: string }> {
  const plan = buildCompositePlan(args.state, args.profile)
  const files: { b64: string }[] = []
  for (const input of plan.inputs) {
    const obj = await env.AUDIO_BUCKET.get(input.r2_key)
    if (!obj) throw new Error(`composite source missing in R2: ${input.r2_key}`)
    files.push({ b64: Buffer.from(await obj.arrayBuffer()).toString('base64') })
  }
  const instance = getContainer(env.RENDER, `vid:${args.jobId}`)
  ;(instance as any).renewActivityTimeout?.()
  const res = await instance.fetch('http://render.local/render-composite', {
    method: 'POST', body: JSON.stringify({ plan, files }),
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600_000)
  })
  if (!res.ok) throw new Error(`composite render failed: ${res.status}`)
  const bytes = await res.arrayBuffer()
  const key = `media/${args.projectId}/${args.jobId}/${args.profile.format}.mp4`
  await env.AUDIO_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  return { key }
}
```

- [ ] **Step 2: `videoCompositeRender.ts` orchestrator** (mirror `timelineRenderWorker.ts`):
```ts
export interface VideoRenderMessage { jobId: string; projectId: string; timelineId: string; formats: string[] }

export interface VideoRenderDeps {
  loadTimelineState(timelineId: string): Promise<any>
  markRendering(jobId: string): Promise<void>
  renderOne(args: { projectId: string; jobId: string; state: any; formatKey: string }): Promise<{ key: string }>
  markDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void>
  markFailed(jobId: string, error: string): Promise<void>
  centsPerSec: number
}

export async function runVideoCompositeJob(msg: VideoRenderMessage, deps: VideoRenderDeps): Promise<void> {
  const start = Date.now()
  try {
    await deps.markRendering(msg.jobId)
    const state = await deps.loadTimelineState(msg.timelineId)
    const variants: Record<string, string> = {}
    for (const formatKey of msg.formats) {
      const { key } = await deps.renderOne({ projectId: msg.projectId, jobId: msg.jobId, state, formatKey })
      variants[formatKey] = key
    }
    const wallSec = Math.max(1, Math.round((Date.now() - start) / 1000))
    await deps.markDone(msg.jobId, variants, Math.round(wallSec * deps.centsPerSec))
  } catch (e: any) {
    await deps.markFailed(msg.jobId, e?.message ?? String(e))
    throw e
  }
}
```

- [ ] **Step 3: Test** — `test/audio/videoCompositeRenderWorker.test.ts` (mirror `timelineRenderWorker.test.ts`):
```ts
import { describe, it, expect, vi } from 'vitest'
import { runVideoCompositeJob } from '../../workers/audio-jobs/src/videoCompositeRender'

function deps(over: any = {}) {
  return {
    loadTimelineState: vi.fn().mockResolvedValue({ schema_version: 2 }),
    markRendering: vi.fn().mockResolvedValue(undefined),
    renderOne: vi.fn(async ({ formatKey }: any) => ({ key: `media/p/j/${formatKey}.mp4` })),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    centsPerSec: 2, ...over
  }
}
describe('runVideoCompositeJob', () => {
  it('renders each format and marks done with the variants map', async () => {
    const d = deps()
    await runVideoCompositeJob({ jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16', 'square_1x1'] }, d as any)
    expect(d.markRendering).toHaveBeenCalledWith('j')
    expect(d.renderOne).toHaveBeenCalledTimes(2)
    expect(d.markDone.mock.calls[0][1]).toEqual({ reels_9x16: 'media/p/j/reels_9x16.mp4', square_1x1: 'media/p/j/square_1x1.mp4' })
  })
  it('marks failed and rethrows on error', async () => {
    const d = deps({ renderOne: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(runVideoCompositeJob({ jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16'] }, d as any)).rejects.toThrow('boom')
    expect(d.markFailed).toHaveBeenCalledWith('j', 'boom')
  })
})
```

- [ ] **Step 4: Run → pass** — `pnpm exec vitest run test/audio/videoCompositeRenderWorker.test.ts`
- [ ] **Step 5: Commit** — `git add workers/audio-jobs/src/videoCompositeContainer.ts workers/audio-jobs/src/videoCompositeRender.ts test/audio/videoCompositeRenderWorker.test.ts && git commit -m "feat(video): worker composite orchestrator + container caller (DI, tested)"`

---

## Task 6: Worker queue branch + wrangler queue

**Files:** Modify `workers/audio-jobs/src/index.ts`, `workers/audio-jobs/wrangler.toml`

- [ ] **Step 1: Add the `video-render` branch** to the `queue()` handler in `src/index.ts` (read the existing `timeline-render` branch and mirror it). Wire real deps: `loadTimelineState`=`db.dbLoadTimelineState`, `markRendering/Done/Failed`=`db.dbMarkRender*`, `renderOne`=`({projectId,jobId,state,formatKey}) => renderComposite({ RENDER: env.RENDER, AUDIO_BUCKET: env.AUDIO_BUCKET }, { projectId, jobId, state, profile: videoFormatFor(formatKey) })`, `centsPerSec`=`Number(env.RENDER_CENTS_PER_SEC ?? '2')`. `videoFormatFor` is imported from a `.mjs`/local profiles port OR inline the 3 profiles in the worker (the worker can't import `~~/server`; create `workers/audio-jobs/container/videoProfiles.mjs` mirroring the profiles, and import it in index.ts). Ack on success, `msg.retry({ delaySeconds: 30 })` on error. Guard: `if (batch.queue === 'video-render') { ... return }`.

- [ ] **Step 2: Add the consumer** to `wrangler.toml` (mirror the `timeline-render` consumer):
```toml
[[queues.consumers]]
queue = "video-render"
max_batch_size = 1
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "video-render-dlq"
```

- [ ] **Step 3: Sanity check** — `node --check workers/audio-jobs/src/index.ts 2>/dev/null || pnpm exec tsc --noEmit workers/audio-jobs/src/index.ts 2>&1 | head` (best-effort; the worker has its own tsconfig — if it doesn't check cleanly standalone, rely on the build). Confirm `wrangler.toml` is valid TOML.
- [ ] **Step 4: Commit** — `git add workers/audio-jobs/src/index.ts workers/audio-jobs/wrangler.toml workers/audio-jobs/container/videoProfiles.mjs && git commit -m "feat(video): audio-jobs worker video-render queue branch + consumer"`

---

## Task 7: Producer + flag-gated render endpoint (TDD) + regression gate

**Files:** Modify `server/utils/audio/renderQueue.ts`, Create `server/api/agency/audio/projects/[id]/render-video.post.ts`, Test `test/audio/renderVideoApi.test.ts`. Read `render.post.ts` + `mediaProjectsApi.test.ts` for the patterns.

- [ ] **Step 1: Add the producer** to `renderQueue.ts`:
```ts
export interface VideoRenderMessage { jobId: string; projectId: string; timelineId: string; formats: string[] }

export async function enqueueVideoRender(event: any, msg: VideoRenderMessage): Promise<void> {
  const queue = (event?.context?.cloudflare?.env?.VIDEO_RENDER_QUEUE as { send(b: unknown): Promise<void> }) ?? null
  if (!queue) throw new Error('VIDEO_RENDER_QUEUE binding unavailable')
  await queue.send(msg)
}
```

- [ ] **Step 2: Failing test** — `test/audio/renderVideoApi.test.ts` (mirror `mediaProjectsApi.test.ts` harness: globalThis shims, mock auth + `~~/server/utils/audio/projects` + `~~/server/utils/audio/renderQueue`). Tests:
  - enqueues for an `av` project when `VIDEO_STUDIO_ENABLED` is set (set `process.env.VIDEO_STUDIO_ENABLED='true'` in the test): calls `createRenderJob` then `enqueueVideoRender` with `{jobId, projectId, timelineId, formats}`; returns 202-ish.
  - rejects an `audio` project with 400.
  - when `VIDEO_STUDIO_ENABLED` is unset → throws 404/403 (dormant).
  - on enqueue throw → calls `markRenderJobFailed` + 502.
  (Write the assertions concretely against the mocked fns; mirror how `mediaProjectsApi.test.ts` imports the handler and builds a `TestEvent`.)

- [ ] **Step 3: Implement** — `server/api/agency/audio/projects/[id]/render-video.post.ts`:
```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, createRenderJob, markRenderJobFailed } from '~~/server/utils/audio/projects'
import { enqueueVideoRender } from '~~/server/utils/audio/renderQueue'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'

const BodySchema = z.object({ formats: z.array(z.string()).min(1).default(['reels_9x16']) })

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))

  // unknown formats → 400
  for (const f of body.formats) if (!videoFormatFor(f)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown format: ${f}` })
  }

  const found = await getProjectWithCurrentTimeline(id)
  if (!found?.project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (found.project.mediaType !== 'av') throw createError({ statusCode: 400, statusMessage: 'Not a video project' })
  if (!found.timeline) throw createError({ statusCode: 400, statusMessage: 'No timeline' })

  const parsed = TimelineStateSchema.safeParse((found.timeline as any).state)
  if (!parsed.success || validateTimeline(parsed.data).ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline' })
  }

  const job = await createRenderJob({ projectId: id, requestedBy: user.id, channels: body.formats })
  try {
    await enqueueVideoRender(event, { jobId: job.id, projectId: id, timelineId: job.timelineId, formats: body.formats })
  } catch (e: any) {
    await markRenderJobFailed(job.id, `enqueue failed: ${e?.message ?? String(e)}`)
    throw createError({ statusCode: 502, statusMessage: 'Failed to enqueue render' })
  }
  setResponseStatus(event, 202)
  return { job }
})
```
(Check `getProjectWithCurrentTimeline`'s return shape for `mediaType` + `timeline.state` — adjust property access to match `mapProjectRow`/`mapTimelineRow`.)

- [ ] **Step 4: Run → pass** — `pnpm exec vitest run test/audio/renderVideoApi.test.ts`
- [ ] **Step 5: FULL regression** — `pnpm exec vitest run test/audio/` → all green. Report count.
- [ ] **Step 6: Typecheck changed** — `pnpm exec nuxt typecheck 2>&1 | grep -E "videoComposite|videoProfiles|render-video|renderQueue" || echo "no new errors in changed server files"`
- [ ] **Step 7: Commit** — `git add server/utils/audio/renderQueue.ts server/api/agency/audio/projects/[id]/render-video.post.ts test/audio/renderVideoApi.test.ts && git commit -m "feat(video): flag-gated render-video endpoint + enqueueVideoRender producer"`

---

## Done criteria (V1.2a)

- [ ] `pnpm exec vitest run test/audio/` fully green (new video tests + zero audio regression).
- [ ] `buildCompositePlan` produces a well-formed plan (ordered inputs, black base, trim/scale/zoompan/positioned overlay, audio chain offset by V, `[vout]`/`[aout]`); `.ts`↔`.mjs` parity holds.
- [ ] `runVideoCompositeJob` drives the lifecycle (mocked deps) incl. markFailed+rethrow.
- [ ] `render-video` endpoint enqueues for `av`, rejects `audio` (400), is dormant when `VIDEO_STUDIO_ENABLED` unset, 502 on enqueue failure.
- [ ] No new typecheck errors in changed server files; no SQL migration.
- [ ] **Verify-live (operator, on activation):** a real multi-clip composite render renders correctly (the arg-shape tests do not prove ffmpeg correctness — flag this in the completion report).
