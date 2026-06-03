# Media Studio SP2b — Real Audio Engine + Minimal Read-Only Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SP2a headless audio engine real and audible on the smallest surface — a read-only editor page at `/agency/audio/projects/[id]` that loads an SP0 project, fetches its R2 audio via presigned URLs, and plays a synced multitrack mix (fades + ducking) with a playhead slaved to `engine.currentTime()` — plus the ramp-anchor + nominal-gain correctness fix that closes the SP2a `TODO(SP2b)`.

**Architecture:** A real `AudioContext` (via `standardized-audio-context`) + a real `resolveBuffer` (fetch presigned R2 URL → `decodeAudioData`) are injected into the existing SP2a `createAudioEngine` (no engine API change). A new authed `clip-sources` endpoint presigns only the timeline's `r2_key`s. A composable wires SP0 fetch → engine; a purpose-built read-only lane view renders tracks/clips with an rAF-driven playhead. The duck-ramp math gains a `setValueAtTime` anchor and composes with each bus's nominal gain.

**Tech Stack:** Nuxt 4 client (`app/`), Vue composable + `.client.vue` component, Nitro endpoint (`server/`), `standardized-audio-context` (new dep), Vitest (node + happy-dom, mocked Web Audio / fetch / presign). Consumes the SP0 `TimelineState` contract and the SP2a planner/engine/preview.

**Spec:** `docs/superpowers/specs/2026-06-03-media-studio-sp2b-realtime-preview-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app/composables/useAudioEngine.ts` (modify) | Add per-bus nominal/current-gain tracking; anchor + compose duck ramps; remove `TODO(SP2b)` | 1 |
| `app/utils/audio/audioSchedulePlanner.ts` (modify) | Clarify `DuckRamp.toGainDb` doc = delta-from-nominal | 1 |
| `test/audio/audioEngine.test.ts` (modify) | Assert anchor + composed-gain ramp | 1 |
| `app/utils/audio/offlinePreview.ts` (modify) | Same ramp fix in the offline pass; remove `TODO(SP2b)` | 2 |
| `test/audio/offlinePreview.test.ts` (modify) | New ducking test asserting anchor + composed gain | 2 |
| `server/utils/audio/clipSources.ts` (create) | Pure `collectClipKeys(timeline)` | 3 |
| `test/audio/clipSources.test.ts` (create) | `collectClipKeys` exact-output tests | 3 |
| `server/api/agency/audio/projects/[id]/clip-sources.get.ts` (create) | Authed, org-scoped presign of timeline keys only | 4 |
| `test/audio/clipSourcesApi.test.ts` (create) | Endpoint auth/404/presign-only-timeline-keys | 4 |
| `app/utils/audio/audioContextFactory.ts` (create) | `createBrowserAudioContext`, `browserSetTimer`, `makeR2Resolver` | 5 |
| `test/audio/audioContextFactory.test.ts` (create) | `makeR2Resolver` fetch/decode/missing/cache | 5 |
| `app/utils/audio/timelineGeometry.ts` (create) | Pure `clipRect`, `playheadX`, `trackLaneCount` | 6 |
| `test/audio/timelineGeometry.test.ts` (create) | Geometry exact-output tests | 6 |
| `app/composables/useMediaProjectEditor.ts` (create) | Wire SP0 fetch → real engine; transport + rAF clock | 7 |
| `app/components/media/MediaTimeline.client.vue` (create) | Read-only lane view + playhead | 8 |
| `app/pages/agency/audio/projects/[id].vue` (create) | Editor page: timeline + transport bar | 9 |

Tests live in `test/audio/` (consistent with SP0/SP1/SP2a), importing via `~~/`.

**Environment note:** this is a git worktree (`.claude/worktrees/media-studio-sp2`) whose `node_modules` may be symlinked. If `pnpm exec vitest` can't resolve the `~~/` alias or Nuxt types, run `pnpm exec nuxt prepare` once, then re-run. Trust the vitest exit code.

---

## Task 1: Ramp-anchor + nominal-gain fix in the engine

Closes the SP2a final-review finding (the inline `TODO(SP2b)` in `scheduleRamp`). Web Audio's `linearRampToValueAtTime` ramps from the *previous* automation event, so a duck whose `atSec > 0` currently ramps from t≈0; and the duck/restore target must compose with the bus's nominal track gain, not treat `dbToGain(0)` as unity. `DuckRamp.toGainDb` is reinterpreted as a **delta from the bus's nominal gain** (the planner already emits `amount_db` for duck and `0` for restore — no planner code change, only a doc comment).

**Files:**
- Modify: `app/composables/useAudioEngine.ts`
- Modify: `app/utils/audio/audioSchedulePlanner.ts`
- Test: `test/audio/audioEngine.test.ts`

- [ ] **Step 1: Update the failing tests**

In `test/audio/audioEngine.test.ts`, replace the entire `describe('createAudioEngine — ducking ramp on the target bus', …)` block with this expanded version (asserts the anchor and the composed gain, including a non-zero nominal track gain):

