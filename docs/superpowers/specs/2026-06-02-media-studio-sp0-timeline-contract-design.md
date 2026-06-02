# Media Studio — Sub-project 0: Timeline JSON Contract + Neon Schema

**Status:** Approved design — ready for implementation planning
**Date:** 2026-06-02
**Phase:** Audio Media Studio, Phase 1b, Sub-project 0 (the data foundation)
**Parent briefs:** `docs/engagr-ai-media-studio-brief.md` (§4 timeline state, §9 next artefacts), `docs/engagr-ai-media-studio-oss-prior-art.md` (§3 OTIO data model), `docs/engagr-ai-media-studio-competitive-patterns.md` (§1 versioning/audit, §5 ducking/lanes)

---

## 1. Why this slice exists

Phase 1b (the audio timeline editor) is too large for one spec. It decomposes into:

- **SP0 — Timeline JSON contract + Neon schema** *(this doc)* — the data foundation everything hinges on.
- **SP1 — Render spine** — pure ffmpeg filtergraph builder (timeline JSON → `adelay`/`volume`/`afade`/`sidechaincompress`/`amix`) + a `timeline-render` job type on the existing `audio-jobs` Worker/Container. Consumes SP0's contract.
- **SP2 — Editor engine core** — Web Audio engine, the inverted clock (`AudioContext.currentTime` master, GSAP slaved), lookahead scheduler, `OfflineAudioContext` Tier-1 preview, minimal arrange/save UI. Produces SP0's contract.
- **SP3 — Editor affordances** — per-track hide/lock/mute, auto-ducking duck-amount control, transcript-driven VO editing, per-segment history/2-takes, render-status indicator.
- **SP4 — Model selector + governance** *(parallel)* — audio capability-bucket picker, per-model invocation contracts, live-endpoint verification, audit/redaction/rollback.
- **SP5 — Hygiene track (deferred)** — Brand Kit, folders/versioning, ad-cleared badge.
- **SP6 — Client-portal marketplace surface + per-tenant entitlement + cost metering/caps + billing tie-in** *(launch-gating for any client-facing release)* — the enterprise-defining slice. Exposes the studio to dealers via the existing client portal (`requireClientAuth`, tenant-scoped to `client.clientId`, Social-Suite portal precedent), behind a per-client plugin entitlement, with **per-tenant cost metering + pre-generation estimate + hard caps**. See §12.

Build order: `0 → 1 → 2 → 3`, with `4` parallel after `0`, `5` deferred. **SP6 gates client-facing launch** and is not required for the agency-internal tool, but its load-bearing decisions (tenant scoping, cost attribution) are honoured from SP0 onward so it lands additively, not as a rewrite.

**The timeline JSON is the contract between the editing layer (SP2) and the render layer (SP1).** Designing it first — and co-designing it against SP1's filtergraph needs (its first real consumer) — is what lets the model roster and the editor churn freely without destabilising each other. Getting tenancy, versioning, audit, and a video-forward-compat path wrong here is the most expensive retrofit in the whole phase, so they are baked in from day one.

### Scope of SP0

**In scope:**
- 3 Neon tables + an idempotent migration (`160_media_timelines.sql`).
- The Zod timeline contract (`server/utils/audio/timelineSchema.ts`) — pure, importable by both Nitro and the `audio-jobs` Worker, the single source of truth.
- Pure, unit-tested helpers: `validateTimeline`, `computeDuration`, `migrateTimeline`.
- Thin agency CRUD endpoints for projects + timeline versions.

**Explicitly out of scope (later slices):**
- ffmpeg / filtergraph construction (SP1).
- Render *enqueue + worker consumption* — the `media_render_jobs` table is created here because it is schema, but its endpoints and the Worker side that processes jobs belong to SP1.
- Editor UI, Web Audio engine, the clock (SP2).
- Model selector / governance picker (SP4).

---

## 2. Foundation this builds on (verified in the codebase, 2026-06-02)

