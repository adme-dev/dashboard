# Media Studio SP2a — Headless Audio Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A headless, framework-agnostic browser audio engine that plays an SP0 `TimelineState` with sample-accurate timing — a pure schedule planner, a lookahead-scheduling engine adapter over an injected `AudioContext`, and an `OfflineAudioContext` Tier-1 preview.

**Architecture:** A pure planner (`audioSchedulePlanner.ts`) turns the timeline into `{tracks, clips, ramps}` + a `windowEvents` lookahead slice (exact-output unit tests). A thin engine adapter (`useAudioEngine.ts`) owns per-track gain buses + a ~25 ms lookahead loop over an **injected** `BaseAudioContext`/timer/`resolveBuffer` (unit-tested with spy nodes — no real audio). `OfflineAudioContext` preview reuses the planner. `AudioContext.currentTime` is the master clock; GSAP slaves to it in SP2b.

**Tech Stack:** Nuxt 4 client (`app/`), Vue composable, Vitest (node env, mocked Web Audio). **No new dependency in SP2a** — the engine takes an injected context; `standardized-audio-context` + the real-context factory are deferred to SP2b (the refinement of spec §1/§5). Consumes the SP0 `TimelineState` type (type-only import).

**Spec:** `docs/superpowers/specs/2026-06-02-media-studio-sp2a-audio-engine-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `app/utils/audio/audioSchedulePlanner.ts` | **Pure** `planTimeline` (tracks/clips/ducking-ramps) + `windowEvents` + `dbToGain`. The TDD core. |
| `app/composables/useAudioEngine.ts` | Thin engine adapter: per-track gain buses + lookahead loop + transport, over injected `ctx`/`resolveBuffer`/`setTimer`. |
| `app/utils/audio/offlinePreview.ts` | `OfflineAudioContext` Tier-1 preview mixdown (reuses the planner). |
| `test/audio/audioSchedulePlanner.test.ts` | Pure planner tests (exact outputs). |
| `test/audio/audioEngine.test.ts` | Engine adapter tests (mock ctx + fake timer). |
| `test/audio/offlinePreview.test.ts` | Preview test (mock OfflineAudioContext). |

Client-side under `app/`; tests in `test/audio/` (consistent with SP0/SP1), importing via `~~/app/utils/...` and `~~/app/composables/...`.

---

## Task 1: Pure planner — `planTimeline` (tracks + clips) + `dbToGain`

**Files:**
- Create: `app/utils/audio/audioSchedulePlanner.ts`
- Test: `test/audio/audioSchedulePlanner.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/audio/audioSchedulePlanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, dbToGain } from '~~/app/utils/audio/audioSchedulePlanner'

function tl(raw: any) {
  return TimelineStateSchema.parse(raw)
}

describe('dbToGain', () => {
  it('converts decibels to linear amplitude', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501187, 5)
    expect(dbToGain(-Infinity)).toBe(0)
  })
})

describe('planTimeline — tracks', () => {
  it('emits one bus per non-muted track with its gain in dB', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', gain_db: -2, clips: [] },
      { id: 'mus', name: 'M', kind: 'music', muted: true, clips: [] }
    ] })
    const plan = planTimeline(s)
    expect(plan.tracks).toEqual([{ trackId: 'vo', gainDb: -2 }])
  })
})