```ts
describe('createAudioEngine — ducking ramp on the target bus', () => {
  it('anchors then ramps the target bus, composing the duck with the bus nominal gain', async () => {
    const ducked = TimelineStateSchema.parse({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
        // music bus nominal gain -6 dB → duck delta -12 dB must land at -18 dB, not -12 dB
        { id: 'mus', name: 'M', kind: 'music', gain_db: -6, clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    const h = makeEngine(ducked)
    await h.engine.load(ducked)
    // buses created in track order: gains[0]=vo, gains[1]=mus
    const musBus = h.gains[1]
    h.engine.play()
    h.timer.tick() // window [0,0.1): down ramp at atSec 0 on mus bus
    // anchor: hold the bus's current (nominal) gain dbToGain(-6) ≈ 0.501187 at ctxStart+atSec = 0
    expect(musBus.gain.setValueAtTime).toHaveBeenCalled()
    const [held, anchorAt] = musBus.gain.setValueAtTime.mock.calls.at(-1)!
    expect(held).toBeCloseTo(0.501187, 5)
    expect(anchorAt).toBeCloseTo(0, 5)
    // ramp: to dbToGain(-6 + -12) = dbToGain(-18) ≈ 0.125893 at 0 + 0.05
    expect(musBus.gain.linearRampToValueAtTime).toHaveBeenCalled()
    const [val, when] = musBus.gain.linearRampToValueAtTime.mock.calls[0]
    expect(val).toBeCloseTo(0.125893, 5)
    expect(when).toBeCloseTo(0.05, 5)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/audioEngine.test.ts`
Expected: FAIL — current `scheduleRamp` never calls `setValueAtTime`, and ramps to `dbToGain(-12)` ≈ 0.251189 (not the composed `dbToGain(-18)` ≈ 0.125893).

- [ ] **Step 3: Add per-bus gain tracking state**

In `app/composables/useAudioEngine.ts`, find the state block (the `const trackBus = new Map<string, any>()` line near the top of `createAudioEngine`) and add two maps directly after it:

```ts
  const trackBus = new Map<string, any>()
  const busNominalDb = new Map<string, number>()   // each bus's nominal gain in dB
  const busCurrentGain = new Map<string, number>() // last scheduled LINEAR gain on each bus
```

- [ ] **Step 4: Populate the maps in load()**

In `load()`, the loop that builds buses currently reads:

```ts
    buffers.clear(); trackBus.clear()
    for (const t of plan.tracks) {
      const bus = ctx.createGain()
      bus.gain.value = dbToGain(t.gainDb)
      bus.connect(ctx.destination)
      trackBus.set(t.trackId, bus)
    }
```

Replace it with (clears the new maps + seeds nominal/current gain):

```ts
    buffers.clear(); trackBus.clear(); busNominalDb.clear(); busCurrentGain.clear()
    for (const t of plan.tracks) {
      const bus = ctx.createGain()
      bus.gain.value = dbToGain(t.gainDb)
      bus.connect(ctx.destination)
      trackBus.set(t.trackId, bus)
      busNominalDb.set(t.trackId, t.gainDb)
      busCurrentGain.set(t.trackId, dbToGain(t.gainDb))
    }
```

- [ ] **Step 5: Rewrite scheduleRamp (anchor + compose; drop the TODO)**

Replace the entire `scheduleRamp` function (currently carrying the `TODO(SP2b)` comment) with:

```ts
  function scheduleRamp(targetTrackId: string, atSec: number, toGainDb: number, rampSec: number): void {
    const bus = trackBus.get(targetTrackId)
    if (!bus) return
    // toGainDb is a DELTA from the bus's nominal gain (amount_db to duck, 0 to restore).
    const nominalDb = busNominalDb.get(targetTrackId) ?? 0
    const target = dbToGain(nominalDb + toGainDb)
    const held = busCurrentGain.get(targetTrackId) ?? dbToGain(nominalDb)
    const startAt = ctxStart + atSec
    // Anchor the ramp start at the held value so the gain stays flat until startAt
    // (Web Audio ramps from the previous automation event, else from t≈0), then ramp.
    bus.gain.setValueAtTime(held, startAt)
    bus.gain.linearRampToValueAtTime(target, startAt + rampSec)
    busCurrentGain.set(targetTrackId, target)
  }
```

- [ ] **Step 6: Clarify the planner DuckRamp doc**

In `app/utils/audio/audioSchedulePlanner.ts`, update the `DuckRamp.toGainDb` comment. Change:

```ts
  toGainDb: number   // amount_db (duck down) or 0 (restore)
```

to:

```ts
  toGainDb: number   // DELTA from the target bus's nominal gain: amount_db (duck) or 0 (restore)
```

- [ ] **Step 7: Run to verify pass**

Run: `pnpm exec vitest run test/audio/audioEngine.test.ts`
Expected: PASS — load/play/no-reschedule/transport unchanged; the new ducking test green.

- [ ] **Step 8: Commit**

```bash
git add app/composables/useAudioEngine.ts app/utils/audio/audioSchedulePlanner.ts test/audio/audioEngine.test.ts
git commit -m "fix(media-studio): SP2b engine duck-ramp anchor + compose with nominal gain"
```

---

## Task 2: Same ramp fix in the offline preview

`offlinePreview` builds a parallel node graph (no `ctxStart`); it has the same SP2a `TODO(SP2b)` and needs the same anchor + nominal-gain composition. Its current test has no ducking case — add one.

**Files:**
- Modify: `app/utils/audio/offlinePreview.ts`
- Test: `test/audio/offlinePreview.test.ts`

- [ ] **Step 1: Add the failing ducking test**

Append to `test/audio/offlinePreview.test.ts`:

```ts
describe('renderPreview — ducking', () => {
  it('anchors then ramps the target bus, composing the duck with the bus nominal gain', async () => {
    const state = TimelineStateSchema.parse({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
        { id: 'mus', name: 'M', kind: 'music', gain_db: -6, clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    const o = makeOfflineCtor()
    const resolveBuffer = vi.fn(async () => stubBuffer)
    await renderPreview(state, resolveBuffer, o.ctor)
    // buses created in track order: gains[0]=vo, gains[1]=mus
    const musBus = o.gains[1]
    // anchor held nominal dbToGain(-6) ≈ 0.501187 at atSec 0
    const [held, anchorAt] = musBus.gain.setValueAtTime.mock.calls.at(-1)!
    expect(held).toBeCloseTo(0.501187, 5)
    expect(anchorAt).toBeCloseTo(0, 5)
    // ramp to composed dbToGain(-18) ≈ 0.125893 at 0 + 0.05
    const [val, when] = musBus.gain.linearRampToValueAtTime.mock.calls[0]
    expect(val).toBeCloseTo(0.125893, 5)
    expect(when).toBeCloseTo(0.05, 5)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/offlinePreview.test.ts`
