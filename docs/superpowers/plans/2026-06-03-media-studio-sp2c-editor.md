# Media Studio SP2c — Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the SP2b read-only timeline player into a full single-editor multitrack editor — create projects, add clips from the audio library, move/trim/slice/snap them, with in-memory undo/redo + debounced autosave + named version snapshots, zoom, and per-clip waveforms.

**Architecture:** All edit logic is **pure** (`app/utils/audio/timelineEdit.ts`, `(TimelineState,args)→TimelineState`, re-validated against the SP0 schema) and TDD'd in isolation. The editor composable (`useMediaProjectEditor.ts`) holds the working `TimelineState`, an undo/redo stack, debounced autosave (`PUT timeline.put`), and version actions (`versions` endpoints); after each committed edit it re-`plan`s + `load`s the SP2a engine so playback reflects the edit. The component (`MediaTimeline.client.vue`) adds an interaction layer (drag/trim/slice/select/zoom + wavesurfer waveforms) over SP2b's read-only render path. No new backend.

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>`, Nuxt UI v4, Vitest + happy-dom, `wavesurfer.js` (new dep), the SP0 Zod timeline contract (`server/utils/audio/timelineSchema.ts`), the SP2a engine + planner.

**Conventions:** App imports use `~~/app/...` and `~~/server/...` (double-tilde, as SP2b does). Types from `~~/server/utils/audio/timelineSchema`. Tests live under `test/` mirroring source. Commit after every passing step. New clip/track IDs are **passed in** to the pure functions (caller generates via `crypto.randomUUID()`) so the functions stay deterministic/testable.

---

## Reference: the SP0 timeline types (do not redefine — import)

From `~~/server/utils/audio/timelineSchema` (already importable in `app/`):

```ts
type Clip = { id: string; asset_id: string | null; r2_key: string;
  timeline_start_sec: number; source_in_sec: number; source_out_sec: number | null;
  gain_db: number; fade_in_sec: number; fade_out_sec: number; fade_curve: 'linear'|'exp'|'log' }
type Track = { id: string; name: string; kind: 'voiceover'|'music'|'sfx';
  gain_db: number; muted: boolean; locked: boolean; hidden: boolean; clips: Clip[] }
type TimelineState = { schema_version: 1; media_type: 'audio'; sample_rate: number;
  duration_sec: number; tracks: Track[]; ducking: DuckingRule[] }
// pure helpers also exported: validateTimeline(state), computeDuration(state, sourceDurations?)
```

---

## Phase 1 — Editing core (pure, TDD)

### Task 1: Scaffold `timelineEdit.ts` + the recompute helper

**Files:**
- Create: `app/utils/audio/timelineEdit.ts`
- Test: `test/audio/timelineEdit.test.ts`

- [ ] **Step 1: Write the failing test** (`test/audio/timelineEdit.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { cloneState, type EditableState } from '~~/app/utils/audio/timelineEdit'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const base: TimelineState = {
  schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
  tracks: [
    { id: 'trk-vo', name: 'VO', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false,
      clips: [{ id: 'c1', asset_id: 'a1', r2_key: 'k1', timeline_start_sec: 0, source_in_sec: 0,
        source_out_sec: 5, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }] }
  ],
  ducking: []
}

