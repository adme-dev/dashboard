# Media Studio SP1 — Render Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ EXECUTION HELD until SP0 (PR #107) merges to main.** SP1 imports SP0's `timelineSchema.ts` and extends SP0's `projects.ts` gateway + `media_render_jobs` table. Branch SP1 off the updated `origin/main` after #107 merges so it does not stack on an in-review branch.

**Goal:** Turn a stored timeline (SP0) into rendered, channel-normalised audio — a pure ffmpeg filtergraph builder that mixes N clips across M tracks with declarative ducking into one master, fed through the existing per-channel loudnorm pass, driven by a `timeline-render` queue + worker + Container.

**Architecture:** A pure, dual-importable `timelineFiltergraph.ts` compiles `TimelineState` → an index-based ffmpeg `-filter_complex` (per clip `atrim`→`adelay`→`volume`→`afade`; per track `amix`+gain, muted tracks dropped; ducking → `sidechaincompress`; final `amix` → one master WAV). The SP0 gateway gains render-job functions; two thin agency endpoints enqueue/read jobs; the `audio-jobs` Worker gains a `timeline-render` queue branch that calls a new Container `/render-timeline` endpoint for the master, then reuses the existing `renderVariants` per-channel pipeline, and writes status/variants/`cost_cents` to `media_render_jobs`.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`server/utils/db.ts`), Zod, Vitest, Cloudflare Queues + Containers (`@cloudflare/containers`), ffmpeg. No new dependencies; **no new migration** (`media_render_jobs` from SP0 mig 160 has every column).

**Spec:** `docs/superpowers/specs/2026-06-02-media-studio-sp1-render-spine-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `server/utils/audio/timelineFiltergraph.ts` | **Pure** timeline → ffmpeg filter_complex + master argv. Dual-importable. The TDD core. |
| `server/utils/audio/projects.ts` *(modify)* | Add render-job gateway fns (`createRenderJob`/`listRenderJobs`/`markRenderJob*`) — keeps it the sole gateway to the 3 tables. |
| `server/utils/audio/renderQueue.ts` | Thin enqueue boundary (CF queue producer binding lookup) — mockable in tests. |
| `server/api/agency/audio/projects/[id]/render.post.ts` | Enqueue a render: validate → snapshot version → insert job → enqueue. |
| `server/api/agency/audio/projects/[id]/render-jobs.get.ts` | List a project's render jobs. |
| `workers/audio-jobs/src/index.ts` *(modify)* | Branch the `queue()` handler on `batch.queue`; route `timeline-render`. |
| `workers/audio-jobs/src/timelineRenderWorker.ts` | Worker-side orchestration: mark rendering → master via Container → `renderVariants` → mark done + `cost_cents`. |
| `workers/audio-jobs/src/db.ts` *(modify)* | Add the worker-side render-job status writers (Hyperdrive→Neon). |
| `workers/audio-jobs/container/server.mjs` *(modify)* | Add `POST /render-timeline`: clips (multipart) + plan → master WAV bytes. |
| `workers/audio-jobs/container/timelineFiltergraph.mjs` | Node port of the TS builder (kept in sync; the existing `render.mjs`↔`render.ts` convention). |
| `workers/audio-jobs/wrangler.toml` *(modify)* | Add `timeline-render` queue consumer. |
| `test/audio/timelineFiltergraph.test.ts` | Pure builder tests (exact argv). |
| `test/audio/mediaRenderJobs.test.ts` | Gateway render-job fns (mocked DB). |
| `test/audio/mediaRenderApi.test.ts` | Endpoint tests (mocked util + auth + queue). |
| `test/audio/timelineRenderWorker.test.ts` | Worker orchestration (mocked DB + Container + R2). |
| `test/audio/timelineFiltergraphSync.test.ts` | Asserts `render.mjs`-style port matches the TS builder for a representative timeline. |

---

## Task 1: Pure filtergraph builder — clip + track mapping

The deterministic core. Index-based labels (`[0:a]`→`[c0]`, track buses `[t0]`), no I/O. TDD.

**Files:**
- Create: `server/utils/audio/timelineFiltergraph.ts`
- Test: `test/audio/timelineFiltergraph.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/audio/timelineFiltergraph.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { buildTimelineFiltergraph, curveToken } from '~~/server/utils/audio/timelineFiltergraph'

// Build a normalized TimelineState from a partial raw doc (relies on SP0 defaults).
function tl(raw: any) {
  return TimelineStateSchema.parse(raw)
}

describe('curveToken', () => {
  it('maps contract fade curves to ffmpeg afade curve tokens', () => {
    expect(curveToken('linear')).toBe('tri')
    expect(curveToken('exp')).toBe('exp')
    expect(curveToken('log')).toBe('log')
  })
})

describe('buildTimelineFiltergraph — inputs', () => {
  it('lists clip inputs in track-then-clip order with r2_key + clipId', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    expect(plan.inputs).toEqual([
      { clipId: 'a', r2_key: 'k/a' },
      { clipId: 'b', r2_key: 'k/b' }
    ])
    expect(plan.sampleRate).toBe(48000)
    expect(plan.durationSec).toBe(30)
  })

  it('skips muted tracks entirely (no inputs, no chains)', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', muted: true, clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    expect(plan.inputs).toEqual([{ clipId: 'b', r2_key: 'k/b' }])
    expect(plan.filterComplex).not.toContain('k/a')
  })
})

describe('buildTimelineFiltergraph — per-clip chain', () => {
  it('emits atrim+asetpts, adelay (ms), volume, and both fades with the curve token', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 1, source_out_sec: 6,
          gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] }
    ] })
    const fc = buildTimelineFiltergraph(s).filterComplex
    // input 0 → clip chain [c0]; aformat first (prior-art: every input before amix);
    // playLen = 6-1 = 5, fade-out starts at 5-1 = 4
    expect(fc).toContain('[0:a]aformat=sample_rates=48000:channel_layouts=stereo,'
      + 'atrim=start=1:end=6,asetpts=N/SR/TB,adelay=2000:all=1,volume=-3dB,'
      + 'afade=t=in:st=0:d=0.5:curve=exp,afade=t=out:st=4:d=1:curve=exp[c0]')
  })

  it('omits atrim end when source_out_sec is null, and skips zero gain/fades/delay', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: null } ] }
    ] })
    const fc = buildTimelineFiltergraph(s).filterComplex
    expect(fc).toContain('[0:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=0,asetpts=N/SR/TB[c0]')
    expect(fc).not.toContain('adelay')
    expect(fc).not.toContain('volume=')
    expect(fc).not.toContain('afade')
  })
})

describe('buildTimelineFiltergraph — per-track bus', () => {
  it('a single-clip, zero-gain track reuses the clip label as its bus', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    // one track, one clip, no gain → final mix is just the clip, always alimiter-guarded
    expect(plan.filterComplex).toContain('[c0]alimiter=limit=0.95[mix]')
  })

  it('amixes a multi-clip track (duration=longest) and applies track gain', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', gain_db: -2, clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 },
        { id: 'c', r2_key: 'k/c', timeline_start_sec: 10, source_out_sec: 20 } ] }
    ] })
    const fc = buildTimelineFiltergraph(s).filterComplex
    expect(fc).toContain('[c0][c1]amix=inputs=2:normalize=0:duration=longest,volume=-2dB[t0]')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/audio/timelineFiltergraph.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/audio/timelineFiltergraph`.

- [ ] **Step 3: Write the implementation (clip + track mapping; ducking/final added in Task 2)**

Create `server/utils/audio/timelineFiltergraph.ts`:

```ts
// server/utils/audio/timelineFiltergraph.ts — PURE timeline → ffmpeg filter_complex.
// No I/O. Index-based labels: ffmpeg input i → clip chain [ci]; track bus [tk];
// ducked target [dk]; final [mix]. The single source of truth for the render graph,
// imported by Nitro (~~/) and ported (kept in sync) into the audio-jobs Container —
// exactly the render.ts ↔ container/render.mjs convention. Validation/duration math
// live in timelineSchema.ts; this file compiles a *validated* state to ffmpeg args.
import type { TimelineState } from './timelineSchema'
import { computeDuration } from './timelineSchema'

