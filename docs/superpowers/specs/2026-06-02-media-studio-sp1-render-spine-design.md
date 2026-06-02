# Media Studio — Sub-project 1: Render Spine

**Status:** Approved design — ready for implementation planning (implementation HELD until SP0 / PR #107 merges)
**Date:** 2026-06-02
**Phase:** Audio Media Studio, Phase 1b, Sub-project 1 (the render layer)
**Depends on:** SP0 (`docs/superpowers/specs/2026-06-02-media-studio-sp0-timeline-contract-design.md`) — the timeline JSON contract + `media_projects`/`media_timelines`/`media_render_jobs` schema. SP1 is the first real consumer of that contract.
**Parent briefs:** `docs/engagr-ai-media-studio-brief.md`, `docs/engagr-ai-media-studio-oss-prior-art.md` (§1 ducking, §3 OTIO), `docs/engagr-ai-media-studio-competitive-patterns.md`

---

## 1. Why this slice exists

SP0 made the timeline a durable, versioned, validated document. SP1 turns that document into **actual rendered audio**: a multi-track mixdown with delays, gains, fades, and ducking, normalised to each delivery channel. It is the authoritative render path — the bytes a media buyer ships.

The pure, single-clip loudnorm render already exists (`server/utils/audio/render.ts`, shipped in Audio Studio P3). SP1 adds the genuinely new piece: a **timeline → ffmpeg filtergraph** compiler that mixes N clips across M tracks with declarative ducking, producing **one full-quality master**, which then feeds the existing per-channel loudnorm pass unchanged.

### Scope of SP1

**In scope:**
- A pure, dual-importable filtergraph builder (`server/utils/audio/timelineFiltergraph.ts`) — timeline JSON → ffmpeg filtergraph string + input list. The TDD core.
- A `timeline-render` job type on the existing `audio-jobs` Worker, fed by a **new dedicated `timeline-render` Cloudflare Queue**.
- Container execution: fetch clip sources from R2 → build+run the filtergraph → master WAV → reuse `render.ts` 2-pass loudnorm per requested channel → upload variants.
- Worker consumption of `media_render_jobs`: status lifecycle (`queued→rendering→done/failed`), `variants` write, `cost_cents` capture, `error` capture.
- Two thin agency endpoints: enqueue a render, read render-job status.
- Render-request versioning: snapshot the current draft into a new immutable `media_timelines` version (SP0 §6) and render that frozen version.

**Explicitly out of scope (later slices):**
- Editor UI, Web Audio engine, the clock, `OfflineAudioContext` Tier-1 preview (SP2).
- Render-status UX / indicator, per-track lock/mute enforcement (SP3).
- Model selector / governance (SP4).
- Per-tenant billing/credits/caps and the pre-generation cost estimate (SP6) — SP1 only **captures** `cost_cents`; it does not price, meter, or gate on it.
- Video / `'av'` paths.

---

## 2. Foundation this builds on (verified in the codebase, 2026-06-02)

- **`server/utils/audio/render.ts` — pure + unit-tested, single-clip only.** Exports `buildMeasurePassArgs`, `parseLoudnormJson`, `buildRenderPassArgs`, `buildVariantKey`. 2-pass loudnorm (measure → apply). **No `amix`/`adelay`/`sidechaincompress` today** — the timeline filtergraph is new. SP1 does **not** modify `render.ts`; it adds a sibling builder and chains the two (master → variants).
- **`server/utils/audio/profiles.ts`** — `AudioChannel = 'radio' | 'tiktok' | 'meta'`; `DEFAULT_PROFILES` (radio −24 LUFS wav full-length; tiktok −14 LUFS mp3 60s cap; meta −14 LUFS mp3 full); `profileFor(channel, overrides)`.
- **The `audio-jobs` Worker** (`workers/audio-jobs/`): `src/index.ts` exports `RenderContainer extends Container` and a single `default { async queue(batch: MessageBatch<MusicJobBody>, env) }` consumer (currently `music-gen`), `src/db.ts` (Hyperdrive→Neon), `src/renderVariants.ts`, `src/musicWorker.ts`. A CF Worker's one `queue()` handler receives **all** configured queues; you branch on `batch.queue`. So the "new dedicated queue" = a new consumer entry in `wrangler.toml` + a `batch.queue === 'timeline-render'` branch in the existing handler — not a second worker.
- **`workers/audio-jobs/container/render.mjs`** — the Node port of `render.ts`'s ffmpeg "math" (kept in sync by convention). SP1's filtergraph builder ports into the container the **same way** (see §6 — sync risk is a carried item).
- **`media_render_jobs`** (SP0 migration 160) already has every column SP1 needs: `timeline_id`, `project_id`, `channels TEXT[]`, `status` CHECK(`queued|rendering|done|failed`), `variants JSONB`, `cost_cents INTEGER NULL`, `error`, `requested_by`. **No new migration is required for SP1.**
- **Known infra gotchas (Audio Studio memory):** CF Pages can't declare `queues.consumers` in `wrangler.toml` — the *producer* binding is set on the dashboard Pages project, the *consumer* on the worker; a Direct-Upload `dist/wrangler.json` can override dashboard bindings (set the producer binding via the deployed config, verify post-deploy). Server-side R2 in Nitro needs the `FetchHttpHandler` workaround — but SP1's R2 writes happen in the **Worker/Container**, not Nitro, so that specific trap doesn't apply to the render path.

---

## 3. The pure filtergraph builder (where TDD lives)

A single module `server/utils/audio/timelineFiltergraph.ts` — **pure, no I/O, dual-importable** by Nitro (`~~/server/utils/...`) and the worker (relative import, like `render.ts`). It consumes the SP0 `TimelineState` (imported from `timelineSchema.ts`) and emits an ffmpeg invocation plan. It performs **no** file access; the caller (Container) resolves `r2_key`s to local input paths and passes a resolver map.

### Exported shape

```ts
import type { TimelineState, Clip, Track, DuckingRule } from './timelineSchema'

export interface FiltergraphInput {
  /** ffmpeg -i input, in stable order; index = position in this array. */
  localPath: string
  clipId: string
}

export interface FiltergraphPlan {
  inputs: FiltergraphInput[]   // → one `-i <localPath>` each, in order
  filterComplex: string        // the full -filter_complex graph
  outLabel: string             // final mixed stream label, e.g. '[mix]'
  sampleRate: number           // from state.sample_rate (mixdown target)
  durationSec: number          // computeDuration result (master length guard)
}

/** Pure: TimelineState (+ r2_key→localPath resolver) → ffmpeg master-render plan.
 *  Throws on a state that fails validateTimeline (caller validates first; this is defence-in-depth). */
export function buildTimelineFiltergraph(
  state: TimelineState,
  resolve: (clip: Clip) => string   // r2_key/clipId → already-downloaded local path
): FiltergraphPlan

/** Pure: assemble the full ffmpeg argv for the master mixdown (filter_complex + map + out WAV). */
export function buildMasterRenderArgs(plan: FiltergraphPlan, outputPath: string): string[]
```

### Mapping rules (timeline semantics → ffmpeg)

Per **clip** (input `[i]`), in order:
1. `atrim=start=<source_in_sec>:end=<source_out_sec>` (omit `end` when `source_out_sec` is null → play to source end), then `asetpts=PTS-STARTPTS` (reset timestamps after trim).
2. `adelay=<timeline_start_sec*1000>|<...all channels>` to position the clip on the timeline (gaps are implicit — silence before `adelay`).
3. `volume=<gain_db>dB` for clip gain (skip when 0).
4. `afade=t=in:st=0:d=<fade_in_sec>` and `afade=t=out:st=<clipPlayLen-fade_out_sec>:d=<fade_out_sec>` when non-zero. `fade_curve` maps to ffmpeg `curve=` (`linear`→`tri`/`lin`, `exp`→`exp`, `log`→`log`); exact curve token table pinned in tests.

Per **track**:
5. `amix` (or `amerge`+pan for >2; default `amix=inputs=N:normalize=0`) the track's clips into one track-bus stream; apply `volume=<track.gain_db>dB`. A `muted` track is **dropped from the mix entirely** (not silenced) — cheaper and identical output.

**Ducking** (declarative → `sidechaincompress`):
6. For each `DuckingRule`, the `target_track_id` bus is compressed keyed by the `source_track_id` bus: `sidechaincompress=threshold=<threshold_db>:ratio=<derived>:attack=<attack_ms>:release=<release_ms>` with make-down gain derived from `amount_db`. The source bus is `asplit` so it both triggers ducking and remains in the final mix. (Web Audio has no sidechain; SP2 will compile the *same* rule to scheduled gain ramps — see SP0 §4. SP1 owns the ffmpeg compilation; the rule is the single source of truth.)

Final:
7. `amix=inputs=<numTrackBuses>:normalize=0` all (post-duck) track buses → `[mix]`; output a full-quality master **WAV** at `state.sample_rate` (no loudnorm here — normalisation is the per-channel pass).

### Why a master-then-variants split
The master is rendered **once** (the expensive multi-clip mix). Each requested channel then runs the **existing** `render.ts` 2-pass loudnorm on that single master file — reusing tested code, getting correct per-channel LUFS/format/duration-cap, and avoiding re-mixing per channel. Mirrors the Audio Studio P3 "master → variants" shape and its "skip-if-master-exists, no re-bill" instinct.

All numeric edge cases (null `source_out_sec`, zero-length fade, single-clip track, muted track, no ducking, overlapping clips) are unit-tested against the exact argv — the same "verifiable ffmpeg math without real audio" approach `render.test.ts` already uses.

---

## 4. Pipeline / data flow

```
POST /agency/audio/projects/[id]/render   (Nitro, requireWriteAccess)
  │  body: { channels?: AudioChannel[] }  (default all three)
  ├─ load project + current draft timeline (SP0 gateway)
  ├─ validateTimeline(state) → 400 on failure (no enqueue)
  ├─ createVersion(...)  → snapshot draft into a new immutable version row (SP0 §6)
  ├─ INSERT media_render_jobs (timeline_id = frozen version, status='queued', channels)
  ├─ enqueue { jobId, projectId, timelineId, channels } → timeline-render Queue
  └─ 202 { job }                          (async; client polls status)

timeline-render Queue ──► audio-jobs Worker  queue(batch) {
  if (batch.queue === 'timeline-render') for each msg:
    ├─ UPDATE media_render_jobs SET status='rendering'
    ├─ load timeline state (Hyperdrive→Neon, by timelineId)
    ├─ download each clip r2_key → /tmp (RenderContainer)
    ├─ buildTimelineFiltergraph(state, resolve) → run ffmpeg → master.wav   (Container)
    ├─ for each channel: render.ts measure→apply loudnorm off master → variant file → upload R2
    ├─ UPDATE media_render_jobs SET status='done', variants=<channel→r2key>,
    │         cost_cents=<containerWallSec * RENDER_CENTS_PER_SEC>, updated_at=now()
    └─ on throw: UPDATE status='failed', error=<message>  (queue retry/backoff per config)
}

GET /agency/audio/projects/[id]/render-jobs   (Nitro, requireAuth) → recent jobs + status/variants
```

R2 keyspace: `media/<projectId>/<jobId>/master.wav` and `media/<projectId>/<jobId>/<channel>.<ext>`. `variants` stores channel→key; **no `audio_assets` rows** are created for render output (audio_assets stays the source-clip store; renders are job-owned derived artifacts).

---

## 5. Queue + worker + container wiring

- **New queue `timeline-render`**: producer binding on the dashboard Pages project (`TIMELINE_RENDER_QUEUE`), consumer entry in `workers/audio-jobs/wrangler.toml`. Branch on `batch.queue` in the existing `queue()` handler — do **not** fold render messages into `music-gen` (isolation of retry/timeout/failure; SP1 decision, see Q&A).
- **Message body** (`TimelineRenderJobBody`): `{ jobId: string; projectId: string; timelineId: string; channels: AudioChannel[] }` — mirrors the `music-gen` body shape so consumer wiring is familiar.
- **Container** (`RenderContainer`): a new entrypoint/subcommand in `container/render.mjs` (or a sibling `timelineRender.mjs`) that (a) downloads inputs, (b) ports `buildTimelineFiltergraph`/`buildMasterRenderArgs` (kept in sync with the TS source, per the existing render.mjs convention), (c) runs ffmpeg for the master, (d) runs the existing measure/apply passes per channel. The Worker invokes it and persists results.
- **Idempotency / retries:** the queue may redeliver. The worker treats a job already `done` as a no-op, and re-renders cleanly into the same `media/<projectId>/<jobId>/…` keyspace (overwrite-safe) on retry of a `rendering`/`failed` job.

---

## 6. Endpoints (thin) — `server/api/agency/audio/projects/`

| route | method | purpose |
|---|---|---|
| `[id]/render.post.ts` | POST | validate → snapshot version → insert job → enqueue; `202 { job }` |
| `[id]/render-jobs.get.ts` | GET | list this project's render jobs (status, channels, variants, cost_cents, error), newest-first |

Thin handlers: `requireWriteAccess` for the mutation, `requireAuth` for the read; integrity via the pure builder + SP0's `validateTimeline`; DB via SP0's gateway (extended with a small `createRenderJob` / `listRenderJobs` / `markRenderJob*` set in `server/utils/audio/projects.ts`, keeping it the sole gateway). Enqueue via the CF queue producer binding (abstracted so it's mockable in tests). `400` on invalid timeline; `404` on missing project; `409` if the project can't be rendered (e.g. no current timeline).

---

## 7. Tenancy / RBAC / cost

- Reads `requireAuth`, the render mutation `requireWriteAccess` (global write-block). No per-client `client_team_assignments` gating (agency staff manage all clients — Social Suite precedent, SP0 §7).
- `media_render_jobs.requested_by` stamped from the user; `project_id`/`client_id` carry tenant attribution for SP6.
- **`cost_cents` is captured, not enforced.** The worker computes `round(containerWallClockSeconds * RENDER_CENTS_PER_SEC)` (env constant, default conservative) and writes it on completion. This exercises the SP6 metering seam with real per-render data from day one; pricing, credits, caps, and the pre-generation estimate remain SP6. No caps or gating in SP1.

---

## 8. Migration & testing

- **Migration:** none. `media_render_jobs` (SP0 migration 160) already has every needed column including the `cost_cents` seam.
- **Testing (TDD, Vitest):**
  - **Pure builder (the core, no I/O):** clip mapping (atrim with/without `source_out_sec`, adelay offset, volume skip-on-0, both fades + curve token table), track amix + track-gain + muted-track-drop, ducking → `sidechaincompress` argv, final amix, master argv assembly. Exact-argv assertions (the `render.test.ts` style). Defence-in-depth: builder throws on a state that violates `validateTimeline`.
  - **Gateway additions:** `createRenderJob`/`listRenderJobs`/`markRenderJobRendering|Done|Failed` (mocked DB), incl. the version-snapshot-on-render flow.
  - **Endpoint tests (mocked util + auth + enqueue):** POST validates→snapshots→enqueues (asserts a new version row created, job inserted `queued`, queue producer called with the right body, `202`); POST 400 on invalid timeline (no enqueue, no version); GET returns job list.
  - **Worker consumer:** branch-on-`batch.queue`; status lifecycle transitions; `variants`/`cost_cents`/`error` writes; done-job no-op idempotency (mocked DB + R2 + container).
- **Container/TS sync:** a test (or a checked invariant) asserts `container/render.mjs`'s ported filtergraph matches the TS builder for a representative timeline — closing the known "keep render.mjs in sync" gap that exists for `render.ts` today.

---

## 9. Forward-compat

- The builder takes `TimelineState`; when `media_type` extends to `'av'` and `Track.kind` gains `'video'` (SP0 §10), video tracks are simply ignored by the audio filtergraph until the AV render path is added — no restructuring. `schema_version` gates any future contract bump; SP1 reads `migrateTimeline(state)` before building so it always operates on the current schema.
- `RENDER_CENTS_PER_SEC` and the per-channel `profiles.ts` targets remain env/config-tunable.

---

## 10. Risks / open items (carried, not blocking the SP1 plan)

- **`container/render.mjs` ↔ TS-source drift.** The render math is duplicated (TS for tests, MJS for the container) — already true for `render.ts`. SP1 widens the duplicated surface (the filtergraph). Mitigation: the §8 sync test; longer-term, bundling the TS into the container image to delete the copy (out of SP1 scope, noted for SP later).
- **ffmpeg curve/sidechain parameter fidelity.** The exact `afade` curve tokens and the `amount_db → sidechaincompress ratio/makeup` derivation are pinned in unit tests against documented ffmpeg behaviour, but should be **ear-verified once** on a real multi-track timeline before client-facing use (safe pre-SP6 since it's agency-internal).
- **Render duration / Container limits.** Multi-clip downloads + mix + N loudnorm passes could be long; the queue (durable, retried) is the right transport, but Container CPU/time limits should be checked against worst-case ad-length timelines during implementation.
- **`cost_cents` rate accuracy.** Wall-clock × flat rate is a first approximation; SP6 may refine to CPU-seconds or a model-aware figure. The seam (the column + a written value) is what matters now.