- **Phase 1a is shipped and real.** `audio_assets` (migrations 149/150) is the per-clip asset store. Music: `music-gen` Cloudflare Queue → `audio-jobs` Worker → MiniMax → R2. Voiceover: melotts → R2. Render: a `RenderContainer` (ffmpeg, 2-pass loudnorm) produces per-channel variants. `server/utils/audio/render.ts` and `profiles.ts` are **pure + unit-tested** (radio −24 LUFS WAV; tiktok/meta −14 LUFS MP3).
- **`render.ts` is single-clip only today** — no `amix`/`adelay`/`sidechaincompress`. The timeline filtergraph (SP1) is genuinely new.
- **`audio_assets.variants` is `JSONB` channel→R2-key.** `media_render_jobs.variants` deliberately mirrors this so the Worker's status-flip/variant-write code is reusable in SP1.
- **The `audio-jobs` Worker** (`workers/audio-jobs/`) already has AI + R2 (`agency-files`) + Hyperdrive(→Neon) + a `music-gen` queue consumer + the `RenderContainer` binding. SP1 adds a job type; it does not rebuild the wiring.
- **Correction to the parent brief §3:** there is **no existing model-allowlist admin UI** — every model is hardcoded (`GROQ_MODELS`, `@cf/…` strings, the hardcoded music/voice models). The existing governance primitives are RBAC + env feature-flags (`CRM_AI_ENABLED`-style). SP4's picker is therefore more net-new than the brief implies. (Noted here for downstream planning; does not affect SP0.)

---

## 3. Entity model — 3 tables

Ownership chain: **Project → versioned Timeline → Render jobs.** Clips are `audio_assets` rows referenced by R2 key (provenance preserved), not duplicated.

### `media_projects` — tenant-scoped container
| column | type | notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `client_id` | UUID NULL | FK `agency_clients(id)` ON DELETE SET NULL — tenant scope |
| `created_by` | UUID NOT NULL | |
| `title` | TEXT NULL | |
| `media_type` | TEXT NOT NULL | CHECK (`'audio'`); forward-compat value `'av'` |
| `status` | TEXT NOT NULL DEFAULT `'draft'` | CHECK (`'draft','in_review','approved','archived'`) |
| `current_timeline_id` | UUID NULL | pointer to the active version row |
| `created_at` / `updated_at` | TIMESTAMPTZ | DEFAULT `now()` |

### `media_timelines` — versioned timeline state
| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID NOT NULL | FK `media_projects(id)` ON DELETE CASCADE |
| `version` | INTEGER NOT NULL | monotonic per project |
| `label` | TEXT NULL | e.g. `'v2 — shorter VO'` |
| `state` | JSONB NOT NULL | the TimelineState contract (§4) |
| `schema_version` | INTEGER NOT NULL DEFAULT 1 | |
| `created_by` | UUID NOT NULL | |
| `created_at` | TIMESTAMPTZ DEFAULT `now()` | |
| | | UNIQUE(`project_id`, `version`) |

"All prior versions remain accessible" = query by `project_id`. No separate history store.

### `media_render_jobs` — render status (created here, wired in SP1)
| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `timeline_id` | UUID NOT NULL | FK `media_timelines(id)` |
| `project_id` | UUID NOT NULL | denormalised for scoping/index |
| `channels` | TEXT[] NOT NULL DEFAULT `'{}'` | requested profiles (radio/tiktok/meta) |
| `status` | TEXT NOT NULL DEFAULT `'queued'` | CHECK (`'queued','rendering','done','failed'`) |
| `variants` | JSONB NOT NULL DEFAULT `'{}'::jsonb` | channel→R2 key (mirrors `audio_assets.variants`) |
| `cost_cents` | INTEGER NULL | render cost attribution — additive seam for SP6 per-tenant metering (mirrors `audio_assets.cost_cents`); written by the SP1 Worker, NULL until then |
| `error` | TEXT NULL | |
| `requested_by` | UUID NOT NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ DEFAULT `now()` | |

Indexes: `media_projects(client_id, status)`, `media_timelines(project_id, version DESC)`, `media_render_jobs(project_id, status)`, `media_render_jobs(timeline_id)`.

---

## 4. The JSON contract (`media_timelines.state`)

```ts
interface TimelineState {
  schema_version: 1               // gates the future rational-time upgrade
  media_type: 'audio'             // 'av' later — additive
  sample_rate: 48000              // target rate for the render mixdown
  duration_sec: number            // total length, computed on save (computeDuration)
  tracks: Track[]
  ducking: DuckingRule[]
}

interface Track {
  id: string                      // stable client-generated id (nanoid)
  name: string
  kind: 'voiceover' | 'music' | 'sfx'
  gain_db: number                 // default 0
  muted: boolean                  // default false
  locked: boolean                 // default false — lane control reserved for SP3
  hidden: boolean                 // default false — lane control reserved for SP3
  clips: Clip[]
}

interface Clip {
  id: string
  asset_id: string | null         // provenance FK → audio_assets; null = uploaded/external
  r2_key: string                  // source bytes in R2
  timeline_start_sec: number      // OTIO timeline-range start (>= 0)
  source_in_sec: number           // OTIO source-range start / trim head (default 0)
  source_out_sec: number | null   // source-range end / trim tail; null = play to end
  gain_db: number                 // default 0
  fade_in_sec: number             // default 0
  fade_out_sec: number            // default 0
  fade_curve: 'linear' | 'exp' | 'log'   // default 'linear'
}

interface DuckingRule {
  id: string
  source_track_id: string         // trigger track (typically VO)
  target_track_id: string         // ducked bus (typically music)
  amount_db: number               // attenuation, e.g. -12
  attack_ms: number               // default 50
  release_ms: number              // default 300
  threshold_db: number            // sidechain threshold, default -30
}
```