export interface FiltergraphInput {
  clipId: string
  r2_key: string
}

export interface FiltergraphPlan {
  inputs: FiltergraphInput[] // index = ffmpeg -i order; the container resolves to local paths
  filterComplex: string
  outLabel: string           // always '[mix]' (see Task 2)
  sampleRate: number
  durationSec: number
}

/** contract fade curve → ffmpeg afade `curve=` token. 'tri' is ffmpeg's linear ramp. */
export function curveToken(curve: 'linear' | 'exp' | 'log'): string {
  switch (curve) {
    case 'exp': return 'exp'
    case 'log': return 'log'
    default: return 'tri'
  }
}

interface BuildAccum {
  inputs: FiltergraphInput[]
  chains: string[]
  /** current bus label per active (non-muted) track, e.g. 'c0' or 't1'. */
  busLabels: string[]
}

/** Build per-clip chains + per-track buses. Mutates `acc`. Exported-internal for Task 2. */
export function buildClipAndTrackChains(state: TimelineState): BuildAccum {
  const acc: BuildAccum = { inputs: [], chains: [], busLabels: [] }
  const activeTracks = state.tracks.filter((t) => !t.muted)
  let inputIdx = 0

  for (const track of activeTracks) {
    const clipLabels: string[] = []
    for (const clip of track.clips) {
      const i = inputIdx++
      acc.inputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      // aformat FIRST — normalise rate/layout before any amix (prior-art: the #1
      // silent amix failure). Applied at source so track + final amix are both safe.
      const parts: string[] = [`aformat=sample_rates=${state.sample_rate}:channel_layouts=stereo`]
      parts.push(
        clip.source_out_sec != null
          ? `atrim=start=${clip.source_in_sec}:end=${clip.source_out_sec}`
          : `atrim=start=${clip.source_in_sec}`,
        'asetpts=N/SR/TB'
      )
      if (clip.timeline_start_sec > 0) {
        parts.push(`adelay=${Math.round(clip.timeline_start_sec * 1000)}:all=1`)
      }
      if (clip.gain_db !== 0) parts.push(`volume=${clip.gain_db}dB`)
      if (clip.fade_in_sec > 0) {
        parts.push(`afade=t=in:st=0:d=${clip.fade_in_sec}:curve=${curveToken(clip.fade_curve)}`)
      }
      const playLen = clip.source_out_sec != null ? clip.source_out_sec - clip.source_in_sec : null
      if (clip.fade_out_sec > 0 && playLen != null) {
        const st = Math.max(0, playLen - clip.fade_out_sec)
        parts.push(`afade=t=out:st=${st}:d=${clip.fade_out_sec}:curve=${curveToken(clip.fade_curve)}`)
      }
      const label = `c${i}`
      acc.chains.push(`[${i}:a]${parts.join(',')}[${label}]`)
      clipLabels.push(label)
    }

    // per-track bus
    if (clipLabels.length === 0) {
      acc.busLabels.push('') // empty active track contributes nothing
      continue
    }
    const busLabel = `t${acc.busLabels.length}`
    if (clipLabels.length === 1 && track.gain_db === 0) {
      acc.busLabels.push(clipLabels[0]) // reuse clip label; no extra filter node
    } else {
      const ins = clipLabels.map((l) => `[${l}]`).join('')
      const post = track.gain_db !== 0 ? `,volume=${track.gain_db}dB` : ''
      const body = clipLabels.length === 1 ? `[${clipLabels[0]}]anull` : `${ins}amix=inputs=${clipLabels.length}:normalize=0:duration=longest`
      acc.chains.push(`${body}${post}[${busLabel}]`)
      acc.busLabels.push(busLabel)
    }
  }
  return acc
}

/** Final master mix of the surviving track buses: amix (duration=longest, since
 * clips are positioned by adelay) then alimiter (prior-art: prevent post-mix WAV
 * clipping before the per-channel loudnorm). Always alimiter-guarded, even for one bus. */
export function finalMixChain(busLabels: string[]): string | null {
  const buses = busLabels.filter(Boolean)
  if (buses.length === 0) return null
  if (buses.length === 1) return `[${buses[0]}]alimiter=limit=0.95[mix]`
  return `${buses.map((b) => `[${b}]`).join('')}amix=inputs=${buses.length}:normalize=0:duration=longest,alimiter=limit=0.95[mix]`
}