describe('planTimeline — clips', () => {
  it('flattens non-muted clips, sorted by timeline start, with resolved fields', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 10, source_out_sec: 20 } ] },
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_in_sec: 1, source_out_sec: 6,
          gain_db: -3, fade_in_sec: 0.5, fade_out_sec: 1, fade_curve: 'exp' } ] }
    ] })
    const plan = planTimeline(s)
    expect(plan.clips).toEqual([
      { clipId: 'a', trackId: 'vo', r2_key: 'k/a', timelineStartSec: 0, sourceInSec: 1,
        durationSec: 5, gainDb: -3, fadeInSec: 0.5, fadeOutSec: 1, fadeCurve: 'exp' },
      { clipId: 'b', trackId: 'mus', r2_key: 'k/b', timelineStartSec: 10, sourceInSec: 0,
        durationSec: 10, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear' }
    ])
  })

  it('leaves durationSec null when source_out_sec is null, and skips muted tracks', () => {
    const s = tl({ tracks: [
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: null } ] },
      { id: 'sfx', name: 'S', kind: 'sfx', muted: true, clips: [
        { id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 5 } ] }
    ] })
    const plan = planTimeline(s)
    expect(plan.clips).toEqual([
      { clipId: 'b', trackId: 'mus', r2_key: 'k/b', timelineStartSec: 0, sourceInSec: 0,
        durationSec: null, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear' }
    ])
    expect(plan.ramps).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/audioSchedulePlanner.test.ts`
Expected: FAIL — cannot resolve `~~/app/utils/audio/audioSchedulePlanner`.

- [ ] **Step 3: Write the planner (tracks + clips; ramps come in Task 2)**

Create `app/utils/audio/audioSchedulePlanner.ts`:

```ts
// app/utils/audio/audioSchedulePlanner.ts — PURE Web-Audio schedule planner.
// No I/O. Turns an SP0 TimelineState into the timed events the engine adapter
// (useAudioEngine.ts) and the offline preview both consume — so preview, live
// playback, and (via the shared contract) the SP1 ffmpeg render all agree.
// Mirrors the render-side timelineFiltergraph.ts on the contract; this is the
// browser-side compilation (gain ramps instead of sidechaincompress, since Web
// Audio has no sidechain — OSS prior-art §1).
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

export interface TrackBus {
  trackId: string
  gainDb: number
}

export interface ScheduledClip {
  clipId: string
  trackId: string
  r2_key: string
  timelineStartSec: number
  sourceInSec: number
  durationSec: number | null // null = play to source end (adapter fills from the decoded buffer)
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  fadeCurve: 'linear' | 'exp' | 'log'
}

export interface DuckRamp {
  targetTrackId: string
  atSec: number      // timeline time the ramp starts
  toGainDb: number   // amount_db (duck down) or 0 (restore)
  rampSec: number    // attack (down) or release (restore), seconds
}

export interface TimelinePlan {
  tracks: TrackBus[]
  clips: ScheduledClip[]
  ramps: DuckRamp[]
}

/** Decibels → linear amplitude. -Infinity → 0. Shared by the engine + preview gain math. */
export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : Math.pow(10, db / 20)
}

/** Pure: TimelineState → ordered track buses + timed clips + ducking ramps.
 * Muted tracks are dropped entirely (parity with SP1). Ramps added in Task 2. */
export function planTimeline(state: TimelineState): TimelinePlan {
  const active = state.tracks.filter((t) => !t.muted)

  const tracks: TrackBus[] = active.map((t) => ({ trackId: t.id, gainDb: t.gain_db }))

  const clips: ScheduledClip[] = []
  for (const track of active) {
    for (const clip of track.clips) {
      clips.push({
        clipId: clip.id,
        trackId: track.id,
        r2_key: clip.r2_key,
        timelineStartSec: clip.timeline_start_sec,
        sourceInSec: clip.source_in_sec,
        durationSec: clip.source_out_sec != null ? clip.source_out_sec - clip.source_in_sec : null,
        gainDb: clip.gain_db,
        fadeInSec: clip.fade_in_sec,
        fadeOutSec: clip.fade_out_sec,
        fadeCurve: clip.fade_curve
      })
    }
  }
  clips.sort((a, b) => a.timelineStartSec - b.timelineStartSec)

  return { tracks, clips, ramps: [] }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/audioSchedulePlanner.test.ts`
Expected: PASS — dbToGain + tracks + clips green.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/audioSchedulePlanner.ts test/audio/audioSchedulePlanner.test.ts
git commit -m "feat(media-studio): SP2a pure planner — tracks/clips + dbToGain"
```

---

## Task 2: Planner — ducking ramps + `windowEvents`

**Files:**
- Modify: `app/utils/audio/audioSchedulePlanner.ts`
- Test: `test/audio/audioSchedulePlanner.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `test/audio/audioSchedulePlanner.test.ts`:

```ts
import { windowEvents } from '~~/app/utils/audio/audioSchedulePlanner'

describe('planTimeline — ducking ramps', () => {
  it('emits a down ramp at each source-clip start and a restore at its end', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 2, source_in_sec: 0, source_out_sec: 5 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    // VO clip plays [2, 2+(5-0)=7); duck mus down at 2 over 0.05s, restore at 7 over 0.3s
    expect(planTimeline(s).ramps).toEqual([
      { targetTrackId: 'mus', atSec: 2, toGainDb: -12, rampSec: 0.05 },
      { targetTrackId: 'mus', atSec: 7, toGainDb: 0, rampSec: 0.3 }
    ])
  })

  it('emits only a down ramp when the source clip has null source_out_sec (restore filled by adapter)', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: null } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -10 }]
    })
    expect(planTimeline(s).ramps).toEqual([
      { targetTrackId: 'mus', atSec: 0, toGainDb: -10, rampSec: 0.05 }
    ])
  })

  it('skips a rule whose source or target track is muted/absent', () => {
    const s = tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', muted: true, clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
    })
    expect(planTimeline(s).ramps).toEqual([])
  })
})