### Design notes
- **Time model:** float seconds (double precision). At ad lengths (<5 min) doubles carry no practical drift; playback sample-accuracy is a *runtime* concern handled by SP2's audio clock; ffmpeg consumes seconds natively (`adelay`/`atrim`/`afade`). `schema_version` + additive JSONB migration is the clean path to OTIO rational time *if and when* video frame-alignment needs it. We keep OTIO **concepts** (source-range vs timeline-range, media refs, implicit gaps) without the rational-time machinery now.
- **Ducking is declarative, not materialized.** One source of truth: the render tier (SP1) compiles each rule to ffmpeg `sidechaincompress`; the preview engine (SP2) compiles it to scheduled `gain.setTargetAtTime` ramps at the source track's clip boundaries (Web Audio has no sidechain node — see OSS prior-art §1). This directly backs the "duck-amount control" UX (SP3).
- **Gaps are implicit:** clips are absolutely positioned via `timeline_start_sec`; the space between two clips is a gap. No explicit gap object.
- **Provenance:** `asset_id` ties a clip back to its `audio_assets` row (which model produced it, cost, prompt) for the audit/"prove it wasn't hallucinated" trail; `r2_key` is the actual bytes the render reads.

---

## 5. Validation & the pure core (where TDD lives)

A single module `server/utils/audio/timelineSchema.ts` — **pure, no I/O, importable by both Nitro (`~~/server/utils/...`) and the `audio-jobs` Worker** (relative import, the way `renderVariants.ts` already imports `profiles.ts`). It is the single source of truth for the contract.

Exports (all pure, all unit-tested):
- `TimelineStateSchema` (Zod) + inferred `TimelineState` / `Track` / `Clip` / `DuckingRule` types.
- `validateTimeline(state): { ok: true } | { ok: false; errors: string[] }` — referential + semantic integrity beyond Zod's structural check:
  - every `DuckingRule.source_track_id` / `target_track_id` references an existing track;
  - `source_track_id !== target_track_id`;
  - for every clip: `timeline_start_sec >= 0`, `source_in_sec >= 0`, and if `source_out_sec != null` then `source_out_sec > source_in_sec`;
  - track ids and clip ids are unique within their scope.
- `computeDuration(state): number` — `max(timeline_start_sec + clipPlayLength)` across all clips, where `clipPlayLength = (source_out_sec ?? sourceDuration) - source_in_sec` (when `source_out_sec` is null and source duration is unknown at contract level, the caller supplies it; `computeDuration` operates on the resolvable subset and is documented as a lower bound until SP2 supplies decoded durations).
- `migrateTimeline(state): TimelineState` — `schema_version` upgrade dispatcher. Identity for v1; the explicit seam for the video/rational-time upgrade.

The Zod schema applies defaults (gain 0, fades 0, `fade_curve:'linear'`, lane flags false) so partial documents from the editor normalize on parse.

---

## 6. Versioning policy

- The **highest-version row** of a project is the **mutable draft**: while `project.status = 'draft'`, autosave overwrites `state` in place on that row.
- A new immutable version row is created on **duplicate-to-version**, on a **render request** (SP1), or on transition to `in_review`.
- **Autosave granularity:** the editor (SP2) debounces (~1–2 s) and `PUT`s the **whole `TimelineState`** to the draft row — atomic, simple, matches Banner Studio's dirty-flag pattern; ad-length JSON is a few KB. (No row-per-keystroke.) Concurrent-edit safety comes later via SP2's collab soft-locks.

This gives VEED-style `v1/v2/v3` history and ElevenLabs-style "all prior exports remain accessible" without history-table bloat.

---

## 7. Tenancy / RBAC

- All endpoints `requireAuth(event)`; mutations additionally pass the global write-block (`requireWriteAccess` semantics via existing middleware).
- `client_id` is stamped on the project for tenant attribution and later client-portal visibility.
- Per the Social Suite precedent (recorded project convention: agency staff manage **all** clients; bare `requireAuth` is the established pattern), there is **no per-client `client_team_assignments` gating** on these agency endpoints.
- `locked`-track enforcement is **reserved** in the schema now; the API-level guard that blocks mutating a locked track's clips lands in SP3.