// buildTimelineFiltergraph (with ducking) is completed in Task 2.
export function buildTimelineFiltergraph(state: TimelineState): FiltergraphPlan {
  const acc = buildClipAndTrackChains(state)
  const finalChain = finalMixChain(acc.busLabels)
  if (finalChain) acc.chains.push(finalChain)
  return {
    inputs: acc.inputs,
    chains_internal: acc.chains, // removed in Task 2
    filterComplex: acc.chains.join(';'),
    outLabel: '[mix]',
    sampleRate: state.sample_rate,
    durationSec: computeDuration(state)
  } as unknown as FiltergraphPlan
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/audio/timelineFiltergraph.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/timelineFiltergraph.ts test/audio/timelineFiltergraph.test.ts
git commit -m "feat(media-studio): SP1 pure filtergraph builder — clip+track mapping"
```

---

## Task 2: Pure filtergraph builder — ducking + final mix + master argv

Completes the builder: declarative ducking → `sidechaincompress` with `asplit` plumbing, the general final `amix`, and `buildMasterRenderArgs`.

**Files:**
- Modify: `server/utils/audio/timelineFiltergraph.ts`
- Test: `test/audio/timelineFiltergraph.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `test/audio/timelineFiltergraph.test.ts`:

```ts
import { buildMasterRenderArgs, duckRatioFromAmountDb } from '~~/server/utils/audio/timelineFiltergraph'

describe('duckRatioFromAmountDb', () => {
  it('is a documented monotonic map from attenuation magnitude to sidechain ratio', () => {
    // ratio = clamp(round(1 + |amount_db|/3, 1dp), 1, 20). amount -12 → 1+4 = 5.
    expect(duckRatioFromAmountDb(-12)).toBe(5)
    expect(duckRatioFromAmountDb(-6)).toBe(3)
    expect(duckRatioFromAmountDb(0)).toBe(1)
    expect(duckRatioFromAmountDb(-100)).toBe(20) // clamped
  })
})

describe('buildTimelineFiltergraph — ducking', () => {
  it('splits the source bus and sidechain-compresses the target, then mixes', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [
        { id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12,
          attack_ms: 50, release_ms: 300, threshold_db: -30 } ]
    })
    const fc = buildTimelineFiltergraph(s).filterComplex
    // source bus c0 split → [c0] used in final mix + [sc0] feeds the sidechain key
    expect(fc).toContain('[c0]asplit=2[c0a][sc0]')
    // target bus c1 compressed keyed by [sc0]
    expect(fc).toContain('[c1][sc0]sidechaincompress=threshold=-30:ratio=5:attack=50:release=300[d0]')
    // final mix uses the post-split source [c0a] and the ducked target [d0], duration=longest + alimiter
    expect(fc).toContain('[c0a][d0]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[mix]')
  })
})

describe('buildMasterRenderArgs', () => {
  it('assembles -i per input (in order), -filter_complex, -map [mix], wav out at sample_rate', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] }
    ] })
    const plan = buildTimelineFiltergraph(s)
    const args = buildMasterRenderArgs(plan, ['/tmp/in0.wav'], '/tmp/master.wav')
    expect(args).toEqual([
      '-hide_banner', '-nostats',
      '-i', '/tmp/in0.wav',
      '-filter_complex', plan.filterComplex,
      '-map', '[mix]',
      '-ar', '48000',
      '-codec:a', 'pcm_s16le',
      '-y', '/tmp/master.wav'
    ])
  })

  it('throws when inputPaths length does not match plan.inputs', () => {
    const s = tl({ tracks: [ { id: 'm', name: 'M', kind: 'music', clips: [
      { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] } ] })
    const plan = buildTimelineFiltergraph(s)
    expect(() => buildMasterRenderArgs(plan, [], '/tmp/master.wav')).toThrow()
  })
})

describe('buildTimelineFiltergraph — empty timeline', () => {
  it('produces no inputs and an empty filter graph', () => {
    const s = tl({ tracks: [], ducking: [] })
    const plan = buildTimelineFiltergraph(s)
    expect(plan.inputs).toEqual([])
    expect(plan.filterComplex).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineFiltergraph.test.ts`
Expected: FAIL — `buildMasterRenderArgs` / `duckRatioFromAmountDb` not exported; ducking + `[mix]` plumbing not implemented.

- [ ] **Step 3: Replace the placeholder `buildTimelineFiltergraph` and add the new exports**

In `server/utils/audio/timelineFiltergraph.ts`, **replace** the placeholder `buildTimelineFiltergraph` (everything from `export function buildTimelineFiltergraph` to the end of the file) with:

```ts
/** Documented, monotonic map from desired attenuation magnitude (dB) to a
 * sidechaincompress ratio. The *structure* is pinned here + in tests; the exact
 * perceptual calibration is an ear-verify item (spec §10). */
export function duckRatioFromAmountDb(amountDb: number): number {
  const mag = Math.abs(amountDb)
  const ratio = Math.round((1 + mag / 3) * 10) / 10
  return Math.min(20, Math.max(1, ratio))
}

export function buildTimelineFiltergraph(state: TimelineState): FiltergraphPlan {
  const acc = buildClipAndTrackChains(state)
  const activeTracks = state.tracks.filter((t) => !t.muted)

  // Map each active track id → its current bus label index (aligned to acc.busLabels).
  const idToBusIdx = new Map<string, number>()
  activeTracks.forEach((t, k) => idToBusIdx.set(t.id, k))

  // Ducking: split each source bus per rule; sidechaincompress each target bus.
  let scCount = 0
  for (const rule of state.ducking) {
    const srcK = idToBusIdx.get(rule.source_track_id)
    const tgtK = idToBusIdx.get(rule.target_track_id)
    // A muted source/target has no bus → skip (validateTimeline guarantees the ids exist).
    if (srcK == null || tgtK == null) continue
    const srcLabel = acc.busLabels[srcK]
    const tgtLabel = acc.busLabels[tgtK]
    if (!srcLabel || !tgtLabel) continue

    const keepLabel = `${srcLabel}a`
    const scLabel = `sc${scCount++}`
    acc.chains.push(`[${srcLabel}]asplit=2[${keepLabel}][${scLabel}]`)
    acc.busLabels[srcK] = keepLabel // the source stays in the final mix via its kept half

    const duckedLabel = `d${tgtK}`
    const ratio = duckRatioFromAmountDb(rule.amount_db)
    acc.chains.push(
      `[${tgtLabel}][${scLabel}]sidechaincompress=threshold=${rule.threshold_db}` +
        `:ratio=${ratio}:attack=${rule.attack_ms}:release=${rule.release_ms}[${duckedLabel}]`
    )
    acc.busLabels[tgtK] = duckedLabel
  }

  // Final mix (duration=longest + alimiter) — shared with the Task 1 helper.
  const finalChain = finalMixChain(acc.busLabels)
  if (finalChain) acc.chains.push(finalChain)

  return {
    inputs: acc.inputs,
    filterComplex: acc.chains.join(';'),
    outLabel: '[mix]',
    sampleRate: state.sample_rate,
    durationSec: computeDuration(state)
  }
}

/** Assemble the full ffmpeg argv for the master mixdown. inputPaths must align 1:1
 * (and in order) with plan.inputs. Output is a full-quality WAV at the timeline
 * sample rate; per-channel loudnorm/encoding is the existing render.ts pass. */
export function buildMasterRenderArgs(plan: FiltergraphPlan, inputPaths: string[], outputPath: string): string[] {
  if (inputPaths.length !== plan.inputs.length) {
    throw new Error(`inputPaths (${inputPaths.length}) must match plan.inputs (${plan.inputs.length})`)
  }
  const args = ['-hide_banner', '-nostats']
  for (const p of inputPaths) args.push('-i', p)
  args.push('-filter_complex', plan.filterComplex, '-map', plan.outLabel)
  args.push('-ar', String(plan.sampleRate), '-codec:a', 'pcm_s16le', '-y', outputPath)
  return args
}
```

Also remove the temporary `chains_internal` field usage — the `FiltergraphPlan` returned no longer includes it.

- [ ] **Step 4: Run to verify all builder tests pass**

Run: `pnpm exec vitest run test/audio/timelineFiltergraph.test.ts`
Expected: PASS — clip/track/ducking/argv/empty all green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/timelineFiltergraph.ts test/audio/timelineFiltergraph.test.ts
git commit -m "feat(media-studio): SP1 filtergraph builder — ducking + final mix + master argv"
```

---

## Task 3: Gateway render-job functions

Extend the SP0 sole gateway with render-job persistence. The render request snapshots a version via the existing `createVersion` (SP0 §6), then inserts a `media_render_jobs` row.

**Files:**
- Modify: `server/utils/audio/projects.ts`
- Test: `test/audio/mediaRenderJobs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/audio/mediaRenderJobs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const transactionMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...a: any[]) => queryOneMock(...a),
  queryRows: (...a: any[]) => queryRowsMock(...a),
  transaction: (cb: any) => transactionMock(cb)
}))

import {
  mapRenderJobRow,
  createRenderJob,
  listRenderJobs,
  markRenderJobRendering,
  markRenderJobDone,
  markRenderJobFailed
} from '~~/server/utils/audio/projects'

const jobRow = {
  id: 'j1', timeline_id: 't2', project_id: 'p1', channels: ['radio', 'meta'],
  status: 'queued', variants: {}, cost_cents: null, error: null, requested_by: 'u1',
  created_at: '2026-06-02T00:00:00Z', updated_at: '2026-06-02T00:00:00Z'
}

beforeEach(() => vi.clearAllMocks())

describe('mapRenderJobRow', () => {
  it('maps snake_case → camelCase incl. channels + variants + costCents', () => {
    const j = mapRenderJobRow(jobRow)
    expect(j.id).toBe('j1')
    expect(j.timelineId).toBe('t2')
    expect(j.projectId).toBe('p1')
    expect(j.channels).toEqual(['radio', 'meta'])
    expect(j.status).toBe('queued')
    expect(j.variants).toEqual({})
    expect(j.costCents).toBeNull()
  })
})

describe('createRenderJob', () => {
  it('snapshots a new version then inserts a queued job pointing at it (one transaction)', async () => {
    const dbQuery = vi.fn()
      // createVersion's SELECT current state + max version
      .mockResolvedValueOnce({ rows: [{ state: { schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, tracks: [], ducking: [] }, max_version: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't2', project_id: 'p1', version: 2, label: 'render', state: {}, schema_version: 1, created_by: 'u1', created_at: 'x' }] }) // INSERT version
      .mockResolvedValueOnce({ rows: [] })                       // UPDATE current_timeline_id
      .mockResolvedValueOnce({ rows: [jobRow] })                 // INSERT render job
    transactionMock.mockImplementation(async (cb: any) => cb({ query: dbQuery }))

    const job = await createRenderJob({ projectId: 'p1', requestedBy: 'u1', channels: ['radio', 'meta'] })
    expect(job.id).toBe('j1')
    expect(job.timelineId).toBe('t2')   // points at the snapshot version
    expect(job.status).toBe('queued')
    expect(dbQuery).toHaveBeenCalledTimes(4)
  })
})

describe('listRenderJobs', () => {
  it('lists a project\'s jobs newest-first', async () => {
    queryRowsMock.mockResolvedValueOnce([jobRow])
    const rows = await listRenderJobs('p1')
    expect(rows).toHaveLength(1)
    expect(queryRowsMock.mock.calls[0][0]).toContain('ORDER BY created_at DESC')
    expect(queryRowsMock.mock.calls[0][1]).toEqual(['p1'])
  })
})

