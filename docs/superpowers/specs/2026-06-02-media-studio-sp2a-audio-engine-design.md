# Media Studio — Sub-project 2a: Headless Audio Engine

**Status:** Approved design — ready for implementation planning
**Date:** 2026-06-02
**Phase:** Audio Media Studio, Phase 1b, Sub-project 2a (the editor engine core, headless)
**Depends on:** SP0 (`…/2026-06-02-media-studio-sp0-timeline-contract-design.md`) — the `TimelineState` contract. Decoupled from SP1 (render spine) at runtime; both consume the SP0 contract.
**Parent briefs:** `docs/engagr-ai-media-studio-brief.md` (§4 editing layer, the clock rule; §5 Tier-1 preview), `docs/engagr-ai-media-studio-oss-prior-art.md` (§1 audio engine: Tale-of-Two-Clocks, standardized-audio-context, no-native-sidechain)

---

## 1. Why this slice exists

SP2 (the timeline editor) is too large for one spec. It splits:
- **SP2a — Headless audio engine** *(this doc)*: the Web Audio engine that plays an SP0 `TimelineState` with sample-accurate timing — the inverted clock, a lookahead scheduler, scheduled gain-ramp ducking, transport, and an `OfflineAudioContext` Tier-1 preview. **No UI, no GSAP, no collab.** Produces nothing user-visible but is the load-bearing, riskiest part (the clock).
- **SP2b — Editor UI** *(next)*: the Vue page that loads a project (SP0 GET), renders tracks/clips on the reused Banner-Studio GSAP timeline, lets staff add/move/trim clips from the asset library, drives this engine for preview, slaves the GSAP playhead to `engine.currentTime()`, and autosaves the `TimelineState` (SP0 PUT). Plus waveforms (wavesurfer.js) + collab (banner-rooms port).

Splitting lets the hard real-time/clock problem be solved and unit-tested in isolation before any UI churn sits on top.

**The clock rule (non-negotiable, brief §4):** `AudioContext.currentTime` is the master clock; GSAP slaves to it (in SP2b). The engine never drives audio off `requestAnimationFrame`. Inverting this causes cumulative drift (VO sliding against the bed, late fades). SP2a builds and exposes the master; SP2b consumes it.

### Scope of SP2a

**In scope:**
- A pure, unit-tested schedule planner (`TimelineState` → timed events + ducking gain-ramps + lookahead window slicing).
- A thin Web Audio engine adapter (transport, per-track gain buses, the lookahead loop) over an injected `AudioContext` — testable with a mock context.
- An `OfflineAudioContext` Tier-1 preview mixdown (non-authoritative).
- One new dependency: `standardized-audio-context`.

**Explicitly out of scope:**
- Any UI, drag/trim interactions, waveform rendering (SP2b — wavesurfer.js).
- The GSAP playhead / timeline visuals (SP2b — reuse Banner Studio, inverting its clock).
- Real-time collab (SP2b/SP3 — banner-rooms port).
- Transcript-driven VO editing, per-track lock/mute UI, duck-amount UI (SP3).
- A Web-Worker timer for background-tab survival (noted §8 follow-up; SP2a uses `setTimeout` + a wide lookahead).
- Authoritative render (SP1 ffmpeg — already shipped).

---

## 2. Foundation this builds on (verified 2026-06-02)