Expected: FAIL — no `setValueAtTime` anchor; ramps to `dbToGain(-12)` not `dbToGain(-18)`.

- [ ] **Step 3: Build the nominal/current-gain maps in renderPreview**

In `app/utils/audio/offlinePreview.ts`, the loop that builds track buses currently reads:

```ts
  const trackBus = new Map<string, any>()
  for (const t of plan.tracks) {
    const bus = ctx.createGain()
    bus.gain.value = dbToGain(t.gainDb)
    bus.connect(ctx.destination)
    trackBus.set(t.trackId, bus)
  }
```

Replace it with:

```ts
  const trackBus = new Map<string, any>()
  const busNominalDb = new Map<string, number>()
  const busCurrentGain = new Map<string, number>()
  for (const t of plan.tracks) {
    const bus = ctx.createGain()
    bus.gain.value = dbToGain(t.gainDb)
    bus.connect(ctx.destination)
    trackBus.set(t.trackId, bus)
    busNominalDb.set(t.trackId, t.gainDb)
    busCurrentGain.set(t.trackId, dbToGain(t.gainDb))
  }
```

- [ ] **Step 4: Rewrite the ramp loop (anchor + compose; drop the TODO)**

Replace the ramp loop (currently carrying the `TODO(SP2b)` comment) with:

```ts
  for (const r of plan.ramps) {
    const bus = trackBus.get(r.targetTrackId)
    if (!bus) continue
    // r.toGainDb is a DELTA from the bus's nominal gain (see DuckRamp doc).
    const nominalDb = busNominalDb.get(r.targetTrackId) ?? 0
    const target = dbToGain(nominalDb + r.toGainDb)
    const held = busCurrentGain.get(r.targetTrackId) ?? dbToGain(nominalDb)
    bus.gain.setValueAtTime(held, r.atSec)
    bus.gain.linearRampToValueAtTime(target, r.atSec + r.rampSec)
    busCurrentGain.set(r.targetTrackId, target)
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run test/audio/offlinePreview.test.ts`
Expected: PASS — the original single-clip test plus the new ducking test green.

- [ ] **Step 6: Commit**

```bash
git add app/utils/audio/offlinePreview.ts test/audio/offlinePreview.test.ts
git commit -m "fix(media-studio): SP2b offline-preview duck-ramp anchor + compose with nominal gain"
```

---

## Task 3: Pure `collectClipKeys`

**Files:**
- Create: `server/utils/audio/clipSources.ts`
- Test: `test/audio/clipSources.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/audio/clipSources.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'

function tl(raw: any) {
  return TimelineStateSchema.parse(raw)
}

describe('collectClipKeys', () => {
  it('returns distinct clip r2_keys from non-muted tracks', () => {
    const s = tl({ tracks: [
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 },
        { id: 'a2', r2_key: 'k/a', timeline_start_sec: 6, source_out_sec: 9 } ] },           // dup key
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    expect(collectClipKeys(s).sort()).toEqual(['k/a', 'k/b'])
  })

  it('skips clips on muted tracks (the engine never requests their buffers)', () => {
    const s = tl({ tracks: [
      { id: 'sfx', name: 'S', kind: 'sfx', muted: true, clips: [
        { id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 5 } ] },
      { id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 } ] }
    ] })
    expect(collectClipKeys(s)).toEqual(['k/b'])
  })

  it('returns an empty array for an empty timeline', () => {
    expect(collectClipKeys(tl({ tracks: [] }))).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/clipSources.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/audio/clipSources`.

- [ ] **Step 3: Write the helper**

Create `server/utils/audio/clipSources.ts`:

```ts
// server/utils/audio/clipSources.ts — PURE. Collect the distinct R2 keys the audio
// engine will actually request for a timeline: clips of NON-muted tracks only (the
// planner drops muted tracks, so their buffers are never resolved). The clip-sources
// endpoint presigns exactly these keys — nothing else (no arbitrary-key presign).
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

export function collectClipKeys(timeline: TimelineState): string[] {
  const keys = new Set<string>()
  for (const track of timeline.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) keys.add(clip.r2_key)
  }
  return [...keys]
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/clipSources.test.ts`
Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/clipSources.ts test/audio/clipSources.test.ts
git commit -m "feat(media-studio): SP2b collectClipKeys — distinct non-muted clip keys"
```

---

## Task 4: `clip-sources` endpoint

**Files:**
- Create: `server/api/agency/audio/projects/[id]/clip-sources.get.ts`
- Test: `test/audio/clipSourcesApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/audio/clipSourcesApi.test.ts` (mirrors the `mediaProjectsApi.test.ts` harness):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; body?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a)
}))

const mockPresign = vi.fn()
const mockIsConfigured = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  getPresignedDownloadUrl: (...a: unknown[]) => mockPresign(...a),
  isStorageConfigured: (...a: unknown[]) => mockIsConfigured(...a)
}))

const { TimelineStateSchema } = await import('~~/server/utils/audio/timelineSchema')
const { default: handler } = await import('../../server/api/agency/audio/projects/[id]/clip-sources.get')

const timeline = TimelineStateSchema.parse({
  tracks: [
    { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
    { id: 'mus', name: 'M', kind: 'music', clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] },
    { id: 'sfx', name: 'S', kind: 'sfx', muted: true, clips: [{ id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 2 }] }
  ]
})

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockIsConfigured.mockReturnValue(true)
  mockPresign.mockImplementation(async (key: string) => `https://signed/${key}`)
})