describe('windowEvents', () => {
  it('slices clips and ramps to [fromSec, toSec)', () => {
    const plan = planTimeline(tl({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 },
          { id: 'a2', r2_key: 'k/a2', timeline_start_sec: 10, source_out_sec: 12 } ] },
        { id: 'mus', name: 'M', kind: 'music', clips: [
          { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12 }]
    }))
    // window [0, 6): clips starting in [0,6) = a(0), b(0); ramps atSec in [0,6) = down@0
    const w = windowEvents(plan, 0, 6)
    expect(w.clips.map((c) => c.clipId).sort()).toEqual(['a', 'b'])
    expect(w.ramps).toEqual([{ targetTrackId: 'mus', atSec: 0, toGainDb: -12, rampSec: 0.05 }])
    // window [6, 12): clip a2 (10); ramps: restore@5 is NOT in [6,12); a2 down@10 is
    const w2 = windowEvents(plan, 6, 12)
    expect(w2.clips.map((c) => c.clipId)).toEqual(['a2'])
    expect(w2.ramps).toEqual([{ targetTrackId: 'mus', atSec: 10, toGainDb: -12, rampSec: 0.05 }])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/audioSchedulePlanner.test.ts`
Expected: FAIL — ramps empty / `windowEvents` not exported.

- [ ] **Step 3: Implement ducking ramps + windowEvents**

In `app/utils/audio/audioSchedulePlanner.ts`, replace the `return { tracks, clips, ramps: [] }` line at the end of `planTimeline` with ramp computation, and add `windowEvents`:

```ts
  // Ducking → scheduled gain ramps on the target bus at each source-clip boundary.
  const activeIds = new Set(active.map((t) => t.id))
  const ramps: DuckRamp[] = []
  for (const rule of state.ducking) {
    // Skip if either side is muted/absent (no bus to ramp / no trigger audio).
    if (!activeIds.has(rule.source_track_id) || !activeIds.has(rule.target_track_id)) continue
    const sourceTrack = active.find((t) => t.id === rule.source_track_id)!
    for (const clip of sourceTrack.clips) {
      const start = clip.timeline_start_sec
      ramps.push({ targetTrackId: rule.target_track_id, atSec: start, toGainDb: rule.amount_db, rampSec: rule.attack_ms / 1000 })
      // Restore only when the source clip's end is known; null-out clips get their
      // restore filled by the adapter once the decoded buffer duration is available.
      if (clip.source_out_sec != null) {
        const end = start + (clip.source_out_sec - clip.source_in_sec)
        ramps.push({ targetTrackId: rule.target_track_id, atSec: end, toGainDb: 0, rampSec: rule.release_ms / 1000 })
      }
    }
  }
  ramps.sort((a, b) => a.atSec - b.atSec)

  return { tracks, clips, ramps }
}

/** Pure lookahead slice: clips whose start ∈ [fromSec, toSec) and ramps whose
 * atSec ∈ [fromSec, toSec). The per-tick heart of the scheduler loop. */
export function windowEvents(plan: TimelinePlan, fromSec: number, toSec: number): { clips: ScheduledClip[]; ramps: DuckRamp[] } {
  return {
    clips: plan.clips.filter((c) => c.timelineStartSec >= fromSec && c.timelineStartSec < toSec),
    ramps: plan.ramps.filter((r) => r.atSec >= fromSec && r.atSec < toSec)
  }
}
```

(Remove the now-replaced `return { tracks, clips, ramps: [] }`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/audioSchedulePlanner.test.ts`
Expected: PASS — all planner + windowEvents tests green.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/audioSchedulePlanner.ts test/audio/audioSchedulePlanner.test.ts
git commit -m "feat(media-studio): SP2a planner — ducking gain-ramps + windowEvents"
```

---

## Task 3: Engine adapter — `useAudioEngine`

The thin imperative layer. Injected `ctx`/`resolveBuffer`/`setTimer`/`now` make it unit-testable with no real audio.

**Files:**
- Create: `app/composables/useAudioEngine.ts`
- Test: `test/audio/audioEngine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/audio/audioEngine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { createAudioEngine } from '~~/app/composables/useAudioEngine'

// Mock Web Audio: spy gain/source nodes + a controllable currentTime.
function makeMockCtx() {
  let t = 0
  const gains: any[] = []
  const sources: any[] = []
  const ctx: any = {
    get currentTime() { return t },
    destination: { id: 'dest' },
    state: 'suspended',
    resume: vi.fn(async () => { ctx.state = 'running' }),
    createGain() {
      const g = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
      gains.push(g); return g
    },
    createBufferSource() {
      const s = { buffer: null as any, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }
      sources.push(s); return s
    }
  }
  return { ctx, gains, sources, advance: (to: number) => { t = to } }
}

// Fake timer: capture the latest callback so the test can pump ticks deterministically.
function makeFakeTimer() {
  let cb: (() => void) | null = null
  const setTimer = (fn: () => void) => { cb = fn; return () => { cb = null } }
  return { setTimer, tick: () => { const f = cb; cb = null; f && f() } }
}

const stubBuffer = { duration: 30, length: 1440000, numberOfChannels: 2, sampleRate: 48000 } as any

function makeEngine(state: any, over: any = {}) {
  const m = makeMockCtx()
  const timer = makeFakeTimer()
  const resolveBuffer = vi.fn(async () => stubBuffer)
  const engine = createAudioEngine({
    ctx: m.ctx, resolveBuffer, setTimer: timer.setTimer, now: () => 0, ...over
  })
  return { engine, ...m, timer, resolveBuffer }
}

const oneClip = TimelineStateSchema.parse({
  tracks: [{ id: 'mus', name: 'M', kind: 'music', clips: [
    { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] }],
  ducking: []
})

beforeEach(() => vi.clearAllMocks())

describe('createAudioEngine — load', () => {
  it('creates one gain bus per track and pre-resolves clip buffers', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    expect(h.gains).toHaveLength(1)            // one track bus
    expect(h.gains[0].connect).toHaveBeenCalledWith(h.ctx.destination)
    expect(h.resolveBuffer).toHaveBeenCalledTimes(1)
    expect(h.engine.duration()).toBe(10)
  })
})

describe('createAudioEngine — play schedules due clips', () => {
  it('resumes ctx and starts the clip at its timeline time on the first tick', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    h.engine.play()
    expect(h.ctx.resume).toHaveBeenCalled()
    h.timer.tick() // first lookahead tick at currentTime 0
    expect(h.sources).toHaveLength(1)
    // start(when, offset, duration): when = ctxStart(0) + clipStart(0) = 0, offset 0, dur 10
    expect(h.sources[0].start).toHaveBeenCalledWith(0, 0, 10)
    expect(h.engine.isPlaying()).toBe(true)
  })

  it('does not re-schedule an already-scheduled clip on a later tick', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    h.engine.play()
    h.timer.tick()            // schedules clip b (start 0, within [0,0.1))
    h.advance(0.05)
    h.timer.tick()            // window moves to [0.1,...); clip b not re-scheduled
    expect(h.sources).toHaveLength(1)
  })
})