describe('markRenderJob* status writers', () => {
  it('markRenderJobRendering flips status', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'rendering' })
    const j = await markRenderJobRendering('j1')
    expect(j.status).toBe('rendering')
    expect(queryOneMock.mock.calls[0][0]).toContain("status = 'rendering'")
  })
  it('markRenderJobDone writes variants + costCents + status done', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'done', variants: { radio: 'k/r' }, cost_cents: 12 })
    const j = await markRenderJobDone('j1', { radio: 'k/r' }, 12)
    expect(j.status).toBe('done')
    expect(j.variants).toEqual({ radio: 'k/r' })
    expect(j.costCents).toBe(12)
    const params = queryOneMock.mock.calls[0][1]
    expect(JSON.parse(params[0])).toEqual({ radio: 'k/r' }) // variants stringified
    expect(params[1]).toBe(12)
  })
  it('markRenderJobFailed writes status failed + error', async () => {
    queryOneMock.mockResolvedValueOnce({ ...jobRow, status: 'failed', error: 'boom' })
    const j = await markRenderJobFailed('j1', 'boom')
    expect(j.status).toBe('failed')
    expect(j.error).toBe('boom')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/mediaRenderJobs.test.ts`
Expected: FAIL — the render-job exports don't exist.

- [ ] **Step 3: Add the runtime type + gateway functions**

First, in `app/types/index.ts`, immediately after the `MediaTimeline` interface, add:

```ts
export type MediaRenderJobStatus = 'queued' | 'rendering' | 'done' | 'failed'

export interface MediaRenderJob {
  id: string
  timelineId: string
  projectId: string
  channels: string[]
  status: MediaRenderJobStatus
  variants: Record<string, string>
  costCents: number | null
  error: string | null
  requestedBy: string
  createdAt: string
  updatedAt: string
}
```

Then append to `server/utils/audio/projects.ts` (after `listVersions`):

```ts
import type { MediaRenderJob } from '~~/app/types'

/** Pure: media_render_jobs row → MediaRenderJob (camelCase). */
export function mapRenderJobRow(row: any): MediaRenderJob {
  return {
    id: row.id,
    timelineId: row.timeline_id,
    projectId: row.project_id,
    channels: row.channels ?? [],
    status: row.status,
    variants: row.variants ?? {},
    costCents: row.cost_cents ?? null,
    error: row.error ?? null,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface CreateRenderJobInput {
  projectId: string
  requestedBy: string
  channels: string[]
}

/** Snapshot the current draft into a new immutable version (SP0 §6), then insert a
 * queued render job pointing at that frozen version — all in one transaction so a
 * job never references a half-written version. Mirrors createVersion's SQL. */
export async function createRenderJob(input: CreateRenderJobInput): Promise<MediaRenderJob> {
  const newTimelineId = randomUUID()
  const jobId = randomUUID()
  return transaction(async (db) => {
    const cur = await db.query(
      `SELECT t.state AS state,
              (SELECT MAX(version) FROM media_timelines WHERE project_id = $1) AS max_version
       FROM media_projects p
       JOIN media_timelines t ON t.id = p.current_timeline_id
       WHERE p.id = $1`,
      [input.projectId]
    )
    if (!cur.rows[0]) throw new Error(`project ${input.projectId} has no current timeline`)
    const nextVersion = Number(cur.rows[0].max_version) + 1
    await db.query(
      `INSERT INTO media_timelines (id, project_id, version, label, state, schema_version, created_by)
       VALUES ($1, $2, $3, 'render snapshot', $4, 1, $5)`,
      [newTimelineId, input.projectId, nextVersion, JSON.stringify(cur.rows[0].state), input.requestedBy]
    )
    await db.query(
      `UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2`,
      [newTimelineId, input.projectId]
    )
    const job = await db.query(
      `INSERT INTO media_render_jobs (id, timeline_id, project_id, channels, status, requested_by)
       VALUES ($1, $2, $3, $4, 'queued', $5) RETURNING *`,
      [jobId, newTimelineId, input.projectId, input.channels, input.requestedBy]
    )
    return mapRenderJobRow(job.rows[0])
  })
}

/** Render jobs for a project, newest-first. */
export async function listRenderJobs(projectId: string): Promise<MediaRenderJob[]> {
  const rows = await queryRows(
    `SELECT * FROM media_render_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [projectId]
  )
  return rows.map(mapRenderJobRow)
}

export async function markRenderJobRendering(jobId: string): Promise<MediaRenderJob> {
  const row = await queryOne(
    `UPDATE media_render_jobs SET status = 'rendering', updated_at = now() WHERE id = $1 RETURNING *`,
    [jobId]
  )
  if (!row) throw new Error(`render job ${jobId} not found`)
  return mapRenderJobRow(row)
}

export async function markRenderJobDone(
  jobId: string,
  variants: Record<string, string>,
  costCents: number | null
): Promise<MediaRenderJob> {
  const row = await queryOne(
    `UPDATE media_render_jobs SET status = 'done', variants = $1, cost_cents = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [JSON.stringify(variants), costCents, jobId]
  )
  if (!row) throw new Error(`render job ${jobId} not found`)
  return mapRenderJobRow(row)
}

export async function markRenderJobFailed(jobId: string, error: string): Promise<MediaRenderJob> {
  const row = await queryOne(
    `UPDATE media_render_jobs SET status = 'failed', error = $1, updated_at = now()
     WHERE id = $2 RETURNING *`,
    [error, jobId]
  )
  if (!row) throw new Error(`render job ${jobId} not found`)
  return mapRenderJobRow(row)
}
```

> Note: `import { randomUUID } from 'crypto'`, `queryOne`, `queryRows`, `transaction` are already imported at the top of `projects.ts` (SP0). Add only the `MediaRenderJob` type import shown above.

- [ ] **Step 4: Run to verify all gateway tests pass**

Run: `pnpm exec vitest run test/audio/mediaRenderJobs.test.ts`
Expected: PASS — every describe block green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/projects.ts app/types/index.ts test/audio/mediaRenderJobs.test.ts
git commit -m "feat(media-studio): SP1 gateway render-job persistence + snapshot-on-render"
```

---

## Task 4: Enqueue + status endpoints

Two thin handlers + a mockable enqueue boundary.

**Files:**
- Create: `server/utils/audio/renderQueue.ts`
- Create: `server/api/agency/audio/projects/[id]/render.post.ts`
- Create: `server/api/agency/audio/projects/[id]/render-jobs.get.ts`
- Test: `test/audio/mediaRenderApi.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/audio/mediaRenderApi.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; body?: any; context?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a)
}))

const mockGetProject = vi.fn()
const mockCreateRenderJob = vi.fn()
const mockListRenderJobs = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
  createRenderJob: (...a: unknown[]) => mockCreateRenderJob(...a),
  listRenderJobs: (...a: unknown[]) => mockListRenderJobs(...a)
}))

const mockEnqueue = vi.fn()
vi.mock('~~/server/utils/audio/renderQueue', () => ({
  enqueueTimelineRender: (...a: unknown[]) => mockEnqueue(...a)
}))

const { default: renderH } = await import('../../server/api/agency/audio/projects/[id]/render.post')
const { default: jobsH } = await import('../../server/api/agency/audio/projects/[id]/render-jobs.get')

const goodTimeline = {
  schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 5,
  tracks: [{ id: 't', name: 'M', kind: 'music', clips: [
    { id: 'c', r2_key: 'k', timeline_start_sec: 0, source_out_sec: 5 } ] }],
  ducking: []
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
})

describe('POST /agency/audio/projects/:id/render', () => {
  it('404s when the project is missing', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 404 })
  })
  it('409s when the project has no current timeline', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: null }, timeline: null })
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 409 })
  })
  it('400s when the current timeline is invalid', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: { ...goodTimeline, ducking: [
        { id: 'd', source_track_id: 't', target_track_id: 'missing', amount_db: -6 } ] } } })
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateRenderJob).not.toHaveBeenCalled()
  })
  it('defaults to all channels, creates the job, enqueues it, returns 202', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', clientId: 'c1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })
    const res = await renderH({ params: { id: 'p1' }, body: {}, context: {} } as any)
    expect(mockRequireWriteAccess).toHaveBeenCalled()
    const arg = mockCreateRenderJob.mock.calls[0][0]
    expect(arg).toEqual({ projectId: 'p1', requestedBy: 'u1', channels: ['radio', 'tiktok', 'meta'] })
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'j1', projectId: 'p1', timelineId: 't2', channels: ['radio', 'tiktok', 'meta'] })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    expect(res.job.id).toBe('j1')
  })
  it('passes an explicit channel subset through', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })
    await renderH({ params: { id: 'p1' }, body: { channels: ['radio'] }, context: {} } as any)
    expect(mockCreateRenderJob.mock.calls[0][0].channels).toEqual(['radio'])
  })
  it('400s on an unknown channel', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    await expect(renderH({ params: { id: 'p1' }, body: { channels: ['bogus'] }, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('GET /agency/audio/projects/:id/render-jobs', () => {
  it('lists render jobs', async () => {
    mockListRenderJobs.mockResolvedValue([{ id: 'j1' }])
    const res = await jobsH({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ jobs: [{ id: 'j1' }] })
    expect(mockListRenderJobs).toHaveBeenCalledWith('p1')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/mediaRenderApi.test.ts`
Expected: FAIL — endpoint + renderQueue modules don't exist.

- [ ] **Step 3: Write the enqueue boundary**

Create `server/utils/audio/renderQueue.ts`:

```ts
// server/utils/audio/renderQueue.ts — thin producer boundary to the timeline-render
// CF Queue. Isolated so endpoints stay testable (mock this module) and so the
// binding-lookup gotcha (CF Pages producer binding) lives in one place.
import type { AudioChannel } from '~~/server/utils/audio/profiles'

export interface TimelineRenderMessage {
  jobId: string
  projectId: string
  timelineId: string
  channels: AudioChannel[]
}

interface QueueBinding { send(body: unknown): Promise<void> }

/** Resolve the producer binding from the CF env on the event context. Returns null
 * when unbound (local dev / missing binding) so the caller can decide. */
function getQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.TIMELINE_RENDER_QUEUE as QueueBinding) ?? null
}

export async function enqueueTimelineRender(event: any, msg: TimelineRenderMessage): Promise<void> {
  const queue = getQueue(event)
  if (!queue) throw new Error('TIMELINE_RENDER_QUEUE binding unavailable')
  await queue.send(msg)
}
```

- [ ] **Step 4: Write the render endpoint**

Create `server/api/agency/audio/projects/[id]/render.post.ts`:

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline, createRenderJob } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'
import { enqueueTimelineRender } from '~~/server/utils/audio/renderQueue'
import type { AudioChannel } from '~~/server/utils/audio/profiles'

const ALL_CHANNELS: AudioChannel[] = ['radio', 'tiktok', 'meta']
const BodySchema = z.object({
  channels: z.array(z.enum(['radio', 'tiktok', 'meta'])).nonempty().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = BodySchema.parse(await readBody(event))
  const channels = body.channels ?? ALL_CHANNELS

  const existing = await getProjectWithCurrentTimeline(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (!existing.project.currentTimelineId || !existing.timeline) {
    throw createError({ statusCode: 409, statusMessage: 'Project has no current timeline to render' })
  }

  // Validate the exact state we are about to freeze + render.
  const parsed = TimelineStateSchema.safeParse(existing.timeline.state)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map((i) => i.message) } })
  }
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const job = await createRenderJob({ projectId: id, requestedBy: user.id, channels })
  await enqueueTimelineRender(event, {
    jobId: job.id, projectId: id, timelineId: job.timelineId, channels
  })

  setResponseStatus(event, 202)
  return { job }
})
```

- [ ] **Step 5: Write the status endpoint**

Create `server/api/agency/audio/projects/[id]/render-jobs.get.ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { listRenderJobs } from '~~/server/utils/audio/projects'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const jobs = await listRenderJobs(id)
  return { jobs }
})
```

- [ ] **Step 6: Run to verify the endpoint tests pass**

Run: `pnpm exec vitest run test/audio/mediaRenderApi.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 7: Commit**