describe('GET /agency/audio/projects/:id/clip-sources', () => {
  it('requires auth', async () => {
    mockRequireAuth.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handler({ params: { id: 'p1' } } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('404s when the project (org-scoped) is not found', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(handler({ params: { id: 'p1' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('presigns ONLY the non-muted timeline keys, never an arbitrary key', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: { 'k/a': 'https://signed/k/a', 'k/b': 'https://signed/k/b' } })
    const presignedKeys = mockPresign.mock.calls.map((c) => c[0]).sort()
    expect(presignedKeys).toEqual(['k/a', 'k/b'])   // NOT 'k/x' (muted)
  })

  it('omits a key whose presign throws (rest still returned)', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline })
    mockPresign.mockImplementation(async (key: string) => {
      if (key === 'k/b') throw new Error('presign boom')
      return `https://signed/${key}`
    })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: { 'k/a': 'https://signed/k/a' } })
  })

  it('returns empty sources when the project has no current timeline', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline: null })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: {} })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/clipSourcesApi.test.ts`
Expected: FAIL — cannot resolve the handler module.

- [ ] **Step 3: Write the endpoint**

Create `server/api/agency/audio/projects/[id]/clip-sources.get.ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'
import { collectClipKeys } from '~~/server/utils/audio/clipSources'
import { getPresignedDownloadUrl, isStorageConfigured } from '~~/server/utils/storage'

const PRESIGN_TTL = 60 * 60 // 1 hour, matches asset playback URLs

// Mint short-lived GET URLs for exactly the r2_keys in THIS project's current
// timeline (org-scoped via the gateway). Never presigns an arbitrary key → no
// IDOR/SSRF. A single bad key is omitted (the client treats a missing buffer as a
// hard load error — a partial mix would be wrong).
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const res = await getProjectWithCurrentTimeline(id)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const sources: Record<string, string> = {}
  if (!res.timeline) return { sources }

  for (const key of collectClipKeys(res.timeline)) {
    if (!isStorageConfigured()) { sources[key] = `/api/_uploads/${key}`; continue }
    try {
      sources[key] = await getPresignedDownloadUrl(key, PRESIGN_TTL)
    } catch {
      // omit a bad/missing key — never sink the whole response
    }
  }
  return { sources }
})
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/clipSourcesApi.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add "server/api/agency/audio/projects/[id]/clip-sources.get.ts" test/audio/clipSourcesApi.test.ts
git commit -m "feat(media-studio): SP2b clip-sources endpoint — presign timeline keys (org-scoped)"
```

---

## Task 5: Real-context factory + R2 resolver

**Files:**
- Create: `app/utils/audio/audioContextFactory.ts`
- Test: `test/audio/audioContextFactory.test.ts`

- [ ] **Step 0: Add the dependency**

Run: `pnpm add standardized-audio-context`
Expected: `standardized-audio-context` added to `package.json` dependencies. (This is the one new dep the SP2a spec §2 earmarked for SP2b.)

- [ ] **Step 1: Write the failing test (the testable unit is `makeR2Resolver`)**

Create `test/audio/audioContextFactory.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeR2Resolver } from '~~/app/utils/audio/audioContextFactory'