describe('cloneState', () => {
  it('deep-clones (no shared refs) and recomputes duration_sec', () => {
    const out = cloneState(base)
    out.tracks[0].clips[0].timeline_start_sec = 99
    expect(base.tracks[0].clips[0].timeline_start_sec).toBe(0) // original untouched
    expect(cloneState(base).duration_sec).toBe(5)              // recomputed from clips
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm exec vitest run test/audio/timelineEdit.test.ts`
Expected: FAIL — `cloneState` not exported.

- [ ] **Step 3: Write minimal implementation** (`app/utils/audio/timelineEdit.ts`)

```ts
// app/utils/audio/timelineEdit.ts — PURE timeline edit operations. Each returns a NEW
// TimelineState (no mutation of the input), recomputes duration_sec, and stays SP0-valid.
// New clip ids are passed in by the caller (deterministic → testable). No DOM, no Vue.
import type { TimelineState, Track, Clip } from '~~/server/utils/audio/timelineSchema'
import { computeDuration } from '~~/server/utils/audio/timelineSchema'

export type EditableState = TimelineState

/** Deep clone + recompute duration_sec. sourceDurations lets play-to-end clips
 * (source_out_sec === null) contribute their decoded length. */
export function cloneState(state: TimelineState, sourceDurations: Record<string, number> = {}): TimelineState {
  const copy: TimelineState = structuredClone(state)
  copy.duration_sec = computeDuration(copy, sourceDurations)
  return copy
}

function findClip(state: TimelineState, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of state.tracks) {
    const clip = track.clips.find(c => c.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}
```

> Note: `computeDuration` keys play-to-end clips by **clip id** in `sourceDurations` (see SP0 `computeDuration` JSDoc). Callers pass `{ [clipId]: decodedSeconds }`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm exec vitest run test/audio/timelineEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add app/utils/audio/timelineEdit.ts test/audio/timelineEdit.test.ts
git commit -m "feat(media-studio): SP2c timelineEdit scaffold + cloneState"
```

### Task 2: `deleteClip`

**Files:** Modify `app/utils/audio/timelineEdit.ts`; Test `test/audio/timelineEdit.test.ts`

- [ ] **Step 1: Write the failing test** (append)
```ts
import { deleteClip } from '~~/app/utils/audio/timelineEdit'
describe('deleteClip', () => {
  it('removes the clip and recomputes duration', () => {
    const out = deleteClip(base, { clipId: 'c1' })
    expect(out.tracks[0].clips).toHaveLength(0)
    expect(out.duration_sec).toBe(0)
    expect(base.tracks[0].clips).toHaveLength(1) // input untouched
  })
  it('is a no-op for an unknown clip id', () => {
    expect(deleteClip(base, { clipId: 'nope' }).tracks[0].clips).toHaveLength(1)
  })
})
```
- [ ] **Step 2: Run → FAIL** (`deleteClip` undefined). Run: `pnpm exec vitest run test/audio/timelineEdit.test.ts`
- [ ] **Step 3: Implement** (append to `timelineEdit.ts`)
```ts
export function deleteClip(state: TimelineState, { clipId }: { clipId: string }): TimelineState {
  const next = cloneState(state)
  for (const track of next.tracks) track.clips = track.clips.filter(c => c.id !== clipId)
  next.duration_sec = computeDuration(next)
  return next
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(media-studio): SP2c deleteClip`

### Task 3: `moveClip` (incl. cross-track)

- [ ] **Step 1: Failing test** (append)
```ts
import { moveClip } from '~~/app/utils/audio/timelineEdit'
describe('moveClip', () => {
  const two = cloneStateForTest()
  function cloneStateForTest(): TimelineState {
    const s = structuredClone(base)
    s.tracks.push({ id: 'trk-mus', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] })
    return s
  }
  it('moves within a track and clamps start at 0', () => {
    const out = moveClip(two, { clipId: 'c1', toTrackId: 'trk-vo', newStartSec: -3 })
    expect(out.tracks[0].clips[0].timeline_start_sec).toBe(0)
  })
  it('moves a clip to a different track', () => {
    const out = moveClip(two, { clipId: 'c1', toTrackId: 'trk-mus', newStartSec: 2 })
    expect(out.tracks[0].clips).toHaveLength(0)
    expect(out.tracks[1].clips[0].id).toBe('c1')
    expect(out.tracks[1].clips[0].timeline_start_sec).toBe(2)
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
export function moveClip(
  state: TimelineState,
  { clipId, toTrackId, newStartSec }: { clipId: string; toTrackId: string; newStartSec: number }
): TimelineState {
  const next = cloneState(state)
  let moved: Clip | undefined
  for (const track of next.tracks) {
    const i = track.clips.findIndex(c => c.id === clipId)
    if (i >= 0) { moved = track.clips.splice(i, 1)[0]; break }
  }
  if (!moved) return state
  moved.timeline_start_sec = Math.max(0, newStartSec)
  const dest = next.tracks.find(t => t.id === toTrackId)
  if (!dest) return state // unknown track → no-op
  dest.clips.push(moved)
  next.duration_sec = computeDuration(next)
  return next
}
```
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c moveClip (cross-track)`

### Task 4: `addClip`

- [ ] **Step 1: Failing test** (append)
```ts
import { addClip } from '~~/app/utils/audio/timelineEdit'
describe('addClip', () => {
  it('appends a clip with the asset key and given id at the start time', () => {
    const out = addClip(base, { trackId: 'trk-vo', id: 'c2',
      asset: { id: 'a2', r2_key_master: 'k2' }, startSec: 4 })
    const added = out.tracks[0].clips.find(c => c.id === 'c2')!
    expect(added.r2_key).toBe('k2')
    expect(added.asset_id).toBe('a2')
    expect(added.timeline_start_sec).toBe(4)
    expect(added.source_out_sec).toBeNull() // play to end
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
export function addClip(
  state: TimelineState,
  { trackId, id, asset, startSec }:
    { trackId: string; id: string; asset: { id: string; r2_key_master: string }; startSec: number }
): TimelineState {
  const next = cloneState(state)
  const track = next.tracks.find(t => t.id === trackId)
  if (!track) return state
  track.clips.push({
    id, asset_id: asset.id, r2_key: asset.r2_key_master,
    timeline_start_sec: Math.max(0, startSec), source_in_sec: 0, source_out_sec: null,
    gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear'
  })
  next.duration_sec = computeDuration(next)
  return next
}
```
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c addClip`

### Task 5: `trimClip` (clamped to source bounds)

- [ ] **Step 1: Failing test** (append) — base clip `c1` is source_in 0, source_out 5.
```ts
import { trimClip } from '~~/app/utils/audio/timelineEdit'
describe('trimClip', () => {
  it('trims the END, clamped to the source duration', () => {
    const out = trimClip(base, { clipId: 'c1', edge: 'end', newTimeSec: 3, sourceDurationSec: 5 })
    expect(out.tracks[0].clips[0].source_out_sec).toBe(3)
    // never past source length:
    const out2 = trimClip(base, { clipId: 'c1', edge: 'end', newTimeSec: 99, sourceDurationSec: 5 })
    expect(out2.tracks[0].clips[0].source_out_sec).toBe(5)
  })
  it('trims the START, advancing source_in and timeline_start together', () => {
    const out = trimClip(base, { clipId: 'c1', edge: 'start', newTimeSec: 2, sourceDurationSec: 5 })
    expect(out.tracks[0].clips[0].source_in_sec).toBe(2)
    expect(out.tracks[0].clips[0].timeline_start_sec).toBe(2)
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `newTimeSec` is a **timeline** time; convert to source offset via the clip's current `timeline_start_sec`/`source_in_sec`.
```ts
export function trimClip(
  state: TimelineState,
  { clipId, edge, newTimeSec, sourceDurationSec }:
    { clipId: string; edge: 'start' | 'end'; newTimeSec: number; sourceDurationSec: number }
): TimelineState {
  const next = cloneState(state)
  const found = next.tracks.flatMap(t => t.clips).find(c => c.id === clipId)
  if (!found) return state
  const srcOut = found.source_out_sec ?? sourceDurationSec
  if (edge === 'end') {
    // timeline delta from the clip start maps 1:1 to source seconds
    const newSrcOut = found.source_in_sec + Math.max(0, newTimeSec - found.timeline_start_sec)
    found.source_out_sec = Math.min(sourceDurationSec, Math.max(found.source_in_sec + 0.01, newSrcOut))
  } else {
    const advance = Math.max(0, newTimeSec - found.timeline_start_sec)
    const newSrcIn = Math.min(srcOut - 0.01, found.source_in_sec + advance)
    found.source_in_sec = Math.max(0, newSrcIn)
    found.timeline_start_sec = found.timeline_start_sec + advance
  }
  next.duration_sec = computeDuration(next)
  return next
}
```
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c trimClip (clamped)`

### Task 6: `sliceClipAt`

- [ ] **Step 1: Failing test** (append) — slice `c1` (timeline 0–5) at t=2 → two clips 0–2 and 2–5.
```ts
import { sliceClipAt } from '~~/app/utils/audio/timelineEdit'
describe('sliceClipAt', () => {
  it('splits one clip into two at the playhead, ids supplied', () => {
    const out = sliceClipAt(base, { clipId: 'c1', timeSec: 2, leftId: 'L', rightId: 'R' })
    const clips = out.tracks[0].clips
    expect(clips.map(c => c.id)).toEqual(['L', 'R'])
    expect(clips[0].timeline_start_sec).toBe(0)
    expect(clips[0].source_out_sec).toBe(2)
    expect(clips[1].timeline_start_sec).toBe(2)
    expect(clips[1].source_in_sec).toBe(2)
  })
  it('is a no-op when the time is outside the clip', () => {
    expect(sliceClipAt(base, { clipId: 'c1', timeSec: 9, leftId: 'L', rightId: 'R' })
      .tracks[0].clips).toHaveLength(1)
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — split point in source seconds = `source_in + (timeSec - timeline_start)`. Left keeps fade_in; right keeps fade_out; cut edges get 0 fade.
```ts
export function sliceClipAt(
  state: TimelineState,
  { clipId, timeSec, leftId, rightId }:
    { clipId: string; timeSec: number; leftId: string; rightId: string }
): TimelineState {
  const next = cloneState(state)
  for (const track of next.tracks) {
    const i = track.clips.findIndex(c => c.id === clipId)
    if (i < 0) continue
    const clip = track.clips[i]
    const endTl = clip.timeline_start_sec + ((clip.source_out_sec ?? Infinity) - clip.source_in_sec)
    if (timeSec <= clip.timeline_start_sec || timeSec >= endTl) return state // outside → no-op
    const cutSrc = clip.source_in_sec + (timeSec - clip.timeline_start_sec)
    const left: Clip = { ...clip, id: leftId, source_out_sec: cutSrc, fade_out_sec: 0 }
    const right: Clip = { ...clip, id: rightId, timeline_start_sec: timeSec, source_in_sec: cutSrc, fade_in_sec: 0 }
    track.clips.splice(i, 1, left, right)
    next.duration_sec = computeDuration(next)
    return next
  }
  return state
}
```
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c sliceClipAt`

### Task 7: `snapTime`

- [ ] **Step 1: Failing test** (append)
```ts
import { snapTime } from '~~/app/utils/audio/timelineEdit'
describe('snapTime', () => {
  it('snaps to the nearest target within the pixel threshold', () => {
    // 100 px/sec, 8px threshold → 0.08s window
    expect(snapTime(2.05, [2, 5], 100, 8)).toBe(2)      // within window
    expect(snapTime(2.5, [2, 5], 100, 8)).toBe(2.5)     // outside → unchanged
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
export function snapTime(t: number, targets: number[], pxPerSec: number, thresholdPx = 8): number {
  const windowSec = thresholdPx / pxPerSec
  let best = t, bestDist = windowSec
  for (const target of targets) {
    const d = Math.abs(t - target)
    if (d <= bestDist) { best = target; bestDist = d }
  }
  return best
}
```
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c snapTime`

---

## Phase 2 — Undo/redo stack (pure-ish, TDD)

### Task 8: `useTimelineUndo`

**Files:** Create `app/composables/useTimelineUndo.ts`; Test `test/composables/useTimelineUndo.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { createUndoStack } from '~~/app/composables/useTimelineUndo'
describe('createUndoStack', () => {
  it('pushes, undoes, and redoes states; bounded', () => {
    const s = createUndoStack<number>({ limit: 3 })
    s.push(1); s.push(2); s.push(3)
    expect(s.canUndo()).toBe(true)
    expect(s.undo(99)).toBe(3)     // returns prior state, current(99) goes onto redo
    expect(s.redo(3)).toBe(99)
  })
  it('evicts oldest beyond the limit', () => {
    const s = createUndoStack<number>({ limit: 2 })
    s.push(1); s.push(2); s.push(3) // 1 evicted
    s.undo(0); expect(s.undo(0)).toBe(2)   // can only go back to 2 (1 gone)
    expect(s.canUndo()).toBe(false)
  })
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — a plain factory (not a Vue composable singleton; instantiated per editor).
```ts
// app/composables/useTimelineUndo.ts — bounded undo/redo over snapshot states.
export function createUndoStack<T>({ limit = 100 }: { limit?: number } = {}) {
  const past: T[] = []
  const future: T[] = []
  return {
    push(prev: T) { past.push(prev); if (past.length > limit) past.shift(); future.length = 0 },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo(current: T): T | undefined { if (!past.length) return undefined; future.push(current); return past.pop() },
    redo(current: T): T | undefined { if (!future.length) return undefined; past.push(current); return future.pop() },
    clear() { past.length = 0; future.length = 0 }
  }
}
```
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c undo/redo stack`

---

## Phase 3 — Engine source-duration accessor (for trim clamp)

### Task 9: expose `clipSourceDuration` on the engine

**Files:** Modify `app/composables/useAudioEngine.ts`; Test `test/audio/useAudioEngine.sourceDuration.test.ts`

- [ ] **Step 1: Failing test** — with a mock ctx + stub buffers (mirror SP2a engine tests).
```ts
import { describe, it, expect } from 'vitest'
import { createAudioEngine } from '~~/app/composables/useAudioEngine'
// minimal mock ctx (reuse the pattern from the SP2a engine test file)
function mockCtx() { /* …createGain/createBufferSource stubs, currentTime=0… (copy from SP2a test) */ }
it('reports a decoded clip source duration after load', async () => {
  const state = { schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
    tracks: [{ id: 't', name: 't', kind: 'voiceover', gain_db: 0, muted: false, locked: false, hidden: false,
      clips: [{ id: 'c1', asset_id: null, r2_key: 'k', timeline_start_sec: 0, source_in_sec: 0,
        source_out_sec: null, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear' }] }], ducking: [] } as any
  const engine = createAudioEngine({ ctx: mockCtx(), resolveBuffer: async () => ({ duration: 7 }),
    setTimer: () => () => {}, now: () => 0 })
  await engine.load(state)
  expect(engine.clipSourceDuration('c1')).toBe(7)
})
```
- [ ] **Step 2: Run → FAIL** (`clipSourceDuration` not on the engine). Run: `pnpm exec vitest run test/audio/useAudioEngine.sourceDuration.test.ts`
- [ ] **Step 3: Implement** — track decoded buffer durations during `load`, expose accessor.
  - In `load()`, after `buffers.set(clip.clipId, buf)`, also record `sourceDur.set(clip.clipId, buf.duration)` where `const sourceDur = new Map<string, number>()` is declared alongside `buffers`.
  - Add to the returned object: `clipSourceDuration: (clipId: string) => sourceDur.get(clipId) ?? 0`.
  - Add `clipSourceDuration(clipId: string): number` to the `AudioEngine` interface.
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c engine.clipSourceDuration accessor`

---

## Phase 4 — Editor composable (edit actions + autosave + versions)

### Task 10: edit actions + engine re-load

**Files:** Modify `app/composables/useMediaProjectEditor.ts`

- [ ] **Step 1:** Add an `applyEdit(next: TimelineState)` internal that: pushes the current `timeline.value` onto the undo stack, sets `timeline.value = next`, calls `reloadEngine(next)`, and `scheduleAutosave()`. Add `reloadEngine(state)` that re-`planTimeline`s, sets `clips`/`tracks`, and `await engine.load(state)` then `duration.value = engine.duration()`. Instantiate `const undo = createUndoStack<TimelineState>()`.
- [ ] **Step 2:** Expose edit wrappers that call the pure `timelineEdit` fns with `crypto.randomUUID()` ids and `engine.clipSourceDuration(clipId)` for trims:
```ts
function moveClipAction(clipId: string, toTrackId: string, newStartSec: number) {
  if (!timeline.value) return
  applyEdit(moveClip(timeline.value, { clipId, toTrackId, newStartSec }))
}
function trimClipAction(clipId: string, edge: 'start'|'end', newTimeSec: number) {
  if (!timeline.value || !engine) return
  applyEdit(trimClip(timeline.value, { clipId, edge, newTimeSec, sourceDurationSec: engine.clipSourceDuration(clipId) }))
}
function sliceAction(clipId: string, timeSec: number) {
  if (!timeline.value) return
  applyEdit(sliceClipAt(timeline.value, { clipId, timeSec, leftId: crypto.randomUUID(), rightId: crypto.randomUUID() }))
}
function addClipAction(trackId: string, asset: { id: string; r2_key_master: string }, startSec: number) {
  if (!timeline.value) return
  applyEdit(addClip(timeline.value, { trackId, id: crypto.randomUUID(), asset, startSec }))
}
function deleteClipAction(clipId: string) {
  if (!timeline.value) return
  applyEdit(deleteClip(timeline.value, { clipId }))
}
function undoAction() { if (!timeline.value) return; const prev = undo.undo(timeline.value); if (prev) { timeline.value = prev; reloadEngine(prev); scheduleAutosave() } }
function redoAction() { if (!timeline.value) return; const nxt = undo.redo(timeline.value); if (nxt) { timeline.value = nxt; reloadEngine(nxt); scheduleAutosave() } }
```
- [ ] **Step 3:** Add `canUndo`/`canRedo` refs synced from the stack after each action.
- [ ] **Step 4: Verify** — `pnpm exec nuxt typecheck` (run with `NODE_OPTIONS='--max-old-space-size=16384'`) shows no new errors in this file; manual: editing the seeded project moves/trims/slices and playback reflects it.
- [ ] **Step 5: Commit** `feat(media-studio): SP2c editor edit actions + undo wiring`

### Task 11: debounced autosave (`timeline.put`)

**Files:** Modify `useMediaProjectEditor.ts`; Test `test/composables/editorAutosave.test.ts`

- [ ] **Step 1: Failing test** — extract the debounce into a pure helper for testability:
```ts
import { makeDebouncedSaver } from '~~/app/composables/useMediaProjectEditor'
it('coalesces rapid edits into one save after the delay', async () => {
  let calls = 0; const save = makeDebouncedSaver(async () => { calls++ }, 50)
  save.trigger(); save.trigger(); save.trigger()
  await new Promise(r => setTimeout(r, 80))
  expect(calls).toBe(1)
})
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — export `makeDebouncedSaver(fn, ms)` (`{ trigger() }` with a trailing timer) and wire `scheduleAutosave = () => saver.trigger()`; the save fn does `await $fetch(\`/api/agency/audio/projects/${projectId}/timeline\`, { method: 'PUT', body: { state: timeline.value } })` and flips a `saveStatus` ref (`'saving'|'saved'|'error'`). Verify the exact `timeline.put` body shape against `server/api/agency/audio/projects/[id]/timeline.put.ts` first.
- [ ] **Step 4: Run → PASS.**  - [ ] **Step 5: Commit** `feat(media-studio): SP2c debounced autosave`

### Task 12: named version snapshots

**Files:** Modify `useMediaProjectEditor.ts`

- [ ] **Step 1:** Add `saveVersion(label: string)` → `POST .../versions { label, state }`; `listVersions()` → `GET .../versions`; `restoreVersion(state)` → `applyEdit(cloneState(state))`. Verify request/response shapes against `versions.post.ts`/`versions.get.ts`.
- [ ] **Step 2:** Extend the composable's return with: `moveClipAction, trimClipAction, sliceAction, addClipAction, deleteClipAction, undoAction, redoAction, canUndo, canRedo, saveStatus, saveVersion, listVersions, restoreVersion`.
- [ ] **Step 3: Verify** typecheck clean.  - [ ] **Step 4: Commit** `feat(media-studio): SP2c version snapshots`

---

## Phase 5 — Component: interactions, zoom, waveforms

### Task 13: add `wavesurfer.js`
- [ ] **Step 1:** `pnpm add wavesurfer.js`
- [ ] **Step 2:** Verify `grep wavesurfer package.json`. **Commit** `chore(media-studio): add wavesurfer.js for SP2c waveforms`

### Task 14: zoom + selection state in `MediaTimeline.client.vue`
**Files:** Modify `app/components/media/MediaTimeline.client.vue`
- [ ] Add a `pxPerSec` prop/ref with a `USelect`/range zoom control + a "fit to window" button (compute `pxPerSec = containerWidth / duration`). Add `selectedClipId` state; clicking a clip block sets it (ring highlight via a Tailwind `ring` class), clicking empty clears it. Emit `select`, `seek` (existing). Keep the SP2b read-only render path intact.
- [ ] **Verify:** dev server (`CHOKIDAR_USEPOLLING=true pnpm dev`), open the seeded project, zoom + select work. **Commit** `feat(media-studio): SP2c zoom + clip selection`

### Task 15: drag-to-move (with snap) + trim handles
- [ ] Add pointer handlers on clip blocks: `pointerdown` captures the clip + offset; `pointermove` shows a live preview (CSS transform, no state commit); `pointerup` computes the dropped `timeline_start_sec = snapTime(xToTime(px), snapTargets, pxPerSec)` and the target track from the lane under the pointer, then emits `move-clip {clipId,toTrackId,newStartSec}`. `snapTargets` = grid ticks + every other clip's start/end + playhead + 0. Add left/right trim handles (8px hit zones) emitting `trim-clip {clipId, edge, newTimeSec}` on release.
- [ ] The page (Task 18) wires these emits to `moveClipAction`/`trimClipAction`.
- [ ] **Verify** on the seeded project; **Commit** `feat(media-studio): SP2c drag-move + trim handles`

### Task 16: slice + delete + waveforms
- [ ] Toolbar "Split at playhead" button + `S` key → emit `slice {clipId, timeSec: currentTime}` for the selected (or under-playhead) clip. `Delete`/`Backspace` → emit `delete-clip {clipId}` for the selection.
- [ ] Per clip block, render a `wavesurfer.js` instance (render-only, `interact: false`, `media`/`peaks` from the clip's presigned URL passed via prop from the page's `clip-sources`); cache the created instance per `r2_key`; destroy on unmount. **Never** let wavesurfer drive playback — the engine is the clock.
- [ ] **Verify**; **Commit** `feat(media-studio): SP2c slice/delete + waveforms`

---

## Phase 6 — Asset picker, create-flow, nav

### Task 17: `MediaAssetPicker` slideover
**Files:** Create `app/components/media/MediaAssetPicker.vue`
- [ ] `USlideover` listing `audio_assets` via `useFetch('/api/agency/audio/assets')` — filter by `kind` (USelect), search by title (UInput), inline `<audio :src>` preview (presigned URL from the asset row / a per-asset presign). Emits `pick(asset)` with `{ id, r2_key_master, title, kind }`. Verify the assets endpoint's response shape first.
- [ ] **Verify**; **Commit** `feat(media-studio): SP2c asset picker slideover`

### Task 18: editor page wiring
**Files:** Modify `app/pages/agency/audio/projects/[id].vue`
- [ ] Add a toolbar (undo/redo buttons bound to `canUndo`/`canRedo`, zoom, split, "Add clip" → opens `MediaAssetPicker`, "Save version", save-status pill). Wire `MediaTimeline` emits (`move-clip`/`trim-clip`/`slice`/`delete-clip`/`select`/`seek`) to the composable actions; wire keyboard (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, `S`, `Delete`) via a `useEventListener` window handler. Pass `clip-sources` presigned URLs into `MediaTimeline` for waveforms.
- [ ] **Verify** full round-trip on the seeded project (add → move → trim → slice → undo → autosave → reload persists → play reflects edits). **Commit** `feat(media-studio): SP2c editor page wiring`

### Task 19: projects list + create
**Files:** Create `app/pages/agency/audio/projects/index.vue`
- [ ] `UTable` of `useFetch('/api/agency/audio/projects')` (columns: title, media_type, updated_at; row actions open `/agency/audio/projects/[id]`, duplicate, delete). "New project" → `UModal` with a title `UInput` → `$fetch('/api/agency/audio/projects', { method: 'POST', body: { title, media_type: 'audio' } })` → `navigateTo` the new id. Verify `index.post` request/response shape.
- [ ] **Verify** create → lands in editor on an empty timeline. **Commit** `feat(media-studio): SP2c projects list + create`

### Task 20: nav entry
- [ ] Add a "Projects" (editor) link under the agency audio area in the existing nav component (find the nav that lists `/agency/audio`; add the sibling). **Verify** it routes. **Commit** `feat(media-studio): SP2c nav entry for the editor`

### Task 21: front-facing features sync (repo rule)
- [ ] Per `CLAUDE.md` "Front-Facing Page Sync", add the editor to `app/pages/features/index.vue` (+ `[slug].vue` if a detail entry fits) under the media/creative category. **Commit** `docs(marketing): surface the Media Studio editor on features pages`

---

## Self-Review (run before execution)

- **Spec coverage:** create-flow (T19), nav (T20), asset picker (T17–18), move/trim/slice/delete/snap (T2–7,15–16), undo/redo (T8,10), autosave (T11), versions (T12), zoom (T14), waveforms (T13,16), engine integration (T9,10). ✅ all spec sections mapped.
- **Type consistency:** edit fns all take/return `TimelineState`; ids passed in; `clipSourceDuration` defined in T9 and used in T10's `trimClipAction`. Asset shape `{ id, r2_key_master }` consistent across T4/T17/T18.
- **Placeholders:** the three "verify the endpoint shape" notes (timeline.put T11, versions T12, assets/projects T17–19) are **required verification steps against real files**, not deferred logic — the engineer reads the endpoint, confirms the body/response, adjusts the `$fetch` call. Flagged explicitly so they're not skipped.
- **Known latitude:** Vue pointer-interaction tasks (T14–16, 18) are larger than 5-minute steps and are specified by behavior + emit contracts + the existing SP2b component as the pattern, since full happy-dom TDD of drag is impractical; the pure logic they call (T1–9) is fully TDD'd.

## Verify-live (end state)
Run the SP2c acceptance list (spec §11) on the seeded project — including the carried SP1/SP2 ear-check on a real *edited* multitrack. Dormant-in-prod posture unchanged.