describe('createAudioEngine — ducking ramp on the target bus', () => {
  it('ramps the target track bus gain at the duck boundary', async () => {
    const ducked = TimelineStateSchema.parse({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
        { id: 'mus', name: 'M', kind: 'music', clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    const h = makeEngine(ducked)
    await h.engine.load(ducked)
    // buses created in track order: gains[0]=vo, gains[1]=mus
    h.engine.play()
    h.timer.tick() // window [0,0.1): down ramp at 0 on mus bus
    const musBus = h.gains[1]
    // ramp to dbToGain(-12) ≈ 0.251189 reached at 0 + 0.05
    expect(musBus.gain.linearRampToValueAtTime).toHaveBeenCalled()
    const [val, when] = musBus.gain.linearRampToValueAtTime.mock.calls[0]
    expect(val).toBeCloseTo(0.251189, 5)
    expect(when).toBeCloseTo(0.05, 5)
  })
})

describe('createAudioEngine — transport', () => {
  it('seek sets currentTime; pause stops sources and freezes position', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    h.engine.play(); h.timer.tick()
    h.advance(3)
    h.engine.pause()
    expect(h.sources[0].stop).toHaveBeenCalled()
    expect(h.engine.isPlaying()).toBe(false)
    expect(h.engine.currentTime()).toBeCloseTo(3, 5)
    h.engine.seek(7)
    expect(h.engine.currentTime()).toBe(7)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/audioEngine.test.ts`
Expected: FAIL — cannot resolve `~~/app/composables/useAudioEngine`.

- [ ] **Step 3: Write the engine adapter**

Create `app/composables/useAudioEngine.ts`:

```ts
// app/composables/useAudioEngine.ts — thin Web-Audio engine adapter. The scheduling
// LOGIC is the pure planner (audioSchedulePlanner.ts); this owns the imperative node
// graph + transport + the lookahead loop. Collaborators (ctx, resolveBuffer, timer)
// are injected so it's unit-testable with a mock context (no real audio). The real
// AudioContext (via standardized-audio-context) is created + injected by SP2b.
// ctx.currentTime is the MASTER clock; SP2b slaves the GSAP playhead to currentTime().
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import {
  planTimeline, windowEvents, dbToGain,
  type TimelinePlan, type ScheduledClip
} from '~~/app/utils/audio/audioSchedulePlanner'

const LOOKAHEAD_SEC = 0.1 // schedule this far ahead of the clock each tick
const TICK_MS = 25        // lookahead loop cadence

export interface AudioEngineDeps {
  ctx: any                                   // BaseAudioContext (real) or a mock
  resolveBuffer(clip: ScheduledClip): Promise<any> // AudioBuffer; fetch+decode (SP2b) or a stub
  setTimer(cb: () => void, ms: number): () => void  // setTimeout wrapper → cancel fn
  now?: () => number                         // reserved; loop uses ctx.currentTime
}

export interface AudioEngine {
  load(state: TimelineState): Promise<void>
  play(): void
  pause(): void
  seek(sec: number): void
  currentTime(): number
  duration(): number
  isPlaying(): boolean
  dispose(): void
}

export function createAudioEngine(deps: AudioEngineDeps): AudioEngine {
  const { ctx, resolveBuffer, setTimer } = deps

  let plan: TimelinePlan = { tracks: [], clips: [], ramps: [] }
  const buffers = new Map<string, any>()
  const trackBus = new Map<string, any>()
  let durationSec = 0

  let playing = false
  let ctxStart = 0           // ctx.currentTime corresponding to timeline 0
  let pausedAt = 0           // timeline position while paused
  let scheduledUpTo = 0      // timeline time we've scheduled clips/ramps through
  let cancelTimer: (() => void) | null = null
  let active: any[] = []     // live buffer sources

  async function load(state: TimelineState): Promise<void> {
    plan = planTimeline(state)
    buffers.clear(); trackBus.clear()
    for (const t of plan.tracks) {
      const bus = ctx.createGain()
      bus.gain.value = dbToGain(t.gainDb)
      bus.connect(ctx.destination)
      trackBus.set(t.trackId, bus)
    }
    durationSec = 0
    for (const clip of plan.clips) {
      const buf = await resolveBuffer(clip)
      buffers.set(clip.clipId, buf)
      const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
      durationSec = Math.max(durationSec, clip.timelineStartSec + dur)
    }
  }

  function scheduleClip(clip: ScheduledClip): void {
    const buf = buffers.get(clip.clipId)
    if (!buf) return
    const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
    const when = ctxStart + clip.timelineStartSec
    const src = ctx.createBufferSource()
    src.buffer = buf
    const clipGain = ctx.createGain()
    const target = dbToGain(clip.gainDb)
    if (clip.fadeInSec > 0) {
      clipGain.gain.setValueAtTime(0, when)
      clipGain.gain.linearRampToValueAtTime(target, when + clip.fadeInSec)
    } else {
      clipGain.gain.setValueAtTime(target, when)
    }
    if (clip.fadeOutSec > 0) {
      clipGain.gain.setValueAtTime(target, when + Math.max(0, dur - clip.fadeOutSec))
      clipGain.gain.linearRampToValueAtTime(0, when + dur)
    }
    src.connect(clipGain)
    clipGain.connect(trackBus.get(clip.trackId) ?? ctx.destination)
    src.start(when, clip.sourceInSec, dur)
    active.push(src)
  }

  function scheduleRamp(targetTrackId: string, atSec: number, toGainDb: number, rampSec: number): void {
    const bus = trackBus.get(targetTrackId)
    if (!bus) return
    bus.gain.linearRampToValueAtTime(dbToGain(toGainDb), ctxStart + atSec + rampSec)
  }

  function tick(): void {
    if (!playing) return
    const pos = ctx.currentTime - ctxStart
    const horizon = pos + LOOKAHEAD_SEC
    const due = windowEvents(plan, scheduledUpTo, horizon)
    for (const clip of due.clips) scheduleClip(clip)
    for (const r of due.ramps) scheduleRamp(r.targetTrackId, r.atSec, r.toGainDb, r.rampSec)
    scheduledUpTo = horizon
    if (pos >= durationSec) { pause(); return }
    cancelTimer = setTimer(tick, TICK_MS)
  }

  function play(): void {
    if (playing) return
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume()
    playing = true
    ctxStart = ctx.currentTime - pausedAt
    scheduledUpTo = pausedAt
    tick()
  }

  function stopActive(): void {
    for (const s of active) { try { s.stop() } catch { /* already stopped */ } }
    active = []
  }

  function pause(): void {
    if (!playing) return
    pausedAt = ctx.currentTime - ctxStart
    playing = false
    if (cancelTimer) { cancelTimer(); cancelTimer = null }
    stopActive()
  }

  function seek(sec: number): void {
    pausedAt = sec
    if (playing) {
      stopActive()
      ctxStart = ctx.currentTime - sec
      scheduledUpTo = sec
    }
  }

  function currentTime(): number {
    return playing ? ctx.currentTime - ctxStart : pausedAt
  }

  function dispose(): void {
    pause()
    for (const bus of trackBus.values()) { try { bus.disconnect() } catch { /* noop */ } }
    trackBus.clear(); buffers.clear()
  }

  return { load, play, pause, seek, currentTime, duration: () => durationSec, isPlaying: () => playing, dispose }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/audioEngine.test.ts`
Expected: PASS — load/play/no-reschedule/ducking-ramp/transport all green.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useAudioEngine.ts test/audio/audioEngine.test.ts
git commit -m "feat(media-studio): SP2a engine adapter — lookahead scheduler + transport"
```

---

## Task 4: Offline preview — `renderPreview`

**Files:**
- Create: `app/utils/audio/offlinePreview.ts`
- Test: `test/audio/offlinePreview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/audio/offlinePreview.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { renderPreview } from '~~/app/utils/audio/offlinePreview'

const stubBuffer = { duration: 10, length: 480000, numberOfChannels: 2, sampleRate: 48000 } as any

function makeOfflineCtor() {
  const gains: any[] = []
  const sources: any[] = []
  const rendered = { id: 'rendered-buffer' } as any
  const ctor: any = vi.fn(function (this: any) {
    this.currentTime = 0
    this.destination = { id: 'dest' }
    this.createGain = () => { const g = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() }; gains.push(g); return g }
    this.createBufferSource = () => { const s = { buffer: null, connect: vi.fn(), start: vi.fn() }; sources.push(s); return s }
    this.startRendering = vi.fn(async () => rendered)
  })
  return { ctor, gains, sources, rendered }
}

describe('renderPreview', () => {
  it('schedules the timeline into an OfflineAudioContext and returns the rendered buffer', async () => {
    const state = TimelineStateSchema.parse({
      tracks: [{ id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 8 } ] }],
      ducking: []
    })
    const o = makeOfflineCtor()
    const resolveBuffer = vi.fn(async () => stubBuffer)
    const out = await renderPreview(state, resolveBuffer, o.ctor)
    expect(out).toBe(o.rendered)
    expect(o.sources).toHaveLength(1)        // the one clip scheduled offline
    expect(o.sources[0].start).toHaveBeenCalled()
    expect(o.gains.length).toBeGreaterThanOrEqual(1) // a track bus
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/offlinePreview.test.ts`
Expected: FAIL — cannot resolve `~~/app/utils/audio/offlinePreview`.

- [ ] **Step 3: Write the offline preview**

Create `app/utils/audio/offlinePreview.ts`:

```ts
// app/utils/audio/offlinePreview.ts — Tier-1, NON-authoritative in-browser mixdown
// for instant scrub/preview. Reuses the pure planner so preview matches live
// playback; the ffmpeg render (SP1) remains the source of truth (browser resamplers
// drift per machine — brief §5). OfflineAudioContext is injectable for tests.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, dbToGain, type ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

export async function renderPreview(
  state: TimelineState,
  resolveBuffer: (clip: ScheduledClip) => Promise<any>,
  OfflineCtor: any = (globalThis as any).OfflineAudioContext
): Promise<any> {
  const plan = planTimeline(state)

  // Resolve buffers + compute total duration (fill null clip durations from buffers).
  const buffers = new Map<string, any>()
  let durationSec = 0
  for (const clip of plan.clips) {
    const buf = await resolveBuffer(clip)
    buffers.set(clip.clipId, buf)
    const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
    durationSec = Math.max(durationSec, clip.timelineStartSec + dur)
  }

  const sampleRate = state.sample_rate
  const length = Math.max(1, Math.ceil(durationSec * sampleRate))
  const ctx: any = new OfflineCtor(2, length, sampleRate)

  const trackBus = new Map<string, any>()
  for (const t of plan.tracks) {
    const bus = ctx.createGain()
    bus.gain.value = dbToGain(t.gainDb)
    bus.connect(ctx.destination)
    trackBus.set(t.trackId, bus)
  }

  for (const clip of plan.clips) {
    const buf = buffers.get(clip.clipId)
    if (!buf) continue
    const dur = clip.durationSec ?? Math.max(0, buf.duration - clip.sourceInSec)
    const when = clip.timelineStartSec
    const src = ctx.createBufferSource()
    src.buffer = buf
    const clipGain = ctx.createGain()
    const target = dbToGain(clip.gainDb)
    if (clip.fadeInSec > 0) {
      clipGain.gain.setValueAtTime(0, when)
      clipGain.gain.linearRampToValueAtTime(target, when + clip.fadeInSec)
    } else {
      clipGain.gain.setValueAtTime(target, when)
    }
    if (clip.fadeOutSec > 0) {
      clipGain.gain.setValueAtTime(target, when + Math.max(0, dur - clip.fadeOutSec))
      clipGain.gain.linearRampToValueAtTime(0, when + dur)
    }
    src.connect(clipGain)
    clipGain.connect(trackBus.get(clip.trackId) ?? ctx.destination)
    src.start(when, clip.sourceInSec, dur)
  }

  for (const r of plan.ramps) {
    const bus = trackBus.get(r.targetTrackId)
    if (bus) bus.gain.linearRampToValueAtTime(dbToGain(r.toGainDb), r.atSec + r.rampSec)
  }

  return ctx.startRendering()
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/offlinePreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/offlinePreview.ts test/audio/offlinePreview.test.ts
git commit -m "feat(media-studio): SP2a OfflineAudioContext Tier-1 preview"
```

---

## Task 5: Full-suite verification + contract-import check

- [ ] **Step 1: Run all audio tests**

Run: `pnpm exec vitest run test/audio/`
Expected: PASS — the 3 new SP2a files (`audioSchedulePlanner`, `audioEngine`, `offlinePreview`) plus all SP0/SP1 audio tests green. No regressions.

- [ ] **Step 2: Type-check + verify the type-only contract import resolves (spec §5)**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E 'audioSchedulePlanner|useAudioEngine|offlinePreview' || echo "no SP2a type errors"`
Expected: `no SP2a type errors`.

**If** the `import type { TimelineState } from '~~/server/utils/audio/timelineSchema'` lines error in the client tsconfig (cannot resolve server path from `app/`), apply the spec §5 fallback: move `server/utils/audio/timelineSchema.ts` to `shared/audio/timelineSchema.ts`, re-export it from the old server path (`export * from '~~/shared/audio/timelineSchema'`) so SP0/SP1 importers keep working, and update the three SP2a `import type` paths to the shared location. Re-run typecheck. (Try the type-only import first — only relocate if it actually errors. A silent OOM yields a false pass; confirm real output.)

- [ ] **Step 3: Final commit (if anything was adjusted)**

```bash
git add -A
git commit -m "test(media-studio): SP2a full-suite verification" || echo "nothing to commit"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- §3.1 pure planner (planTimeline tracks/clips/ramps, windowEvents, dbToGain) → Tasks 1 + 2 ✅
- §3.2 engine adapter (injected ctx/resolveBuffer/timer; per-track gain buses; lookahead loop; transport; ctx.currentTime master via currentTime()) → Task 3 ✅
- §3.3 OfflineAudioContext preview reusing the planner → Task 4 ✅
- §4 data flow (load→play lookahead→pause/seek; dbToGain) → Tasks 3 + 4 ✅
- §5 shared contract type via type-only import + relocate fallback → Task 5 step 2 ✅
- §6 testing (pure exact-output + mock-ctx engine + mock-OfflineAudioContext) → all tasks ✅
- Ducking-as-gain-ramps mirroring SP1's rule → Task 2 ✅

**Refinement vs spec (flagged):** SP2a is dependency-free — the engine takes an injected `BaseAudioContext`; `standardized-audio-context` + the real-context factory move to SP2b (where a real context is first created). This keeps SP2a unit-testable with no worktree dep install. (Spec §1/§5 said SP2a adds the dep; deferring to the consuming slice is cleaner and within scope.)

**Placeholder scan:** none — every step has complete, runnable code. The §5 relocate path is a documented contingency with exact steps, not a placeholder.

**Type consistency:** `TimelinePlan`/`TrackBus`/`ScheduledClip`/`DuckRamp` defined in Task 1-2, consumed by Tasks 3-4. `createAudioEngine`/`AudioEngine`/`AudioEngineDeps` (Task 3), `renderPreview` (Task 4), `planTimeline`/`windowEvents`/`dbToGain` names consistent across planner, engine, preview, and tests. The engine's clip-scheduling fade/duck logic and the offline preview's are intentionally parallel (both consume the same plan).

**Out of scope (correctly absent):** UI/drag/waveforms (SP2b), GSAP playhead (SP2b), collab (SP2b/SP3), transcript editing (SP3), Worker-timer (follow-up), real AudioContext creation + standardized-audio-context (SP2b), authoritative render (SP1).