const stubBuffer = { duration: 10, length: 480000, numberOfChannels: 2, sampleRate: 48000 } as any
function clip(over: any = {}) {
  return { clipId: 'c1', trackId: 't1', r2_key: 'k/a', timelineStartSec: 0, sourceInSec: 0,
    durationSec: 10, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear', ...over }
}

beforeEach(() => vi.restoreAllMocks())

describe('makeR2Resolver', () => {
  it('fetches the presigned URL, reads the arrayBuffer, and decodes it', async () => {
    const ab = new ArrayBuffer(8)
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => ab }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = { decodeAudioData: vi.fn(async () => stubBuffer) }
    const resolve = makeR2Resolver({ 'k/a': 'https://signed/k/a' }, ctx as any)
    const buf = await resolve(clip())
    expect(buf).toBe(stubBuffer)
    expect(fetchMock).toHaveBeenCalledWith('https://signed/k/a')
    expect(ctx.decodeAudioData).toHaveBeenCalledWith(ab)
  })

  it('rejects when the clip key is missing from the sources map', async () => {
    const ctx = { decodeAudioData: vi.fn() }
    const resolve = makeR2Resolver({}, ctx as any)
    await expect(resolve(clip({ r2_key: 'k/missing' }))).rejects.toThrow(/k\/missing/)
    expect(ctx.decodeAudioData).not.toHaveBeenCalled()
  })

  it('rejects on a non-ok fetch response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })))
    const ctx = { decodeAudioData: vi.fn() }
    const resolve = makeR2Resolver({ 'k/a': 'https://signed/k/a' }, ctx as any)
    await expect(resolve(clip())).rejects.toThrow(/403/)
  })

  it('caches by r2_key — two clips sharing a key fetch+decode once', async () => {
    const ab = new ArrayBuffer(8)
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => ab }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = { decodeAudioData: vi.fn(async () => stubBuffer) }
    const resolve = makeR2Resolver({ 'k/a': 'https://signed/k/a' }, ctx as any)
    const [b1, b2] = await Promise.all([resolve(clip({ clipId: 'c1' })), resolve(clip({ clipId: 'c2' }))])
    expect(b1).toBe(stubBuffer); expect(b2).toBe(stubBuffer)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/audioContextFactory.test.ts`
Expected: FAIL — cannot resolve `~~/app/utils/audio/audioContextFactory`.

- [ ] **Step 3: Write the factory**

Create `app/utils/audio/audioContextFactory.ts`:

```ts
// app/utils/audio/audioContextFactory.ts — browser-only real collaborators for the
// SP2a engine. createBrowserAudioContext + browserSetTimer are thin prod wrappers
// (manual-verified); makeR2Resolver is the unit-tested core: it turns a clip's r2_key
// into a decoded AudioBuffer via a presigned URL (clip-sources endpoint). The engine
// API is unchanged — these are just the real values injected into createAudioEngine.
import { AudioContext } from 'standardized-audio-context'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

/** A suspended real AudioContext (resumed on the user's first Play — autoplay policy). */
export function createBrowserAudioContext(sampleRate?: number): AudioContext {
  return new AudioContext(sampleRate ? { sampleRate } : undefined)
}

/** setTimeout wrapper → cancel fn. The engine's lookahead-loop timer in production. */
export function browserSetTimer(cb: () => void, ms: number): () => void {
  const id = setTimeout(cb, ms)
  return () => clearTimeout(id)
}

/** Build a resolveBuffer over a { r2_key → presigned URL } map: fetch → arrayBuffer →
 * decodeAudioData. Caches by r2_key (clips sharing a source fetch+decode once).
 * Rejects if a clip's key is absent (the editor surfaces it as a hard load error). */
export function makeR2Resolver(
  clipSources: Record<string, string>,
  ctx: Pick<AudioContext, 'decodeAudioData'>
): (clip: ScheduledClip) => Promise<AudioBuffer> {
  const cache = new Map<string, Promise<AudioBuffer>>()
  return (clip: ScheduledClip) => {
    const url = clipSources[clip.r2_key]
    if (!url) return Promise.reject(new Error(`No source URL for clip ${clip.clipId} (key ${clip.r2_key})`))
    let p = cache.get(clip.r2_key)
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Fetch failed (${r.status}) for ${clip.r2_key}`)
          return r.arrayBuffer()
        })
        .then((ab) => ctx.decodeAudioData(ab) as Promise<AudioBuffer>)
      cache.set(clip.r2_key, p)
    }
    return p
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/audioContextFactory.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/audioContextFactory.ts test/audio/audioContextFactory.test.ts package.json pnpm-lock.yaml
git commit -m "feat(media-studio): SP2b real-context factory + R2 resolveBuffer (standardized-audio-context)"
```

---

## Task 6: Pure timeline geometry

**Files:**
- Create: `app/utils/audio/timelineGeometry.ts`
- Test: `test/audio/timelineGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/audio/timelineGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clipRect, playheadX, trackLaneCount } from '~~/app/utils/audio/timelineGeometry'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'

describe('clipRect', () => {
  it('maps timeline start/duration to x/width at the given pxPerSec', () => {
    expect(clipRect({ timelineStartSec: 2, durationSec: 5 }, 10, 0)).toEqual({ x: 20, width: 50 })
  })
  it('uses the fallback duration when durationSec is null', () => {
    expect(clipRect({ timelineStartSec: 0, durationSec: null }, 10, 8)).toEqual({ x: 0, width: 80 })
  })
  it('never returns a negative width', () => {
    expect(clipRect({ timelineStartSec: 0, durationSec: -3 }, 10, 0)).toEqual({ x: 0, width: 0 })
  })
})

describe('playheadX', () => {
  it('scales the current time by pxPerSec, clamped at 0', () => {
    expect(playheadX(3, 10)).toBe(30)
    expect(playheadX(-1, 10)).toBe(0)
  })
})

describe('trackLaneCount', () => {
  it('counts all tracks (muted included — they still get a lane)', () => {
    const s = TimelineStateSchema.parse({ tracks: [
      { id: 'a', name: 'A', kind: 'voiceover', clips: [] },
      { id: 'b', name: 'B', kind: 'music', muted: true, clips: [] }
    ] })
    expect(trackLaneCount(s)).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineGeometry.test.ts`
Expected: FAIL — cannot resolve `~~/app/utils/audio/timelineGeometry`.

- [ ] **Step 3: Write the helper**

Create `app/utils/audio/timelineGeometry.ts`:

```ts
// app/utils/audio/timelineGeometry.ts — PURE pixel geometry for the read-only lane
// view. Time → x/width at a fixed pxPerSec zoom. No DOM, no Vue — unit-testable.
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

/** A scheduled clip's lane rectangle. durationSec null → use fallbackDurSec
 * (the engine's resolved duration for play-to-end clips). */
export function clipRect(
  clip: { timelineStartSec: number; durationSec: number | null },
  pxPerSec: number,
  fallbackDurSec: number
): { x: number; width: number } {
  const dur = clip.durationSec ?? fallbackDurSec
  return { x: clip.timelineStartSec * pxPerSec, width: Math.max(0, dur) * pxPerSec }
}

/** Playhead x for the current master-clock position (clamped at 0). */
export function playheadX(currentTimeSec: number, pxPerSec: number): number {
  return Math.max(0, currentTimeSec) * pxPerSec
}

/** Number of lanes to render (one per track, muted included). */
export function trackLaneCount(timeline: TimelineState): number {
  return timeline.tracks.length
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/timelineGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/audio/timelineGeometry.ts test/audio/timelineGeometry.test.ts
git commit -m "feat(media-studio): SP2b pure timeline geometry (clipRect/playheadX/trackLaneCount)"
```

---

## Task 7: Editor composable

Wires SP0 fetch → real engine and exposes transport + an rAF clock. No unit test (it orchestrates a real `AudioContext` + `useFetch`; the testable pieces — `makeR2Resolver`, geometry, planner, engine — are covered, and the wiring is the manual-eyeball deliverable). Keep it thin.

**Files:**
- Create: `app/composables/useMediaProjectEditor.ts`

- [ ] **Step 1: Write the composable**

Create `app/composables/useMediaProjectEditor.ts`:

```ts
// app/composables/useMediaProjectEditor.ts — wires an SP0 project + its presigned
// clip URLs into a REAL SP2a audio engine and exposes read-only transport. The
// master clock is engine.currentTime(); an rAF loop mirrors it into currentTime for
// the playhead (clock rule: the view slaves to the engine, never the reverse).
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { planTimeline, type ScheduledClip, type TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { createAudioEngine, type AudioEngine } from '~~/app/composables/useAudioEngine'
import { createBrowserAudioContext, browserSetTimer, makeR2Resolver } from '~~/app/utils/audio/audioContextFactory'

export type EditorStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useMediaProjectEditor(projectId: string) {
  const timeline = ref<TimelineState | null>(null)
  const clips = ref<ScheduledClip[]>([])
  const tracks = ref<TrackBus[]>([])
  const status = ref<EditorStatus>('idle')
  const error = ref<string | null>(null)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)

  let engine: AudioEngine | null = null
  let raf = 0

  async function init() {
    status.value = 'loading'
    error.value = null
    try {
      const [proj, src] = await Promise.all([
        $fetch<{ project: unknown; timeline: TimelineState | null }>(`/api/agency/audio/projects/${projectId}`),
        $fetch<{ sources: Record<string, string> }>(`/api/agency/audio/projects/${projectId}/clip-sources`)
      ])
      if (!proj.timeline) { status.value = 'error'; error.value = 'This project has no timeline yet.'; return }
      timeline.value = proj.timeline
      const plan = planTimeline(proj.timeline)
      clips.value = plan.clips
      tracks.value = plan.tracks
      const ctx = createBrowserAudioContext(proj.timeline.sample_rate)
      engine = createAudioEngine({
        ctx: ctx as any,
        resolveBuffer: makeR2Resolver(src.sources, ctx),
        setTimer: browserSetTimer,
        now: () => ctx.currentTime
      })
      await engine.load(proj.timeline)
      duration.value = engine.duration()
      status.value = 'ready'
    } catch (e: any) {
      status.value = 'error'
      error.value = e?.message ?? 'Failed to load the project audio.'
    }
  }

  function tickClock() {
    if (!engine) return
    currentTime.value = engine.currentTime()
    if (engine.isPlaying()) {
      raf = requestAnimationFrame(tickClock)
    } else {
      isPlaying.value = false
      cancelAnimationFrame(raf)
    }
  }

  function play() {
    if (!engine || status.value !== 'ready') return
    engine.play()                 // resumes a suspended ctx (autoplay policy)
    isPlaying.value = true
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(tickClock)
  }

  function pause() {
    if (!engine) return
    engine.pause()
    isPlaying.value = false
    cancelAnimationFrame(raf)
    currentTime.value = engine.currentTime()
  }

  function seek(sec: number) {
    if (!engine) return
    engine.seek(sec)
    currentTime.value = engine.currentTime()
  }

  onMounted(() => { void init() })
  onBeforeUnmount(() => { cancelAnimationFrame(raf); engine?.dispose(); engine = null })

  return { timeline, clips, tracks, status, error, isPlaying, currentTime, duration, play, pause, seek }
}
```

- [ ] **Step 2: Typecheck the new composable**

Run: `pnpm exec vitest run test/audio/` (sanity — no regressions in the audio suite from the new imports)
Expected: PASS — existing audio tests still green (the composable has no test of its own; this just confirms nothing it imports broke).

- [ ] **Step 3: Commit**

```bash
git add app/composables/useMediaProjectEditor.ts
git commit -m "feat(media-studio): SP2b editor composable — wire SP0 project into the real engine"
```

---

## Task 8: Read-only lane-view timeline component

**Files:**
- Create: `app/components/media/MediaTimeline.client.vue`

- [ ] **Step 1: Write the component**

Create `app/components/media/MediaTimeline.client.vue`:

```vue
<script setup lang="ts">
// Read-only multitrack lane view: one row per track, clips as time-positioned blocks,
// a single playhead line driven by the parent's currentTime (slaved to engine.currentTime()).
// Display-only in SP2b — no drag/trim/seek-on-click (that's SP2c). Pure geometry from
// timelineGeometry.ts; semantic Nuxt UI colors (dark-mode safe).
import { computed } from 'vue'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { ScheduledClip, TrackBus } from '~~/app/utils/audio/audioSchedulePlanner'
import { clipRect, playheadX } from '~~/app/utils/audio/timelineGeometry'

const props = withDefaults(defineProps<{
  timeline: TimelineState
  clips: ScheduledClip[]
  tracks: TrackBus[]
  currentTime: number
  duration: number
  pxPerSec?: number
}>(), { pxPerSec: 60 })

const LANE_HEIGHT = 56
const LABEL_WIDTH = 120

// One lane per timeline track, in order; carry name + muted from the raw timeline.
const lanes = computed(() => props.timeline.tracks.map((t) => ({
  id: t.id,
  name: t.name,
  muted: t.muted,
  clips: props.clips.filter((c) => c.trackId === t.id)
})))

const trackWidthPx = computed(() => Math.max(props.duration, 1) * props.pxPerSec)
const playheadLeft = computed(() => LABEL_WIDTH + playheadX(props.currentTime, props.pxPerSec))

function rect(clip: ScheduledClip) {
  // null-duration clips: fall back to (total duration − start) so the block has a width
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  return clipRect(clip, props.pxPerSec, fallback)
}
function fmtDur(clip: ScheduledClip) {
  const fallback = Math.max(0, props.duration - clip.timelineStartSec)
  const d = clip.durationSec ?? fallback
  return `${d.toFixed(1)}s`
}
</script>

<template>
  <div class="relative overflow-x-auto rounded-lg border border-default bg-elevated">
    <div class="relative" :style="{ width: `${LABEL_WIDTH + trackWidthPx}px`, minWidth: '100%' }">
      <!-- lanes -->
      <div
        v-for="lane in lanes"
        :key="lane.id"
        class="relative border-b border-default last:border-b-0"
        :style="{ height: `${LANE_HEIGHT}px` }"
      >
        <!-- sticky track label -->
        <div
          class="absolute left-0 top-0 z-10 flex h-full items-center gap-2 border-r border-default bg-elevated px-3"
          :style="{ width: `${LABEL_WIDTH}px` }"
        >
          <UIcon v-if="lane.muted" name="i-lucide-volume-x" class="size-4 text-muted" />
          <span class="truncate text-sm font-medium" :class="lane.muted ? 'text-muted' : 'text-highlighted'">{{ lane.name }}</span>
        </div>
        <!-- clips -->
        <div
          v-for="clip in lane.clips"
          :key="clip.clipId"
          class="absolute top-2 flex items-center rounded-md px-2 text-xs font-medium text-inverted"
          :class="lane.muted ? 'bg-muted' : 'bg-primary'"
          :style="{
            left: `${LABEL_WIDTH + rect(clip).x}px`,
            width: `${rect(clip).width}px`,
            height: `${LANE_HEIGHT - 16}px`
          }"
        >
          <span class="truncate">{{ clip.clipId }} · {{ fmtDur(clip) }}</span>
        </div>
      </div>

      <!-- playhead -->
      <div
        class="pointer-events-none absolute top-0 z-20 w-px bg-primary"
        :style="{ left: `${playheadLeft}px`, height: '100%' }"
      >
        <div class="absolute -left-1 -top-1 size-2 rounded-full bg-primary" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Manual sanity (no automated test for a Vue display component)**

This component is display-only and verified in the page eyeball (Task 10). Confirm it compiles by importing it in the page (Task 9). No commit yet — commit with the page in Task 9, OR commit standalone:

```bash
git add app/components/media/MediaTimeline.client.vue
git commit -m "feat(media-studio): SP2b read-only lane-view timeline component"
```

---

## Task 9: Editor page

**Files:**
- Create: `app/pages/agency/audio/projects/[id].vue`

- [ ] **Step 1: Confirm the route is covered by agency auth middleware**

Run: `grep -rnE "agency|requireAuth|definePageMeta|middleware" app/pages/agency/audio/index.vue | head`
Expected: see how `/agency/audio/index.vue` applies auth (e.g. `definePageMeta({ middleware: … })` or a global `/agency/**` middleware). **Mirror exactly what that page does** in the new page's `definePageMeta`. If `/agency/audio/index.vue` relies solely on a global route-rule/middleware that matches `/agency/**`, the dynamic `[id].vue` is covered too — note it; otherwise add the same `definePageMeta({ middleware: 'auth' })` (or whatever name that page uses). Known repo gotcha: middleware sweeps sometimes miss dynamic/`.client` routes — be explicit.

- [ ] **Step 2: Write the page**

Create `app/pages/agency/audio/projects/[id].vue` (match the `definePageMeta` middleware to what Step 1 found — shown here as `middleware: 'auth'`; adjust if the codebase uses a different name):

```vue
<script setup lang="ts">
// SP2b read-only timeline editor/preview. Loads an SP0 project + presigned clip URLs,
// drives the real SP2a engine for transport, renders MediaTimeline with a playhead
// slaved to engine.currentTime(). No editing/autosave/waveforms/collab (SP2c/SP2d).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMediaProjectEditor } from '~~/app/composables/useMediaProjectEditor'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const projectId = computed(() => String(route.params.id))
const editor = useMediaProjectEditor(projectId.value)

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
function onScrub(value: number) {
  editor.seek(value)
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <div class="flex items-center justify-between gap-4 p-4">
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-arrow-left" variant="ghost" color="neutral" to="/agency/audio" />
          <h1 class="text-lg font-semibold text-highlighted">
            {{ editor.timeline.value?.tracks?.length ? 'Timeline preview' : 'Timeline' }}
          </h1>
        </div>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 p-4">
        <USkeleton v-if="editor.status.value === 'loading'" class="h-48 w-full" />

        <UAlert
          v-else-if="editor.status.value === 'error'"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn't load this project"
          :description="editor.error.value ?? 'Unknown error'"
        />

        <template v-else-if="editor.status.value === 'ready' && editor.timeline.value">
          <MediaTimeline
            :timeline="editor.timeline.value"
            :clips="editor.clips.value"
            :tracks="editor.tracks.value"
            :current-time="editor.currentTime.value"
            :duration="editor.duration.value"
          />

          <!-- transport bar -->
          <div class="flex items-center gap-4 rounded-lg border border-default bg-elevated p-3">
            <UButton
              :icon="editor.isPlaying.value ? 'i-lucide-pause' : 'i-lucide-play'"
              color="primary"
              :aria-label="editor.isPlaying.value ? 'Pause' : 'Play'"
              @click="editor.isPlaying.value ? editor.pause() : editor.play()"
            />
            <span class="w-20 shrink-0 tabular-nums text-sm text-muted">
              {{ fmt(editor.currentTime.value) }} / {{ fmt(editor.duration.value) }}
            </span>
            <USlider
              class="flex-1"
              :min="0"
              :max="Math.max(editor.duration.value, 0.001)"
              :step="0.01"
              :model-value="editor.currentTime.value"
              @update:model-value="onScrub"
            />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
```

- [ ] **Step 3: Verify dev build resolves the page + component + composable**

Run: `pnpm exec nuxt prepare`
Expected: completes without error (resolves the new page/component/composable imports). If `UDashboardPanel`/`USlider`/`USkeleton` names differ in this Nuxt UI v4 setup, `grep -rl "UDashboardPanel\|USlider\|USkeleton" app/pages app/components` to confirm the actual component names used elsewhere and adjust. (These are standard Nuxt UI v4 components; the existing `/agency/audio/index.vue` shows the page-shell convention to match.)

- [ ] **Step 4: Commit**

```bash
git add "app/pages/agency/audio/projects/[id].vue"
git commit -m "feat(media-studio): SP2b editor page — read-only timeline + transport"
```

---

## Task 10: Full-suite verification + manual eyeball

- [ ] **Step 1: Run all audio tests**

Run: `pnpm exec vitest run test/audio/`
Expected: PASS — the SP2a suite (updated ramp tests) plus the 4 new SP2b test files (`clipSources`, `clipSourcesApi`, `audioContextFactory`, `timelineGeometry`). No regressions.

- [ ] **Step 2: Typecheck the SP2b files**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tee /tmp/sp2b-tc.log | tail -3; grep -E 'audioContextFactory|timelineGeometry|clipSources|useMediaProjectEditor|MediaTimeline|projects/\[id\]\.vue' /tmp/sp2b-tc.log || echo "no SP2b type errors"`
Expected: `no SP2b type errors`. (The repo has ~1250 pre-existing project-wide errors and runs `typescript.strict:false`; only SP2b-file errors matter. A silent OOM yields a false pass — confirm real output, not just exit code.)

- [ ] **Step 3: Manual eyeball — the SP2b deliverable (SP2a §8 carried item)**

Pre-req: an SP0 project that has a timeline with real clips whose `r2_key`s point at real R2 audio (e.g. a voiceover + a music bed with a ducking rule). Storage env must be configured locally (or run against a deployed origin).

Run: `pnpm dev`, then open `/agency/audio/projects/<id>` and verify:
1. The lane view shows one row per track with clips positioned by time.
2. Click **Play** → audio is **audible** (autoplay policy: the click resumes the ctx).
3. The mix is correct: VO over music, the **music ducks** under the VO and **restores** after (now anchored + composed with the music bus's nominal gain), clip **fades** sound right.
4. The **playhead tracks** `currentTime` smoothly and stays in sync (no drift over 30s+).
5. **Scrub** the slider → playback jumps to the new position; **pause** freezes the playhead and stops audio.
6. (Optional) Compare against SP1's ffmpeg master for the same project — the preview should be perceptually close (it's non-authoritative).

Record the result (and any drift/click/ducking-calibration notes) in the PR description.

- [ ] **Step 4: Final commit (if any adjustment was needed)**

```bash
git add -A
git commit -m "test(media-studio): SP2b full-suite verification + eyeball notes" || echo "nothing to commit"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- §3.1 real-context layer (`createBrowserAudioContext`/`browserSetTimer`/`makeR2Resolver`) → Task 5 ✅
- §3.2 clip-sources endpoint + `collectClipKeys` (presign only timeline keys, org-scoped) → Tasks 3 + 4 ✅
- §3.3 editor composable (SP0 fetch → real engine, transport, rAF clock) → Task 7 ✅
- §3.4 read-only lane view + pure geometry → Tasks 6 + 8 ✅
- §3.5 editor page (timeline + transport bar, auth) → Task 9 ✅
- §3.6 ramp-anchor + nominal-gain fix (engine + preview, `DuckRamp` doc) → Tasks 1 + 2 ✅
- §4 data flow (load → play lookahead → rAF playhead → seek/pause) → Tasks 7 + 8 + 9 ✅
- §5 testing (pure collectClipKeys/geometry/resolver, endpoint, updated ramp tests, manual eyeball) → all tasks + Task 10 ✅
- §6 tenancy (requireAuth + org-scope + only-timeline-keys presign) → Task 4 ✅

**Placeholder scan:** none — every code step has complete, runnable content. Task 9 Step 1/Step 3 carry *verification* instructions (confirm the actual middleware name + Nuxt UI component names in this codebase before finalizing) rather than placeholders, because those are environment facts the executor must read from the repo, not invent — the default values shown (`middleware: 'auth'`, `UDashboardPanel`/`USlider`/`USkeleton`) are standard and adjusted only if the repo differs.

**Type consistency:** `ScheduledClip`/`TrackBus`/`TimelinePlan` (from `audioSchedulePlanner`), `AudioEngine`/`createAudioEngine` (from `useAudioEngine`), `collectClipKeys`/`makeR2Resolver`/`clipRect`/`playheadX`/`trackLaneCount`/`createBrowserAudioContext`/`browserSetTimer`/`useMediaProjectEditor` are named consistently across tasks, tests, the composable, and the page/component. `DuckRamp.toGainDb` is reinterpreted as a delta (documented in Task 1 Step 6) and consumed that way by both the engine (Task 1) and preview (Task 2). The clip-sources response shape `{ sources: Record<string,string> }` is produced (Task 4) and consumed (Task 7) identically.

**Refinement vs spec (flagged):** none — the plan implements the spec as written. The composable has no unit test by design (it orchestrates a real `AudioContext` + `useFetch`); all its testable collaborators are unit-tested and the wiring is the manual-eyeball deliverable, consistent with spec §5.

**Out of scope (correctly absent):** add/move/trim, asset library/picker, autosave (SP0 PUT), waveforms (wavesurfer.js), collab (banner-rooms), GSAP playhead, "Render master" button, web-worker timer — all deferred to SP2c/SP2d/SP3 per spec §1.
```