```bash
git add server/utils/audio/renderQueue.ts "server/api/agency/audio/projects/[id]/render.post.ts" "server/api/agency/audio/projects/[id]/render-jobs.get.ts" test/audio/mediaRenderApi.test.ts
git commit -m "feat(media-studio): SP1 render enqueue + status endpoints"
```

---

## Task 5: Worker — timeline-render consumer + orchestration

The worker branches its `queue()` handler on `batch.queue`, and a new `timelineRenderWorker.ts` orchestrates: mark rendering → master via Container → reuse `renderVariants` per channel → mark done with `cost_cents`. Unit-tested with mocks (the `musicWorker` pattern).

**Files:**
- Modify: `workers/audio-jobs/src/index.ts`
- Create: `workers/audio-jobs/src/timelineRenderWorker.ts`
- Modify: `workers/audio-jobs/src/db.ts`
- Test: `test/audio/timelineRenderWorker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/audio/timelineRenderWorker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTimelineRenderJob } from '../../workers/audio-jobs/src/timelineRenderWorker'

// Collaborators are injected, so the orchestration is testable without CF/ffmpeg.
function makeDeps(overrides: any = {}) {
  return {
    loadTimelineState: vi.fn().mockResolvedValue({
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 5,
      tracks: [{ id: 't', name: 'M', kind: 'music', clips: [
        { id: 'c', r2_key: 'k/c', timeline_start_sec: 0, source_out_sec: 5,
          source_in_sec: 0, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear', asset_id: null } ] }],
      ducking: []
    }),
    markRendering: vi.fn().mockResolvedValue(undefined),
    renderMaster: vi.fn().mockResolvedValue({ masterKey: 'media/p1/j1/master.wav', wallClockSec: 4 }),
    renderVariants: vi.fn().mockResolvedValue({ radio: 'media/p1/j1/radio.wav' }),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    centsPerSec: 3,
    ...overrides
  }
}

const msg = { jobId: 'j1', projectId: 'p1', timelineId: 't2', channels: ['radio'] }

beforeEach(() => vi.clearAllMocks())

describe('runTimelineRenderJob', () => {
  it('marks rendering, renders master+variants, marks done with cost_cents', async () => {
    const d = makeDeps()
    await runTimelineRenderJob(msg, d as any)
    expect(d.markRendering).toHaveBeenCalledWith('j1')
    expect(d.renderMaster).toHaveBeenCalled()
    expect(d.renderVariants).toHaveBeenCalledWith(expect.objectContaining({ masterKey: 'media/p1/j1/master.wav', channels: ['radio'] }))
    // cost = round(wallClockSec 4 * centsPerSec 3) = 12
    expect(d.markDone).toHaveBeenCalledWith('j1', { radio: 'media/p1/j1/radio.wav' }, 12)
    expect(d.markFailed).not.toHaveBeenCalled()
  })

  it('marks failed (and rethrows for queue retry) when the master render throws', async () => {
    const d = makeDeps({ renderMaster: vi.fn().mockRejectedValue(new Error('ffmpeg boom')) })
    await expect(runTimelineRenderJob(msg, d as any)).rejects.toThrow('ffmpeg boom')
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'ffmpeg boom')
    expect(d.markDone).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineRenderWorker.test.ts`
Expected: FAIL — `runTimelineRenderJob` doesn't exist.

- [ ] **Step 3: Write the orchestration (pure-ish, injected deps)**

Create `workers/audio-jobs/src/timelineRenderWorker.ts`:

```ts
// workers/audio-jobs/src/timelineRenderWorker.ts — orchestrates a timeline-render
// job. Collaborators (DB writers, master render, variant render) are injected so the
// control flow is unit-testable without CF bindings / ffmpeg. The real wiring lives
// in index.ts (queue branch) which constructs the deps from env.
import type { TimelineRenderMessage } from '../../../server/utils/audio/renderQueue'

export interface RenderJobDeps {
  loadTimelineState(timelineId: string): Promise<any>
  markRendering(jobId: string): Promise<void>
  renderMaster(args: { projectId: string; jobId: string; state: any }): Promise<{ masterKey: string; wallClockSec: number }>
  renderVariants(args: { projectId: string; jobId: string; masterKey: string; channels: string[]; clientId: string | null }): Promise<Record<string, string>>
  markDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void>
  markFailed(jobId: string, error: string): Promise<void>
  centsPerSec: number
  clientId?: string | null
}

export async function runTimelineRenderJob(msg: TimelineRenderMessage, deps: RenderJobDeps): Promise<void> {
  try {
    await deps.markRendering(msg.jobId)
    const state = await deps.loadTimelineState(msg.timelineId)
    const { masterKey, wallClockSec } = await deps.renderMaster({ projectId: msg.projectId, jobId: msg.jobId, state })
    const variants = await deps.renderVariants({
      projectId: msg.projectId, jobId: msg.jobId, masterKey, channels: msg.channels, clientId: deps.clientId ?? null
    })
    const costCents = Math.round(wallClockSec * deps.centsPerSec)
    await deps.markDone(msg.jobId, variants, costCents)
  } catch (e: any) {
    const message = e?.message ?? String(e)
    await deps.markFailed(msg.jobId, message)
    throw e // rethrow so the queue retries
  }
}
```