- **SP0 `TimelineState`** (`server/utils/audio/timelineSchema.ts`, pure, zod-only): `tracks[] → clips[]` (each with `r2_key`, `timeline_start_sec`, `source_in_sec`, `source_out_sec`, `gain_db`, fades, `fade_curve`), `ducking[]` (`source_track_id`, `target_track_id`, `amount_db`, `attack_ms`, `release_ms`, `threshold_db`), `sample_rate`. This is the engine's input.
- **SP1 ducking semantics** (`timelineFiltergraph.ts`): the render compiles each `DuckingRule` to ffmpeg `sidechaincompress`. SP2a compiles the *same* rule to scheduled gain ramps — **the rule is the single source of truth**; the two compilations must stay perceptually consistent (an ear-verify item, like SP1 §10).
- **`gsap` ^3.14** is installed (used in SP2b, not here). **`standardized-audio-context`, `wavesurfer.js`, `tone` are not** — SP2a adds only `standardized-audio-context` (OSS §1: Safari's 4-running-context limit, AudioParam consistency, Worklet fallbacks).
- **OSS prior-art adopted (no code dependency):** the Tale-of-Two-Clocks lookahead recipe (schedule ~100 ms ahead on a ~25 ms timer); no native sidechain → scheduled `gain.setTargetAtTime`/`linearRampToValueAtTime`; ramp (don't hard-cut) to avoid scrub clicks.

---

## 3. Architecture — three units

Client-side, under `app/`. Each unit has one responsibility and a well-defined interface.

### 3.1 Pure planner — `app/utils/audio/audioSchedulePlanner.ts`
No I/O. The TDD core (exact-output tests, the `render.ts` style).

```ts
import type { TimelineState } from '~~/server/utils/audio/timelineSchema' // type-only (see §5)

export interface ScheduledClip {
  clipId: string
  trackId: string
  r2_key: string
  timelineStartSec: number   // when on the timeline
  sourceInSec: number        // offset into the source buffer
  durationSec: number | null // null = play to source end (resolved at schedule time from the buffer)
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  fadeCurve: 'linear' | 'exp' | 'log'
}

export interface DuckRamp {
  targetTrackId: string
  atSec: number              // timeline time the ramp starts
  toGainDb: number           // 0 (restore) or amount_db (duck)
  rampSec: number            // attack_ms/1000 (duck) or release_ms/1000 (restore)
}

/** Flatten tracks/clips → timed clip events, in timeline order. Muted tracks skipped
 *  (parity with SP1). durationSec stays null when source_out_sec is null. Pure. */
export function planSchedule(state: TimelineState): ScheduledClip[]

/** Compile each DuckingRule → target-track gain-automation events at every
 *  source(VO)-clip boundary: down to amount_db over attack_ms at clip start,
 *  back to 0 dB over release_ms at clip end. The Web-Audio compilation of the
 *  same rule SP1 renders via sidechaincompress (Web Audio has no sidechain). Pure. */
export function planDuckingRamps(state: TimelineState): DuckRamp[]

/** Lookahead slice: clips whose start ∈ [fromSec, toSec) and ramps whose atSec ∈
 *  [fromSec, toSec). The pure heart of the scheduler loop. */
export function windowEvents(
  clips: ScheduledClip[], ramps: DuckRamp[], fromSec: number, toSec: number
): { clips: ScheduledClip[]; ramps: DuckRamp[] }
```

### 3.2 Engine adapter — `app/composables/useAudioEngine.ts`
Thin imperative layer. Collaborators injected so it's unit-testable without a real browser.

```ts
export interface AudioEngineDeps {
  ctx: BaseAudioContext            // standardized-audio-context AudioContext (real) or a mock
  resolveBuffer(clip: ScheduledClip): Promise<AudioBuffer> // fetch R2 + decodeAudioData (SP2b) or a stub
  now(): number                    // wall clock for the lookahead timer cadence (injectable; Date.now in prod)
  setTimer(cb: () => void, ms: number): () => void // setTimeout wrapper, returns cancel (injectable fake in tests)
}

export interface AudioEngine {
  load(state: TimelineState): Promise<void> // plan + pre-resolve buffers
  play(): void
  pause(): void
  seek(sec: number): void
  currentTime(): number            // master clock position (ctx.currentTime − startOffset); GSAP slaves to this in SP2b
  duration(): number
  isPlaying(): boolean
  dispose(): void
}

export function createAudioEngine(deps: AudioEngineDeps): AudioEngine
```

Internals: a per-track `GainNode` bus (created from the plan), connected to `ctx.destination`. On `play()`, a lookahead loop runs every ~25 ms: read `ctx.currentTime`, compute the timeline position, call the **pure** `windowEvents` for the next ~100 ms, then for each due clip `bufferSource.start(when, sourceInSec, durationSec)` (where `when = ctx.currentTime + (clip.timelineStartSec − pos)`), apply clip fades (`gain.linearRampToValueAtTime` with the `fade_curve`), and apply due `DuckRamp`s to the target track bus. `ctx.currentTime` is master; `currentTime()` exposes the position. `pause()`/`seek()` stop scheduled sources and reset the offset. Ramp gains (never hard-cut) to avoid clicks. `AudioContext` starts `suspended` → `resume()` on `play()` (autoplay-policy, OSS §4).

### 3.3 Offline preview — `app/utils/audio/offlinePreview.ts`
```ts
/** Non-authoritative Tier-1 mixdown for instant in-browser scrub/playback. Reuses
 *  planSchedule + planDuckingRamps into an OfflineAudioContext so preview and the
 *  live engine agree. NEVER the shipped asset — the ffmpeg render (SP1) is the source
 *  of truth (browser resamplers drift per machine; brief §5). */
export async function renderPreview(
  state: TimelineState,
  resolveBuffer: (clip: ScheduledClip) => Promise<AudioBuffer>,
  OfflineCtor?: typeof OfflineAudioContext  // injectable for tests
): Promise<AudioBuffer>
```

---

## 4. Data flow

```
SP2b passes a TimelineState (from SP0 GET) + a resolveBuffer (R2 fetch + decodeAudioData)
  → engine.load(state): planSchedule + planDuckingRamps (pure) + pre-resolve buffers
  → engine.play(): ctx.resume(); start lookahead loop
       every ~25ms: pos = ctx.currentTime − startOffset
                    { clips, ramps } = windowEvents(schedule, pos, pos + 0.1)   ← PURE
                    for clip: bufferSource(buf).start(ctx.currentTime + (clip.start − pos), sourceIn, dur)
                              + fade ramps on the source's gain
                    for ramp: trackBus.gain.linearRampToValueAtTime(dbToGain(toGainDb), now + rampSec)
  → SP2b reads engine.currentTime() each rAF frame to drive the GSAP playhead (SP2b)
  → engine.pause()/seek(): stop sources, reset offset
  → renderPreview(state, resolveBuffer): same plan into OfflineAudioContext → AudioBuffer (scrub/export-preview)
```

`dbToGain(db) = 10^(db/20)` (shared tiny helper; gain ramps use linear amplitude, like SP1's `duckThresholdLinear` insight).

---

## 5. Key decision — where the shared contract type lives

The planner needs the `TimelineState` **type** (and SP2b may want the Zod schema for pre-save validation). SP0's `timelineSchema.ts` lives in `server/utils/audio/` (pure, zod-only, already dual-imported by Nitro + the Worker).

**Decision: type-only import from the existing module** — `import type { TimelineState } from '~~/server/utils/audio/timelineSchema'`. Type-only imports erase at build, so no server code enters the client bundle, and there's one source of truth. **Fallback:** if Nuxt's client tsconfig cannot resolve that path for a type-only import (verify in the plan's first task), relocate `timelineSchema.ts` to a shared location (e.g. `shared/audio/` or `app/utils/audio/`) and re-export it from the server path — a small, additive move that keeps SP0/SP1 importers working. Try type-only first; relocate only if the build/typecheck demands it.

If SP2b later needs runtime client-side validation, importing the Zod `TimelineStateSchema` value (not just the type) *would* pull zod into the client bundle — acceptable (zod is already a client-reachable dep), decided in SP2b, not here.

---

## 6. Testing (TDD, Vitest + happy-dom)

- **Planner (pure, the core):** `planSchedule` ordering + muted-track skip + null `durationSec`; `planDuckingRamps` ramp times/targets for single + multi-rule + multi-VO-clip timelines (assert exact `DuckRamp[]`); `windowEvents` slicing (boundary inclusivity, empty window). Exact-output assertions, no mocks.
- **Engine adapter:** drive with a **mock `BaseAudioContext`** (fake `currentTime`, `createBufferSource`/`createGain` returning spy nodes with `start`/`linearRampToValueAtTime`/`connect`) + a **fake `setTimer`/`now`** the test advances manually. Assert: `load` plans + resolves buffers; `play` resumes ctx + schedules due clips with the right `start(when, offset, dur)`; duck ramps hit the right track bus with `dbToGain(amount_db)`; `seek`/`pause` stop sources + reset; `currentTime()` tracks the (mock) clock. No real audio.
- **Offline preview:** inject a mock `OfflineAudioContext`; assert the same scheduling calls as the live engine for a given timeline (parity), or defer audible correctness to the SP2b eyeball.
- **Ducking parity (cross-check):** a test that `planDuckingRamps` and SP1's ducking consume the same `DuckingRule` fields consistently (amount_db → ramp target; attack/release → ramp times) — documents the shared-contract guarantee.

## 7. Tenancy / security
Client-side engine only — no auth surface of its own (it operates on a `TimelineState` already fetched through SP0's `requireAuth` endpoints). No secrets; `resolveBuffer` fetches R2 bytes via SP2b's authed path. Nothing to gate here.

## 8. Risks / open items (carried, not blocking SP2a)
- **Clock correctness is experiential.** Unit tests prove the *scheduling calls*; real drift/click/sync correctness needs a human in a real browser — and there's no UI to drive it until SP2b. SP2a ships unit-verified-only; the first true ear/eyeball pass is an SP2b deliverable.
- **Background-tab throttling** degrades `setTimeout` schedulers (OSS §4). SP2a uses a wide lookahead as mitigation; a Web-Worker timer is a deferred hardening follow-up.
- **`source_out_sec: null` duration** is resolved from the decoded `AudioBuffer.duration` at schedule time (the engine has the buffer; the pure planner leaves `durationSec: null` and the adapter fills it) — mirrors SP0 `computeDuration`'s documented lower-bound caveat.
- **Ducking perceptual parity with SP1** (gain-ramps vs `sidechaincompress`) — pin the mapping in tests; ear-verify alongside SP1's §10 ducking check.
- **Safari** AudioContext quirks — `standardized-audio-context` covers the known ones; test in Safari during SP2b.
