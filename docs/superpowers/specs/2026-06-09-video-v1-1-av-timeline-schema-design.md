# Video V1.1 — AV Timeline Schema (scenes→shots data model) design

**Status:** Draft for review — 2026-06-09
**Slice:** V1.1 of the Video V1 (Assembly) roadmap (`docs/engagr-ai-media-studio-video-v1-roadmap.md`).
**Goal:** extend the shipped Media Studio timeline contract so an **AV timeline** (video + overlay + audio tracks) validates, persists, and round-trips — with **zero regression** to shipped audio projects, and **no SQL migration**.
**Builds on (SP0):** `server/utils/audio/timelineSchema.ts` (pure Zod contract), `server/utils/audio/projects.ts` (gateway), `server/api/agency/audio/projects/**` (endpoints), tables `media_projects`/`media_timelines`/`media_render_jobs` (mig 160).

---

## 1. Key finding: no SQL migration needed

The timeline shape lives entirely in `media_timelines.state` **JSONB**. The SP0 schema already provides every hook V1.1 needs:
- `media_projects.media_type` already allows `'av'` (CHECK constraint).
- `media_timelines.schema_version` exists; `migrateTimeline()` already has an explicit "future video/rational-time bump" seam.
- `media_render_jobs` (`channels TEXT[]`, `variants JSONB`) is shape-agnostic.

