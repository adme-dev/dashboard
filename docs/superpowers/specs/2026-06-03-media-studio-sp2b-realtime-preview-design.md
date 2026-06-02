# Media Studio — Sub-project 2b: Real Audio Engine + Minimal Read-Only Preview

**Status:** Approved design — ready for implementation planning
**Date:** 2026-06-03
**Phase:** Audio Media Studio, Phase 1b, Sub-project 2b (make the headless engine real and audible, smallest surface)
**Depends on:** SP0 (`…/2026-06-02-media-studio-sp0-timeline-contract-design.md`) — `TimelineState` contract + project GET; SP2a (`…/2026-06-02-media-studio-sp2a-audio-engine-design.md`) — the headless `createAudioEngine` + pure planner + offline preview (PR #111).
**Parent briefs:** `docs/engagr-ai-media-studio-brief.md` (§4 the clock rule, §5 Tier-1 preview), `docs/engagr-ai-media-studio-oss-prior-art.md` (§1 standardized-audio-context, autoplay policy, no native sidechain).

---

## 1. Why this slice exists

SP2a built and unit-tested the headless audio engine (a pure schedule planner, a thin `useAudioEngine` adapter over an **injected** `BaseAudioContext`/`resolveBuffer`/`setTimer`, and an `OfflineAudioContext` preview). It ships nothing user-visible and was verified with a mock context only — the SP2a spec §8 explicitly carried the **first true ear/eyeball pass** as an SP2b deliverable, because there was no real context and no UI to drive it.

The SP2a spec described SP2b as the *whole* editor (page + GSAP timeline + clip add/move/trim + asset library + autosave + waveforms + collab). That is too large for one spec, and it would pile UI churn on top of an as-yet-unheard engine. **This slice is the minimal vertical that makes the engine real and audible** — nothing more:

- A real `AudioContext` (via `standardized-audio-context`) and a real `resolveBuffer` (fetch R2 + `decodeAudioData`), injected into the existing `createAudioEngine`.
- A server endpoint that turns the timeline's `r2_key`s into presigned URLs the browser can fetch.
- A **read-only** editor page that loads an SP0 project, renders its tracks/clips on a purpose-built lane view, and drives the engine for transport (play/pause/seek) with a playhead slaved to `engine.currentTime()`.
- The ramp-anchor + nominal-gain correctness fix the SP2a final review flagged (closing the inline `TODO(SP2b)`), now verifiable by ear.

**The clock rule (non-negotiable, brief §4):** `AudioContext.currentTime` is the master clock; the visual playhead slaves to it. SP2b drives the playhead from `requestAnimationFrame` **reading** `engine.currentTime()` — never the reverse.

### Scope of SP2b

**In scope:**
- New dependency `standardized-audio-context` + a real-context factory and a real `resolveBuffer`/`setTimer`/`now`.
- Authed per-project `clip-sources` endpoint (presigns only the timeline's keys).
- A read-only multitrack lane-view timeline + transport bar, on a new editor page.
- An editor composable wiring SP0 fetch → real engine.
- The ramp-anchor + nominal-gain fix in `useAudioEngine` and `offlinePreview`.

**Explicitly out of scope (→ SP2c / SP2d):**
- Add / move / trim clips; the asset library/picker (SP2c).
- Autosave (SP0 `timeline.put`) — SP2b never mutates the timeline (SP2c).
- Waveform rendering (wavesurfer.js — SP2c).
- Real-time collab (banner-rooms port — SP2d).
- Transcript-driven VO editing, per-track lock/mute UI, duck-amount UI (SP3).
- A "Render master" button / SP1 render-job UI (deferred — render is shipped in SP1; preview audibility is this slice's point).
- A Web-Worker timer for background-tab survival (carried SP2a follow-up).
- GSAP for the playhead (a single line needs only rAF; GSAP re-enters in SP2c with richer timeline animation).

---

## 2. Foundation this builds on (verified 2026-06-03)

- **SP0** `GET /api/agency/audio/projects/[id]` returns a `MediaProject` with its current `TimelineState` (org-scoped via `requireAuth` + the `projects.ts` gateway). Clips carry `r2_key`, `timeline_start_sec`, `source_in_sec`, `source_out_sec`, `gain_db`, fades, `fade_curve`; tracks carry `gain_db`, `muted`; `ducking[]` carries `amount_db`, `attack_ms`, `release_ms`.
- **SP2a** `createAudioEngine(deps)` (`app/composables/useAudioEngine.ts`) already takes injected `ctx` / `resolveBuffer(clip) → AudioBuffer` / `setTimer` / `now`, exposes `load/play/pause/seek/currentTime/duration/isPlaying/dispose`, and uses `ctx.currentTime` as master. The pure planner (`audioSchedulePlanner.ts`) and `offlinePreview.ts` are unchanged here except the ramp fix (§6).
- **R2 presigning exists:** `server/utils/audio/assets.ts` `streamUrlFor(asset)` presigns an R2 GET URL; `server/utils/storage.ts` holds the R2 client (`getR2Client()` with the `FetchHttpHandler` fix). SP2b presigns by `r2_key` directly (a clip key may not correspond to an `AudioAsset` row, so we presign the key, reusing the same client/bucket + presign call `streamUrlFor` uses internally).
- **`gsap` ^3.14** is installed (not used in SP2b). **`standardized-audio-context` is not** — SP2b adds it. `wavesurfer.js` stays uninstalled (SP2c).
- **Existing page pattern:** `/agency/audio/index.vue` is the *generate* studio (voiceover/music). The SP2b editor is a new sibling page under `/agency/audio/projects/[id]`. Agency pages are gated by the existing agency-auth middleware.

---

## 3. Architecture — five units (+ one fix)

Client units under `app/`; one server endpoint. Each has one responsibility and a well-defined interface.

### 3.1 Real-context layer — `app/utils/audio/audioContextFactory.ts`
Thin browser-only adapters that produce the real collaborators `createAudioEngine` already expects. No new engine API.

```ts
import { AudioContext } from 'standardized-audio-context'
import type { ScheduledClip } from '~~/app/utils/audio/audioSchedulePlanner'

/** A suspended real AudioContext (resumed on first play — autoplay policy). */
export function createBrowserAudioContext(sampleRate?: number): AudioContext

/** setTimeout wrapper → cancel fn; the engine's lookahead loop driver in prod. */
export function browserSetTimer(cb: () => void, ms: number): () => void

/** Build a resolveBuffer over a { r2_key → presigned URL } map: fetch → arrayBuffer
 *  → ctx.decodeAudioData. Throws if a clip's key is missing from the map. */
export function makeR2Resolver(
  clipSources: Record<string, string>,
  ctx: Pick<AudioContext, 'decodeAudioData'>
): (clip: ScheduledClip) => Promise<AudioBuffer>
```

`makeR2Resolver` is unit-testable with a fake `clipSources` map + a stub `decodeAudioData` and a mocked `fetch` (no real network). `createBrowserAudioContext`/`browserSetTimer` are thin prod wrappers (manual-verified).

### 3.2 Clip-sources endpoint — `server/api/agency/audio/projects/[id]/clip-sources.get.ts`
```
GET /api/agency/audio/projects/:id/clip-sources
→ requireAuth; load project via projects.ts gateway (org-scoped, 404 if not found/forbidden)
→ keys = collectClipKeys(project.currentTimeline)        ← PURE, unit-tested
→ presign each key (short TTL) reusing the storage R2 client
→ { sources: { [r2_key]: presignedUrl } }
```
Presigns **only** the distinct `r2_key`s present in *this* project's current timeline — never an arbitrary client-supplied key (no IDOR/SSRF). A presign failure for one key omits that key from the response; the resolver then throws a clear "missing buffer" at load, which the editor surfaces as a hard load error (playback needs every clip). This is stricter than `streamUrlFor`'s "a presign error must not fail a committed read" stance — deliberately, since a partial mix would be wrong.

Pure helper `server/utils/audio/clipSources.ts` → `collectClipKeys(timeline): string[]` — the distinct clip `r2_key`s of **non-muted** tracks only (muted tracks are dropped by the planner, so the engine never requests their buffers); unit-tested. The endpoint imports it (server-side, alongside the gateway).

### 3.3 Editor composable — `app/composables/useMediaProjectEditor.ts`
```ts
export interface MediaProjectEditor {
  timeline: Ref<TimelineState | null>
  status: Ref<'idle' | 'loading' | 'ready' | 'error'>
  error: Ref<string | null>
  isPlaying: Ref<boolean>
  currentTime: Ref<number>   // updated each rAF while playing (for the playhead + time display)
  duration: Ref<number>
  play(): Promise<void>      // resumes ctx on first call (autoplay policy)
  pause(): void
  seek(sec: number): void
}
export function useMediaProjectEditor(projectId: string): MediaProjectEditor
```
Flow: fetch SP0 project GET + `clip-sources` (parallel) → `createBrowserAudioContext()` → `makeR2Resolver(sources, ctx)` → `createAudioEngine({ ctx, resolveBuffer, setTimer: browserSetTimer, now })` → `await engine.load(timeline)` → `status='ready'`. A rAF loop (only while `isPlaying`) writes `engine.currentTime()` into the `currentTime` ref and stops at `duration`. `dispose()`s the engine + cancels rAF on unmount. SSR-guarded (engine + AudioContext are client-only; the page is `.client`-driven or guards `import.meta.client`).

### 3.4 Read-only lane-view timeline — `app/components/media/MediaTimeline.client.vue` + `app/utils/audio/timelineGeometry.ts`
Pure geometry (unit-tested):
```ts
export function clipRect(clip: { timelineStartSec: number; durationSec: number | null },
                         pxPerSec: number, fallbackDurSec: number): { x: number; width: number }
export function playheadX(currentTimeSec: number, pxPerSec: number): number
export function trackLaneCount(timeline: TimelineState): number
```
Component: one row per track (label + mute indicator), clips as absolutely-positioned blocks (`clipRect`) showing name + duration, a time ruler (tick marks per N seconds), and a single playhead line positioned by `playheadX(currentTime)`. Read-only — no drag handlers. `pxPerSec` is a simple fixed zoom (a zoom control is SP2c). Semantic Nuxt UI colors, dark-mode safe. Clips with `durationSec: null` use the engine's resolved `duration()` lower bound for width (`fallbackDurSec`), matching playback.

### 3.5 Editor page — `app/pages/agency/audio/projects/[id].vue`
Agency-auth middleware (same as other `/agency/*` pages; add to the middleware sweep if route-pattern matching misses it — see SP-lessons on `.client` glob misses). Reads `:id` via `useRoute`, calls `useMediaProjectEditor(id)`, renders: a header (project name/back link), `MediaTimeline`, and a transport bar — play/pause toggle (`UButton`), a seek scrubber (slider bound to `currentTime`/`duration`, calls `seek` on commit), and a `mm:ss / mm:ss` time display. Loading and error states (`status`) use Nuxt UI (`USkeleton`/`UAlert`). No autosave, no editing affordances.

### 3.6 Ramp-anchor + nominal-gain fix (closes the SP2a `TODO(SP2b)`)
In **`useAudioEngine.scheduleRamp`** and **`offlinePreview`**:
1. **Anchor the ramp start:** before `linearRampToValueAtTime(target, atSec + rampSec)`, call `setValueAtTime(<held value>, atSec)` (engine: `ctxStart + atSec`; preview: `atSec`). Web Audio ramps from the previous automation event, so without the anchor a duck whose `atSec > 0` ramps from t≈0. The engine maintains a small per-bus "current scheduled gain" value (initialised to the nominal at load, updated as ramps are scheduled in `atSec` order) to supply the held value; the offline pass walks `plan.ramps` (already sorted) and tracks the same.
2. **Compose with nominal track gain:** `DuckRamp.toGainDb` is reinterpreted as a **delta from the bus's nominal gain** (the planner already emits `amount_db` for duck and `0` for restore — no planner change). Target = `dbToGain(trackNominalGainDb + toGainDb)` so a duck on a −6 dB music bus with `amount_db −12` → −18 dB, and restore → −6 dB (not unity). The engine looks up `trackNominalGainDb` from `plan.tracks`; the preview from the same. `DuckRamp.toGainDb`'s doc comment is updated to say "delta from the target bus's nominal gain."

The existing SP2a engine/preview ramp unit tests update to the new expected values (anchored time + composed gain). Planner tests are unchanged.

---

## 4. Data flow

```
/agency/audio/projects/:id  (agency-auth)
  useMediaProjectEditor(id):
    GET projects/:id            → TimelineState           (SP0, org-scoped)
    GET projects/:id/clip-sources → { r2_key → presignedUrl }  (only this timeline's keys)
    ctx = createBrowserAudioContext()                      (suspended)
    engine = createAudioEngine({ ctx, resolveBuffer: makeR2Resolver(sources, ctx),
                                 setTimer: browserSetTimer, now })
    await engine.load(timeline)  → planSchedule + planDuckingRamps + pre-resolve buffers
  user clicks Play:
    engine.play(): ctx.resume() (autoplay); lookahead loop schedules clips/ramps;
                   duck ramps now anchored + composed with nominal gain (§3.6)
    rAF loop: currentTime.value = engine.currentTime()  → MediaTimeline playhead + time display
  user scrubs:  seek(sec) → engine.seek(sec)
  unmount:      engine.dispose(); cancel rAF
```
Verification: real R2 audio plays as a synced multitrack mix — VO over a music bed that **ducks correctly** (anchored, composed gain) with fades; the playhead tracks `currentTime()`; scrub/seek lands accurately. This is the SP2a §8 ear/eyeball pass.

---

## 5. Testing (TDD, Vitest + happy-dom)

- **`collectClipKeys` (pure):** distinct keys from non-muted tracks; empty timeline → `[]`; dedupes repeated keys. Exact output.
- **`timelineGeometry` (pure):** `clipRect` x/width from `timelineStartSec`/`durationSec`+`pxPerSec`, null-duration uses fallback; `playheadX` linearity; `trackLaneCount`. Exact output.
- **`makeR2Resolver`:** fetch+decode happy path (mocked `fetch` → arrayBuffer → stub `decodeAudioData`), and **throws** on a clip whose `r2_key` is absent from the map.
- **clip-sources endpoint:** `requireAuth` 401; project-not-found/forbidden → 404 (org-scope); presigns only the timeline's keys (mocked presign asserts the exact key set, never an arbitrary key); response shape `{ sources }`.
- **Ramp fix (updated SP2a tests):** engine + preview ramp tests assert the `setValueAtTime` anchor at `atSec` and the **composed** target `dbToGain(nominal + delta)` (duck and restore), at the right times.
- **Composable (optional, light):** mock `useFetch` + a fake engine to assert load→ready, play resumes ctx, seek delegates, dispose on unmount.
- **Manual eyeball (the deliverable):** real context factory + page on a real project — audible multitrack playback, ducking/fades correct, playhead synced, scrub accurate. Cross-check against SP1's ffmpeg master if convenient.

## 6. Tenancy / security
- `clip-sources` is `requireAuth` + org-scoped through the SP0 gateway; presigns **only** the current timeline's `r2_key`s (no arbitrary-key presign → no IDOR/SSRF). Short presign TTL.
- Editor page uses the existing agency-auth middleware (verify the `/agency/audio/projects/[id]` route is covered; add explicitly if the middleware sweep misses dynamic/`.client` routes — known repo gotcha).
- No new secrets; R2 client + bucket reused from `server/utils/storage.ts`. The browser only ever sees short-lived presigned GET URLs for assets it's authorised to load.

## 7. Risks / open items (carried, not blocking SP2b)
- **Autoplay policy:** `ctx.resume()` must be inside the user's Play gesture; the composable resumes on the first `play()` call. Verify in Chrome + Safari.
- **`decodeAudioData` cost / many clips:** buffers are pre-resolved at `load()`; a very large timeline could be slow/memory-heavy. Acceptable for SP2b (small briefs); lazy/streamed decode is a later concern.
- **Background-tab `setTimeout` throttling** (carried SP2a §8) — wide lookahead mitigates; Web-Worker timer deferred.
- **Ducking perceptual parity with SP1** (gain-ramps vs `sidechaincompress`) — the §3.6 nominal-gain composition is the right model; ear-verify alongside SP1's §10 ducking check during the eyeball pass.
- **Safari** AudioContext quirks — covered by `standardized-audio-context`; test in Safari during the eyeball pass.
- **Presign TTL vs long sessions:** if a user leaves the editor open past the TTL, buffers are already decoded (resolved at load) so playback is unaffected; a reload re-presigns. No action needed for SP2b.