- [ ] **Step 4: Run to verify the orchestration test passes**

Run: `pnpm exec vitest run test/audio/timelineRenderWorker.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the worker-side DB writers + queue branch (no unit test — thin CF glue)**

In `workers/audio-jobs/src/db.ts`, add render-job status writers mirroring the existing music writers (use the file's existing query helper; pattern shown):

```ts
// Render-job status writers (Hyperdrive→Neon). Mirror the music writers in this file.
export async function dbMarkRenderRendering(jobId: string): Promise<void> {
  await query(`UPDATE media_render_jobs SET status='rendering', updated_at=now() WHERE id=$1`, [jobId])
}
export async function dbMarkRenderDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void> {
  await query(`UPDATE media_render_jobs SET status='done', variants=$1, cost_cents=$2, updated_at=now() WHERE id=$3`,
    [JSON.stringify(variants), costCents, jobId])
}
export async function dbMarkRenderFailed(jobId: string, error: string): Promise<void> {
  await query(`UPDATE media_render_jobs SET status='failed', error=$1, updated_at=now() WHERE id=$2`, [error, jobId])
}
export async function dbLoadTimelineState(timelineId: string): Promise<any> {
  const rows = await query(`SELECT state FROM media_timelines WHERE id=$1`, [timelineId])
  if (!rows[0]) throw new Error(`timeline ${timelineId} not found`)
  return rows[0].state
}
```

> Adapt `query(...)` to `db.ts`'s actual exported helper name (check the file — it mirrors `server/utils/db.ts`). Keep the SQL identical to the gateway's.

Then in `workers/audio-jobs/src/index.ts`, branch the `queue()` handler on `batch.queue`. Replace the body of `queue()` with:

```ts
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    if (batch.queue === 'timeline-render') {
      const { runTimelineRenderJob } = await import('./timelineRenderWorker')
      const { renderVariants } = await import('./renderVariants')
      const { renderTimelineMaster } = await import('./timelineMasterRender')
      const db = await import('./db')
      for (const msg of batch.messages) {
        try {
          await runTimelineRenderJob(msg.body as any, {
            loadTimelineState: db.dbLoadTimelineState,
            markRendering: db.dbMarkRenderRendering,
            markDone: db.dbMarkRenderDone,
            markFailed: db.dbMarkRenderFailed,
            renderMaster: ({ projectId, jobId, state }) =>
              renderTimelineMaster({ RENDER: env.RENDER, AUDIO_BUCKET: env.AUDIO_BUCKET as any }, { projectId, jobId, state }),
            renderVariants: ({ projectId, jobId, masterKey, channels, clientId }) =>
              renderVariants({ RENDER: env.RENDER, AUDIO_BUCKET: env.AUDIO_BUCKET as any },
                { clientId, assetId: `${projectId}/${jobId}`, masterKey, channels }),
            centsPerSec: Number(env.RENDER_CENTS_PER_SEC ?? '2')
          })
          msg.ack()
        } catch (e) {
          console.error('audio-jobs.timeline-render.error', (msg.body as any)?.jobId, e)
          msg.retry({ delaySeconds: 30 })
        }
      }
      return
    }

    // existing music-gen path
    const { runMusicJob } = await import('./musicWorker')
    for (const msg of batch.messages) {
      try {
        await runMusicJob(msg.body, { AI: env.AI, AUDIO_BUCKET: env.AUDIO_BUCKET as any, RENDER: env.RENDER })
        msg.ack()
      } catch (e) {
        console.error('audio-jobs.queue.error', msg.body?.assetId, e)
        msg.retry({ delaySeconds: 30 })
      }
    }
```

Add to the `Env` interface in `index.ts`: `RENDER_CENTS_PER_SEC?: string`. Note `renderVariants`' `buildVariantKey` writes `audio/<clientId|org>/<assetId>/<channel>.<ext>`; passing `assetId = "<projectId>/<jobId>"` yields the spec's `media`-adjacent keyspace under `audio/…/<projectId>/<jobId>/<channel>` — acceptable (same bucket). If you want the literal `media/<projectId>/<jobId>/…` prefix, add a `keyPrefix` option to `renderVariants` in this task and pass it; otherwise keep the `audio/` prefix and update the spec note. (Decide and keep consistent.)

> `timelineMasterRender.ts` (the `renderTimelineMaster` that downloads clips, calls the Container `/render-timeline`, uploads the master, returns `{ masterKey, wallClockSec }`) is implemented in Task 6 alongside the Container endpoint, since the two are the same contract.

- [ ] **Step 6: Run the worker orchestration test again (still green) + commit**

Run: `pnpm exec vitest run test/audio/timelineRenderWorker.test.ts`
Expected: PASS (the injected-deps test is unaffected by the CF glue).

```bash
git add workers/audio-jobs/src/timelineRenderWorker.ts workers/audio-jobs/src/index.ts workers/audio-jobs/src/db.ts test/audio/timelineRenderWorker.test.ts
git commit -m "feat(media-studio): SP1 worker timeline-render consumer + orchestration"
```

---

## Task 6: Container `/render-timeline` + filtergraph port + sync test

The Container gains a master-render endpoint; the TS builder is ported to `.mjs` (the `render.ts`↔`render.mjs` convention) and a sync test guards drift. `timelineMasterRender.ts` is the Worker side of this contract.

**Files:**
- Create: `workers/audio-jobs/container/timelineFiltergraph.mjs`
- Modify: `workers/audio-jobs/container/server.mjs`
- Create: `workers/audio-jobs/src/timelineMasterRender.ts`
- Test: `test/audio/timelineFiltergraphSync.test.ts`

- [ ] **Step 1: Write the failing sync test**

Create `test/audio/timelineFiltergraphSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { buildTimelineFiltergraph as buildTs, buildMasterRenderArgs as argsTs } from '~~/server/utils/audio/timelineFiltergraph'
// @ts-expect-error — .mjs port, no types
import { buildTimelineFiltergraph as buildMjs, buildMasterRenderArgs as argsMjs } from '../../workers/audio-jobs/container/timelineFiltergraph.mjs'

const fixture = TimelineStateSchema.parse({
  tracks: [
    { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
      { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 1, source_out_sec: 6, gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] },
    { id: 'mus', name: 'M', kind: 'music', gain_db: -2, clips: [
      { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 },
      { id: 'c', r2_key: 'k/c', timeline_start_sec: 30, source_out_sec: 45 } ] }
  ],
  ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
})