---

## 8. Endpoints (thin) — `server/api/agency/audio/projects/`

| route | method | purpose |
|---|---|---|
| `index.get.ts` | GET | list projects (optional `?clientId=` filter) |
| `index.post.ts` | POST | create a project + its v1 `media_timelines` row; set `current_timeline_id` |
| `[id].get.ts` | GET | project + its current timeline (`state`) |
| `[id]/timeline.put.ts` | PUT | autosave: Zod-validate body, run `validateTimeline`, overwrite the draft row's `state` (+ recompute `duration_sec`) |
| `[id]/versions.post.ts` | POST | duplicate-to-version: snapshot current `state` into a new `version` row |
| `[id]/versions.get.ts` | GET | version history for a project |

Endpoints are thin: validation and integrity live in the pure module (§5); DB access via `server/utils/db.ts` (`queryRows`/`queryOne`/`execute`/`transaction`). `400` on Zod/`validateTimeline` failure with the error list; `createError({ statusCode })` on auth/not-found.

---

## 9. Migration & testing

- **Migration:** `server/database/migrations/160_media_timelines.sql` — idempotent `CREATE TABLE IF NOT EXISTS` for all 3 tables + indexes. Run against the DB as part of implementation per the project workflow (`psql "$DATABASE_URL" -f …`).
- **Testing (TDD, Vitest):**
  - Pure contract tests (no DB): valid documents parse + normalize defaults; malformed documents reject; `validateTimeline` catches each referential/semantic violation; `computeDuration` math; `migrateTimeline` v1 identity.
  - Thin endpoint tests: create→read round-trip, autosave validation rejection (400), duplicate-to-version increments `version` and preserves history.

---

## 10. Forward-compat to video (Phase 2)

The table shape does not change for video — JSONB absorbs the additions, gated by `schema_version`:
- `media_type` extends `'audio' → 'av'`.
- `Track.kind` extends to include `'video'`.
- `Clip` gains video fields additively (e.g. source-audio handling: `use_source_audio: 'keep' | 'mute' | 'duck'` — see parent brief §6) and visual transform fields.
- Scenes→shots can be modeled as a grouping layer added later without restructuring `tracks[]`.
- `migrateTimeline` is the upgrade seam; rational time (OTIO `{rate, value}`) is introduced at the schema bump that video requires, not before.

---

## 11. Risks / open items (carried, not blocking SP0)

- **`computeDuration` and `source_out_sec: null`** — true clip length needs the decoded source duration, which the contract layer doesn't have. SP2 supplies decoded durations from the audio engine; SP0's helper documents that a null `source_out_sec` yields a lower-bound duration until then. Not a blocker — the render (SP1) reads source length from the file directly.
- **SP4 governance is net-new** (see §2) — flag for the SP4 spec, not SP0.
- **LUFS targets** remain tunable (`profiles.ts`), per the parent brief §8.

---

## 12. Product direction — client-portal marketplace plugin (SP6, recorded 2026-06-02)

Decided this session: the Media Studio is intended to ship as a **client-portal marketplace plugin / subscription** — dealers self-serve generation/editing/render through the existing portal, behind a per-client entitlement. This elevates the target from "agency-internal tool" toward white-label SaaS. Implications captured so the near-term slices stay compatible:

- **Tenant isolation is the portal boundary.** No SP0 schema change — `media_projects.client_id` already scopes per tenant, and `requireClientAuth` (scoped to `client.clientId`, Social-Suite portal precedent) is the isolation gate. SP6 adds portal-facing read/write endpoints; SP0's agency endpoints are unaffected.
- **Per-tenant cost governance is promoted from deferred to launch-gating.** Coupling recurring revenue to real marginal AI cost (per-generation credits + Container CPU per render) means a flat "unlimited" subscription is an unbounded-cost trap. SP6 owns metered usage / credit bundles / hard caps + a pre-generation cost estimate. **Seam honoured now:** `audio_assets.cost_cents` (generation) already exists; SP0 adds `media_render_jobs.cost_cents` (render) so end-to-end per-tenant cost is attributable without a retrofit.
- **Licensing becomes a launch gate, not a someday-decision.** Once a dealer redistributes the audio directly, the unresolved owned-vs-proprietary music thesis (parent brief §8) blocks client-facing launch. Resolve before SP6 ships; does not block SP0–SP3 internal work.
- **Brand Kit enforcement + approval gates (SP3/SP5) stop being optional** — self-serve AI by non-experts needs guardrails before it's client-facing.

SP6's pricing/billing specifics (flat vs credits vs metered; Xero vs Stripe; entitlement schema) are deliberately deferred to its own spec → plan cycle.