So **V1.1 is a pure-contract + gateway change** (correcting the roadmap's "migration 173" assumption — there is none). Evolving a JSONB blob's shape is a `schema_version` bump + a `migrateTimeline` case, not DDL.

---

## 2. Design decision (the one fork to sanction)

**Flat multitrack extension, NOT a scenes→shots table structure — for V1.**

The video brief §4.2 envisions scenes→shots (storyboard grouping + transitions). For **V1 assembly**, a **flat multitrack model** (video lane(s) + overlay lane(s) + audio lanes, clips positioned on one timeline — the CapCut/Descript model) fully covers the requirement and is simpler. Transitions/storyboard are explicitly **V3**.

- **Recommendation:** extend the existing flat `tracks → clips` model with `video` and `overlay` track kinds; bump the AV timeline to `schema_version: 2`. A future `scenes[]` grouping is an **additive JSONB seam** (schema_version 2→3 + a migrate case — still no DDL) if V3 transitions need it.
- **Why:** sufficient for assembly, smallest surface, reuses the shipped audio editor's flat-lane mental model, and the JSONB design makes "grow into scenes later" genuinely cheap (the brief's migration-cost worry assumed columns; here it's a blob).

**Audio is untouched, not "migrated":** shipped audio projects stay `schema_version: 1 / media_type 'audio'`. New AV projects are created at `schema_version: 2 / media_type 'av'`. The contract supports **both**; `migrateTimeline` dispatches both. This guarantees zero risk to the shipped (dormant) audio render/editor.

---

## 3. The contract extension (`server/utils/audio/timelineSchema.ts`)

### 3.1 Clip becomes a discriminated union on `type`
- **`AudioClipSchema`** — the existing `ClipSchema` fields, **plus** `type: z.literal('audio').default('audio')`. Backward-compatible: v1 clips with no `type` read as `'audio'` (implementer handles the Zod default/preprocess so a missing discriminator still parses).
- **`VideoClipSchema`** (`type: 'video'`): `id`, `r2_key`, `asset_id` (nullable), `timeline_start_sec`, `source_in_sec`/`source_out_sec` (trim, footage only), `duration_sec` (explicit — no decode at contract level), `base_source: 'uploaded_footage' | 'still_kenburns'`, `kenburns` (nullable object: `{ zoom_from, zoom_to, pan_from:[x,y], pan_to:[x,y] }`, required when `base_source==='still_kenburns'`), `audio_mode: 'mute' | 'source' | 'duck_under_vo'` (default `'mute'` — the timeline owns the soundtrack in V1).
- **`OverlayClipSchema`** (`type: 'overlay'`): `id`, `timeline_start_sec`, `duration_sec`, `gsap_project_id` (string — references a Banner Studio project; FK validated at the endpoint layer, not here), `opacity` (default 1).

`ClipSchema = z.discriminatedUnion('type', [AudioClipSchema, VideoClipSchema, OverlayClipSchema])`.

### 3.2 Track kinds extend
`TrackSchema.kind` → `z.enum(['voiceover', 'music', 'sfx', 'video', 'overlay'])`. A track's clips must match its kind (audio kinds→audio clips, `video`→video clips, `overlay`→overlay clips) — enforced in `validateTimeline`, not Zod (keeps the union simple).

### 3.3 TimelineState v2 (superset; v1 unchanged)
- `schema_version: z.union([z.literal(1), z.literal(2)])`.
- `media_type: z.enum(['audio', 'av'])`.
- **v2-only canvas fields** (defaulted, ignored by v1 audio): `fps` (default 30), `width` (default 1080), `height` (default 1920).
- `tracks`, `ducking` as today (ducking still audio-only).
- **v1 audio state parses exactly as before** (new fields default; `media_type` literal still satisfied by `'audio'`).

### 3.4 Pure functions extend
- **`validateTimeline`** — add: track-kind↔clip-type agreement; video `still_kenburns` requires `kenburns`; `duration_sec > 0` for video/overlay; overlay `gsap_project_id` non-empty. Keep all existing audio checks.
- **`computeDuration`** — video/overlay clips contribute `timeline_start_sec + duration_sec` (footage may also clamp by trim); audio path unchanged.
- **`migrateTimeline`** — add `case 2: return state`. `case 1` stays identity. (No forced v1→v2 upgrade.)

---

## 4. Gateway delta (`server/utils/audio/projects.ts`)

Surgical — the gateway is otherwise media-type-agnostic:
- `CreateProjectInput` += `mediaType?: 'audio' | 'av'` (default `'audio'`).
- `createProject` INSERTs: use `input.mediaType` instead of the hardcoded `'audio'` (line 59), and the timeline `schema_version` from `input.initialState.schema_version` instead of the hardcoded `1` (line 64).
- Everything else (`saveDraftTimeline`, `createVersion`, `getProjectWithCurrentTimeline`, render-job fns, `computeDuration` calls) is already generic and needs no change.

---

## 5. Endpoint delta (`server/api/agency/audio/projects/**`)

- `index.post.ts` — accept `mediaType` + an AV `initialState`; pass `mediaType` to `createProject`. Validate with the extended `TimelineStateSchema.safeParse` + `validateTimeline` (already the pattern).
- A small pure helper `emptyAvTimeline()` (in `timelineSchema.ts` or a sibling) that seeds a v2 state with empty Video / Overlay / VO / Music lanes — so the create endpoint (and later the editor) can spin up a blank AV project.
- `timeline.put.ts`, `[id].get.ts`, `versions.*`, `render.post.ts` — no change; they round-trip `state` through the now-extended schema. (Reads `requireAuth`, mutations `requireWriteAccess`, draft-only-mutable §6 invariant — all preserved.)

> Naming: V1.1 keeps the endpoints under `agency/audio/projects` (the gateway is one media-studio boundary). A cosmetic move to `agency/media/projects` is deferred — not worth the churn now.

---

## 6. Scope

**In:** the §3 contract extension, §4 gateway delta, §5 endpoint delta, `emptyAvTimeline()` seed, full unit tests.

**Out (later slices):** render (V1.2), editor UI + asset upload (V1.3), export profiles (V1.4), the `scenes[]` grouping + transitions (V3 seam), FK-validating `gsap_project_id`/`r2_key` against real rows at the endpoint (light existence check can come with V1.3 when uploads exist), any model/generation field (V2).

---

## 7. Success criteria

- An AV `TimelineState` (a video track with a footage clip + a `still_kenburns` clip, an overlay track with a `gsap_composition` clip, plus VO/Music audio tracks) **validates** (`safeParse` ok + `validateTimeline` ok) and `computeDuration` returns the right length.
- `createProject({ mediaType: 'av', initialState })` persists a project with `media_type='av'` and a timeline at `schema_version=2`, and `getProjectWithCurrentTimeline` round-trips it.
- **Zero audio regression:** every existing audio timeline fixture still validates unchanged; existing audio project/gateway tests stay green; audio projects remain `schema_version 1 / media_type 'audio'`.
- `migrateTimeline` handles 1 and 2; throws on unknown.
- Typecheck: no new errors.

## 8. Tests (TDD, pure-first)

- `timelineSchema` units: AV state validates; track-kind↔clip-type mismatch rejected; `still_kenburns` without `kenburns` rejected; `computeDuration` over mixed video/overlay/audio; **existing audio fixture still parses identically**; `migrateTimeline` v1 & v2.
- gateway unit/integration: `createProject('av')` → `media_type='av'` + `schema_version=2`; round-trip via `getProjectWithCurrentTimeline`; an audio `createProject()` still writes `'audio'`/`1`.
- endpoint: `index.post` with `mediaType:'av'` + AV state → 201; with a malformed AV state → clean 400.

## 9. Files touched

- `server/utils/audio/timelineSchema.ts` (contract + pure fns + `emptyAvTimeline`)
- `server/utils/audio/projects.ts` (`CreateProjectInput.mediaType`, `createProject` INSERTs)
- `server/api/agency/audio/projects/index.post.ts` (accept `mediaType` + AV state)
- `app/types/index.ts` (extend `MediaProject`/timeline types if needed for the editor later — additive)
- Tests under `test/` (mirror existing audio timeline test locations)