describe('TS ↔ MJS filtergraph port parity', () => {
  it('produce identical filter_complex + master argv for a representative timeline', () => {
    const ts = buildTs(fixture)
    const mjs = buildMjs(fixture)
    expect(mjs.filterComplex).toBe(ts.filterComplex)
    expect(mjs.inputs).toEqual(ts.inputs)
    const paths = ts.inputs.map((_, i) => `/tmp/in${i}.wav`)
    expect(argsMjs(mjs, paths, '/tmp/m.wav')).toEqual(argsTs(ts, paths, '/tmp/m.wav'))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineFiltergraphSync.test.ts`
Expected: FAIL — `timelineFiltergraph.mjs` doesn't exist.

- [ ] **Step 3: Port the builder to `.mjs`**

Create `workers/audio-jobs/container/timelineFiltergraph.mjs` as a **verbatim JS port** of `server/utils/audio/timelineFiltergraph.ts` (drop the TS types; keep `computeDuration` — port it too or import from a `.mjs` twin). To keep the port self-contained, inline a minimal `computeDuration` matching SP0's:

```js
// workers/audio-jobs/container/timelineFiltergraph.mjs — Node port of
// server/utils/audio/timelineFiltergraph.ts. KEEP IN SYNC (the render.ts↔render.mjs
// convention; guarded by test/audio/timelineFiltergraphSync.test.ts).
export function curveToken(curve) {
  if (curve === 'exp') return 'exp'
  if (curve === 'log') return 'log'
  return 'tri'
}
function computeDuration(state) {
  let max = 0
  for (const track of state.tracks) for (const clip of track.clips) {
    const end = clip.source_out_sec ?? null
    const clipEnd = end == null ? clip.timeline_start_sec : clip.timeline_start_sec + (end - clip.source_in_sec)
    if (clipEnd > max) max = clipEnd
  }
  return max
}
export function duckRatioFromAmountDb(amountDb) {
  const mag = Math.abs(amountDb)
  const ratio = Math.round((1 + mag / 3) * 10) / 10
  return Math.min(20, Math.max(1, ratio))
}
function buildClipAndTrackChains(state) {
  const acc = { inputs: [], chains: [], busLabels: [] }
  const activeTracks = state.tracks.filter((t) => !t.muted)
  let inputIdx = 0
  for (const track of activeTracks) {
    const clipLabels = []
    for (const clip of track.clips) {
      const i = inputIdx++
      acc.inputs.push({ clipId: clip.id, r2_key: clip.r2_key })
      const parts = [`aformat=sample_rates=${state.sample_rate}:channel_layouts=stereo`]
      parts.push(clip.source_out_sec != null ? `atrim=start=${clip.source_in_sec}:end=${clip.source_out_sec}` : `atrim=start=${clip.source_in_sec}`, 'asetpts=N/SR/TB')
      if (clip.timeline_start_sec > 0) parts.push(`adelay=${Math.round(clip.timeline_start_sec * 1000)}:all=1`)
      if (clip.gain_db !== 0) parts.push(`volume=${clip.gain_db}dB`)
      if (clip.fade_in_sec > 0) parts.push(`afade=t=in:st=0:d=${clip.fade_in_sec}:curve=${curveToken(clip.fade_curve)}`)
      const playLen = clip.source_out_sec != null ? clip.source_out_sec - clip.source_in_sec : null
      if (clip.fade_out_sec > 0 && playLen != null) parts.push(`afade=t=out:st=${Math.max(0, playLen - clip.fade_out_sec)}:d=${clip.fade_out_sec}:curve=${curveToken(clip.fade_curve)}`)
      const label = `c${i}`
      acc.chains.push(`[${i}:a]${parts.join(',')}[${label}]`)
      clipLabels.push(label)
    }
    if (clipLabels.length === 0) { acc.busLabels.push(''); continue }
    const busLabel = `t${acc.busLabels.length}`
    if (clipLabels.length === 1 && track.gain_db === 0) { acc.busLabels.push(clipLabels[0]) }
    else {
      const ins = clipLabels.map((l) => `[${l}]`).join('')
      const post = track.gain_db !== 0 ? `,volume=${track.gain_db}dB` : ''
      const body = clipLabels.length === 1 ? `[${clipLabels[0]}]anull` : `${ins}amix=inputs=${clipLabels.length}:normalize=0:duration=longest`
      acc.chains.push(`${body}${post}[${busLabel}]`)
      acc.busLabels.push(busLabel)
    }
  }
  return acc
}
export function buildTimelineFiltergraph(state) {
  const acc = buildClipAndTrackChains(state)
  const activeTracks = state.tracks.filter((t) => !t.muted)
  const idToBusIdx = new Map()
  activeTracks.forEach((t, k) => idToBusIdx.set(t.id, k))
  let scCount = 0
  for (const rule of state.ducking) {
    const srcK = idToBusIdx.get(rule.source_track_id)
    const tgtK = idToBusIdx.get(rule.target_track_id)
    if (srcK == null || tgtK == null) continue
    const srcLabel = acc.busLabels[srcK]; const tgtLabel = acc.busLabels[tgtK]
    if (!srcLabel || !tgtLabel) continue
    const keepLabel = `${srcLabel}a`; const scLabel = `sc${scCount++}`
    acc.chains.push(`[${srcLabel}]asplit=2[${keepLabel}][${scLabel}]`)
    acc.busLabels[srcK] = keepLabel
    const duckedLabel = `d${tgtK}`; const ratio = duckRatioFromAmountDb(rule.amount_db)
    acc.chains.push(`[${tgtLabel}][${scLabel}]sidechaincompress=threshold=${rule.threshold_db}:ratio=${ratio}:attack=${rule.attack_ms}:release=${rule.release_ms}[${duckedLabel}]`)
    acc.busLabels[tgtK] = duckedLabel
  }
  const buses = acc.busLabels.filter(Boolean)
  if (buses.length === 1) acc.chains.push(`[${buses[0]}]alimiter=limit=0.95[mix]`)
  else if (buses.length > 1) acc.chains.push(`${buses.map((b) => `[${b}]`).join('')}amix=inputs=${buses.length}:normalize=0:duration=longest,alimiter=limit=0.95[mix]`)
  return { inputs: acc.inputs, filterComplex: acc.chains.join(';'), outLabel: '[mix]', sampleRate: state.sample_rate, durationSec: computeDuration(state) }
}
export function buildMasterRenderArgs(plan, inputPaths, outputPath) {
  if (inputPaths.length !== plan.inputs.length) throw new Error(`inputPaths (${inputPaths.length}) must match plan.inputs (${plan.inputs.length})`)
  const args = ['-hide_banner', '-nostats']
  for (const p of inputPaths) args.push('-i', p)
  args.push('-filter_complex', plan.filterComplex, '-map', plan.outLabel, '-ar', String(plan.sampleRate), '-codec:a', 'pcm_s16le', '-y', outputPath)
  return args
}
```

- [ ] **Step 4: Run the sync test to verify parity**

Run: `pnpm exec vitest run test/audio/timelineFiltergraphSync.test.ts`
Expected: PASS — TS and MJS produce identical output.

- [ ] **Step 5: Add the Container `/render-timeline` endpoint**

In `workers/audio-jobs/container/server.mjs`, add an import and a route (multipart: each clip file as `input<i>`, plan as a `plan` field — but to avoid a multipart parser dep, use a simpler contract: the body is a JSON `{ plan, files: [{ name, b64 }] }`). Add near the top:

```js
import { buildMasterRenderArgs } from './timelineFiltergraph.mjs'
```

And add this route handler branch (before the final 404), reading the JSON body, writing each input to /tmp, running the master argv, returning the master WAV bytes:

```js
  if (req.method === 'POST' && req.url === '/render-timeline') {
    const dir = mkdtempSync(join(tmpdir(), 'tlrender-'))
    try {
      const payload = JSON.parse((await readBody(req)).toString('utf8')) // { plan, files: [{ b64 }] in input order }
      const paths = payload.files.map((f, i) => {
        const p = join(dir, `in${i}`)
        writeFileSync(p, Buffer.from(f.b64, 'base64'))
        return p
      })
      const outPath = join(dir, 'master.wav')
      const pass = await runFfmpeg(buildMasterRenderArgs(payload.plan, paths, outPath))
      if (pass.code !== 0) {
        console.error('timeline master ffmpeg failed', pass.stderr.slice(-800))
        res.writeHead(500); return res.end('timeline render failed')
      }
      const out = readFileSync(outPath)
      res.writeHead(200, { 'content-type': 'audio/wav' })
      return res.end(out)
    } catch (e) {
      console.error('render-timeline error', e)
      res.writeHead(500); return res.end('render-timeline error')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
```

> Base64-in-JSON is simple and dependency-free; ad-length clips are a few MB each. If payloads get large, switch to multipart in a later optimisation — out of SP1 scope.

- [ ] **Step 6: Write the Worker-side `timelineMasterRender.ts`**

Create `workers/audio-jobs/src/timelineMasterRender.ts`:

```ts
// workers/audio-jobs/src/timelineMasterRender.ts — Worker side of the Container
// /render-timeline contract: download clip sources from R2, build the filtergraph
// plan (the synced .mjs port), POST to the Container, upload the master WAV to R2.
import { getContainer } from '@cloudflare/containers'
import { buildTimelineFiltergraph } from '../container/timelineFiltergraph.mjs'

export interface MasterRenderEnv {
  RENDER: unknown
  AUDIO_BUCKET: {
    get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(key: string, body: ArrayBuffer | Uint8Array, opts?: any): Promise<unknown>
  }
}

export async function renderTimelineMaster(
  env: MasterRenderEnv,
  args: { projectId: string; jobId: string; state: any }
): Promise<{ masterKey: string; wallClockSec: number }> {
  const start = Date.now()
  const plan = buildTimelineFiltergraph(args.state)

  // Download each clip's source bytes (in plan input order) → base64 payload.
  const files: { b64: string }[] = []
  for (const input of plan.inputs) {
    const obj = await env.AUDIO_BUCKET.get(input.r2_key)
    if (!obj) throw new Error(`clip source missing in R2: ${input.r2_key}`)
    const buf = Buffer.from(await obj.arrayBuffer())
    files.push({ b64: buf.toString('base64') })
  }

  const instance = getContainer(env.RENDER, `tl:${args.jobId}`)
  // Prior-art lifecycle: keep the instance alive for a long master render so
  // sleepAfter='5m' can't reap it mid-render. renewActivityTimeout is the SDK
  // heartbeat primitive; call it before the (bounded) synchronous render call.
  ;(instance as any).renewActivityTimeout?.()
  const res = await instance.fetch('http://render.local/render-timeline', {
    method: 'POST',
    body: JSON.stringify({ plan, files }),
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(300_000)
  })
  if (!res.ok) throw new Error(`timeline master render failed: ${res.status}`)

  const masterBytes = await res.arrayBuffer()
  const masterKey = `media/${args.projectId}/${args.jobId}/master.wav`
  await env.AUDIO_BUCKET.put(masterKey, masterBytes, { httpMetadata: { contentType: 'audio/wav' } })

  return { masterKey, wallClockSec: Math.max(1, Math.round((Date.now() - start) / 1000)) }
}
```

> `Date.now()` here is fine — this is Worker runtime code, not a Workflow script.

- [ ] **Step 7: Run the sync test once more + commit**

Run: `pnpm exec vitest run test/audio/timelineFiltergraphSync.test.ts`
Expected: PASS.

```bash
git add workers/audio-jobs/container/timelineFiltergraph.mjs workers/audio-jobs/container/server.mjs workers/audio-jobs/src/timelineMasterRender.ts test/audio/timelineFiltergraphSync.test.ts
git commit -m "feat(media-studio): SP1 container /render-timeline + filtergraph port + sync guard"
```

---

## Task 7: Queue binding config + full-suite verification

**Files:**
- Modify: `workers/audio-jobs/wrangler.toml`
- (Deploy-time) dashboard Pages producer binding — documented, not code.

- [ ] **Step 1: Add the consumer to the worker's wrangler.toml**

In `workers/audio-jobs/wrangler.toml`, add a second queue consumer alongside the existing `music-gen` one (match the existing block's style):

```toml
[[queues.consumers]]
queue = "timeline-render"
max_batch_size = 1
max_retries = 3
max_batch_timeout = 5
```

> Keep `max_batch_size = 1` — renders are heavy; one job per invocation. Create the queue once via `wrangler queues create timeline-render` (document in `workers/audio-jobs/DEPLOYMENT.md`).

- [ ] **Step 2: Document the dashboard producer binding**

Append to `workers/audio-jobs/DEPLOYMENT.md` (create the section): the dashboard (agency-dashboard Pages project) needs a **Queue producer binding** `TIMELINE_RENDER_QUEUE` → queue `timeline-render`, set on the deployed Pages config (the `MUSIC_QUEUE` precedent — beware the Direct-Upload `dist/wrangler.json` override). No code change; verify post-deploy that `event.context.cloudflare.env.TIMELINE_RENDER_QUEUE` is present.

- [ ] **Step 3: Run all audio tests together**

Run: `pnpm exec vitest run test/audio/`
Expected: PASS — the SP1 files (`timelineFiltergraph`, `mediaRenderJobs`, `mediaRenderApi`, `timelineRenderWorker`, `timelineFiltergraphSync`) plus all SP0 + pre-existing audio tests green. No regressions.

- [ ] **Step 4: Type-check the new code**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E 'timelineFiltergraph|renderQueue|render\.post|render-jobs|mediaRender|MediaRenderJob' || echo "no SP1 type errors"`
Expected: `no SP1 type errors`. (Repeat the SP0 lesson: the repo runs `typescript.strict: false`, so use explicit discriminant checks — `if (check.ok === false)` — for `ValidateResult`, as already done in `render.post.ts`. A silent OOM yields a false pass — confirm real output.)

- [ ] **Step 5: Final commit (if anything was adjusted)**

```bash
git add -A
git commit -m "chore(media-studio): SP1 timeline-render queue binding + verification" || echo "nothing to commit"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- §3 pure filtergraph builder (clip atrim/adelay/volume/afade, track amix+gain+mute-drop, ducking sidechaincompress, final amix, master argv) → Tasks 1 + 2 ✅
- §4 pipeline (enqueue→snapshot version→queue→worker→container master→renderVariants→status) → Tasks 3 + 4 + 5 + 6 ✅
- §5 new dedicated `timeline-render` queue, branch on `batch.queue`, message shape → Tasks 5 + 7 ✅
- §6 two thin endpoints (render.post, render-jobs.get) → Task 4 ✅
- §7 tenancy/RBAC (`requireWriteAccess` mutation, `requireAuth` read, no per-client gating) + cost_cents capture via RENDER_CENTS_PER_SEC → Tasks 4 + 5 ✅
- §8 no migration; TDD across pure builder, gateway, endpoints, worker; container↔TS sync test → all tasks + Task 6 ✅
- §9 forward-compat (`migrateTimeline` is read before building — NOTE: add `migrateTimeline(state)` call in `renderTimelineMaster`/builder entry if a future schema bump lands; v1 identity today) → noted
- §10 risks (render.mjs sync → Task 6 sync test; ffmpeg fidelity → ear-verify; container limits → max_batch_size=1, 300s timeout) → addressed ✅

**Placeholder scan:** none — every code step is complete and runnable. The one deliberate decision point (variant keyspace `audio/` vs `media/` prefix in Task 5 Step 5) is called out explicitly with both options and a "decide and keep consistent" instruction, not left vague.

**Type consistency:** `FiltergraphPlan`/`FiltergraphInput` defined in Task 1, consumed in Tasks 2/6. `MediaRenderJob` defined in Task 3, returned by gateway + endpoints. `TimelineRenderMessage` defined in Task 4 (`renderQueue.ts`), consumed in Task 5. Gateway fn names (`createRenderJob`, `listRenderJobs`, `markRenderJobRendering/Done/Failed`, `mapRenderJobRow`) match across util, tests, endpoints, and worker db writers. `runTimelineRenderJob` deps interface matches the index.ts wiring.

**Out of scope (correctly absent):** editor UI / Web Audio / clock (SP2), render-status UX (SP3), model selector (SP4), billing/credits/caps + cost estimate (SP6 — SP1 only captures cost_cents), video/`'av'`.

**Prior-art edge cases incorporated (`oss-prior-art.md` §2/§4):** `aformat=sample_rates=<SR>:channel_layouts=stereo` is the first filter on every clip chain (the #1 silent `amix` failure) — Tasks 1 + 6; `amix` is explicit `:duration=longest` and the master ends in `alimiter=limit=0.95` to prevent pre-loudnorm WAV clipping — Tasks 1/2 + 6; `adelay=…:all=1` (per-channel trap) — Task 1; the Container `renewActivityTimeout()` heartbeat against `sleepAfter` reaping a long render — Task 6. Two-pass `loudnorm`+`linear=true` is inherited unchanged from `render.ts`.

**Carried implementation watch-items (from spec §10, not blockers):** exact ffmpeg `afade` curve tokens and the `duckRatioFromAmountDb` calibration are pinned by tests but need one ear-verify on real audio; `loudnorm`'s silent dynamic-AGC fallback under tight headroom + the VBR mp3 duration-header trap live in the reused `render.ts` (log/regression-test if touched, but out of SP1 scope); `render.mjs`/`timelineFiltergraph.mjs` duplication is guarded by the sync test but remains a maintenance surface; Container CPU/time vs worst-case timelines should be checked under load.
