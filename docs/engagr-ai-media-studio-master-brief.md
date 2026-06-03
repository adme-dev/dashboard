# engagr AI Media Studio — Master Brief (consolidated)

**Status:** Consolidated brief for review · 2026-06-03
**Purpose:** The single read-this-first overview of the engagr AI Media Studio program. It ties the detailed companion docs together and records the product decisions taken in the 2026-06-03 R&D session. Where this brief summarises, the companions are authoritative for depth:
- `engagr-ai-media-studio-brief.md` — **audio architecture** (clock rule, render spine, model governance, infra).
- `engagr-ai-media-studio-video-brief.md` — **video extension** (composite render, scenes→shots, §10 AI Presenter).
- `engagr-ai-media-studio-competitive-patterns.md` — **UI/UX patterns** to adopt/beat (editor, cost, brand kits).
- `engagr-ai-media-studio-oss-prior-art.md` — **OSS to depend on** + render/edge-case checklist.
- `engagr-ai-media-studio-presenter-RnD.md` — **license-first scan** of self-hostable avatar models.

**Standing rule (applies throughout):** no model/vendor enters the picker on memory — verified against its live endpoint and its *weights* license before activation. Audio is **ad-cleared by default**; vehicles are **never hallucinated**; real-person likenesses require **consent**.

---

## 1. North Star

Give engagr (dealers + ADME operators) **one surface to generate AI media, arrange it on a full multitrack timeline, and export a finished, platform-compliant ad** — then publish it straight into scheduled multi-platform distribution. Audio-first (live in prod), video next, an **AI presenter** as a first-class clip type. The system is **multi-tenant** (every dealer a governed sub-brand on shared infra) and **deterministic** (the same timeline JSON always renders the same asset).

**Decisions taken 2026-06-03 (this session):**

| Axis | Decision | Detail |
|---|---|---|
| **Editor** | **Full pro multitrack editor** (Descript/CapCut-class) | Timeline, audio+video+overlay tracks, slice/trim/move/snap, waveforms, transcript-edit, per-track lock/mute/hide. Not a light templated flow. |
| **Output target** | **HeyGen-class** presenter + video ads | HeyGen is the *quality bar*, not the engine. |
| **Generation engine** | **Own it** — model-pluggable, self-hostable, trainable | Rejected vendor-integrate on **cost + lock-in**. Avatar/lip-sync models run on Replicate/Fal (or own GPU later), **fronted by Cloudflare AI Gateway**. |
| **AI Presenter** | A **clip type on the timeline**, per-client | Real person *or* generic brand face (brand-kit asset); talking (lip-synced to VO) *or* non-speaking presence. |
| **Moat** | OEM-accurate (no hallucination) · ad-cleared audio · likeness consent · per-tenant cost caps · closed-loop publish | The things no competitor solves. |

---

## 2. What we're building (the product)

Three layers, one timeline:

1. **Generation** — prompt → clip (music, voiceover, video, presenter). Model-pluggable. Outputs land in R2. Does not care what's downstream.
2. **Editing — the pro multitrack timeline** (the surface the user lives in). Operates on clips: audio buffers, video tracks, GSAP overlay tracks, presenter clips. Slice/trim/move/snap, fades, ducking, waveforms, transcript-edit. Knows nothing about which model produced a clip.
3. **Render + Distribution** — timeline JSON → deterministic mixdown/composite → R2 → handed to the existing Social Suite providers for scheduled multi-platform publish.

The **AI Presenter** is not a separate tool: it is a clip type that sits on the timeline alongside video/music/VO and is sliced/positioned like any other clip.

---

## 3. Where it stands today (honest build state)

| Piece | State |
|---|---|
| **Audio generation** (music + voiceover → R2) | ✅ **Shipped to prod** (`/agency/audio`, Audio Studio) |
| **Timeline contract + Neon schema** (tracks/clips/trims/fades/ducking) | ✅ Merged (SP0, PR #107, mig 160) |
| **Render spine** (timeline → ffmpeg mixdown, Queue/Worker/Container) | ✅ Merged (SP1, PR #110) |
| **Real-time audio engine + read-only timeline playback** | 🔨 Built, in open PRs (#111 / #114) |
| **Editing UI** — slice/trim/move/snap, waveforms, transcript-edit, lock/mute | ❌ **Next slice (SP2c), not built.** Today you can *play* a timeline, not *edit* it. |
| **Model-selector / governance picker** | ❌ Not built |
| **Video** — AV timeline, generation, presenter, composite render | ❌ Unstarted (design only) |

**The hard, invisible parts are done** (the clock, scheduling, deterministic mixdown). The remaining audio work is the editing UI on top of a ready data layer; video grows the same spine.

---

## 4. Architecture (the spine)

### 4.1 The timeline (single source of truth)
Pure JSON in **Neon Postgres** per tenant/project (JSONB, via `server/utils/db.ts`): track order, clip R2 keys, start offsets, trims, gains, fade curves, ducking params. This JSON is the **single input to every render tier**. Carries a `schema_version`; **additive-only growth** so audio projects read as the degenerate "one scene, audio-only tracks" case and video scenes→shots extends without rewriting shipped projects. Model the time concepts on **OTIO** (source-range vs timeline-range, media refs, implicit gaps) to stay frame-rate-correct when video lands.

### 4.2 The clock rule (non-negotiable)
**`AudioContext.currentTime` is the master clock; GSAP and video playback slave to it.** A lookahead scheduler fires sample-accurate `start(when)` against the audio clock; each rAF frame reads the audio clock and drives the GSAP playhead/scrubber via `seek()`. Never invert this (inverting = cumulative drift: VO sliding under the bed, late fades). Banner Studio's clock is rAF-driven today and **must be inverted** when its overlay timeline is reused for video.

### 4.3 Model governance + Cloudflare AI Gateway (the front door)
Every model call routes through **Cloudflare AI Gateway** — the constant front door and pluggable-provider abstraction. It supports **Workers AI, Replicate, Fal** (23+ providers, OpenAI-compatible) and gives **per-request cost tracking + per-tenant metadata tagging, caching, rate-limiting, fallback, and Unified Billing** — but it **routes/observes only; it does not host or train models.** Three invocation contracts behind it:
- **Hosted** (`@cf/…`) — Workers AI GPUs, inline payloads (e.g. melotts returns base64 in `{audio}` — decode it).
- **Proxied** (`vendor/model`, no `@cf/`) — partner models via AI Gateway Unified Billing prepaid credits (music `minimax/music-2.6`; the video roster; a $0 balance fails-safe with `2021 Insufficient balance`).
- **External** — Replicate/Fal/own GPU endpoint fronted by AI Gateway (where self-hosted avatar models and, later, **own trained models** run).

A **governance picker** exposes capability buckets (Music / Voiceover / Video / **Avatar-Presenter**) on the existing allowlist + RBAC + audit-log + super-admin-redaction pattern. Each entry stores its invocation contract so the orchestration Worker calls it correctly.

### 4.4 Render tiers
- **Preview** — `OfflineAudioContext` (audio) / seekable GSAP (visuals) for instant in-browser scrubbing. **Never the final asset** (browser resamplers drift, no loudness control).
- **Authoritative audio render** — ffmpeg in a **CF Container** (`RenderContainer`, in prod): `adelay`+`volume`+`afade`+`sidechaincompress`(ducking)+`amix`, then EBU R128 `loudnorm` to per-platform LUFS. Pure, unit-tested filtergraph builder; the container is a thin synced port.
- **Video composite render** (Phase 2) — split by tool: **ffmpeg** composites baked video clips + audio bed; **headless Chrome** renders *only* the GSAP overlay layer to a transparent sequence; ffmpeg overlays + muxes to MP4 per platform profile. Scope the fragile/slow headless path to overlays only.

### 4.5 Infra conventions (already proven in prod)
**R2 → Queue → Worker → Container → Neon-status**, async, 202-immediately, heartbeat-renew the container timeout, HMAC-signed callbacks, retry-in-place (no local fallback), DLQ + idempotency (mandatory for dollar-per-clip video so a redelivery never re-bills). **Companion Workers, not Pages** (the Pages worker entry exports only `fetch`+`scheduled`, so a Pages-side queue consumer never fires — the `audio-jobs` Worker is the model). R2 inside Workers via the **native binding**; the AWS S3 SDK (+ `FetchHttpHandler`) is for the Pages app only.

---

## 5. The editor (full pro multitrack — the surface)

**Decision: full pro editor, Descript/CapCut-class.** The data layer (§4.1) already models multitrack/clips/trims/fades/ducking; the editor is the UI on top.

**UX (from competitive-patterns §5, adopt deliberately):**
- **Transcript / text-driven VO editing** (Descript) — account managers fix the AI voiceover by editing text, not scrubbing.
- **Per-track Hide / Lock / Mute** (CapCut) — keeps a crowded VO+music+video+overlay timeline navigable; protects brand/legal lanes.
- **Auto-ducking with a duck-amount control** (CapCut) — maps to `sidechaincompress` in render; the affordance that makes AI-music-under-AI-VO sound pro with zero keyframing.
- **Progressive-disclosure timeline** (Adobe Express) — collapsed "sceneline" ↔ full multitrack, with snap + auto-scroll. Serves quick-edit staff *and* power editors in one UI.
- **Chapter/segment with per-segment voice/style overrides** (ElevenLabs Studio) — drag-reorder; per-selection overrides that don't touch the whole project.
- **Slice / trim / move / snap + waveforms** (wavesurfer.js for UI/peaks/regions; keep our scheduler authoritative).

**Editor build sequencing (important):** build the editor **once, on audio first** — **SP2c** = slice/trim/move/snap + waveforms + transcript-edit + lock/mute on the audio timeline. It proves the entire editor pattern on the simpler audio-only case. *Then* grow it to AV (video + overlay lanes, scenes→shots). Do not build video lanes before audio editing works.

---

## 6. Generation layer

### 6.1 Audio (shipped)
Music (`minimax/music-2.6`, Proxied) + voiceover (melotts, Hosted) → master + per-channel LUFS variants in R2. Live in prod.

### 6.2 Video (Phase 2, Proxied roster — verify before use)
Veo 3.1, Seedance 2.0, Hailuo 2.3, Grok Imagine, Runway Gen-4.5, Vidu Q3, PixVerse v6. Dollars-per-clip, seconds-to-minutes latency → costed, queued, capped. Some emit native audio (Grok/Seedance/Veo) → reconcile per clip (use/mute/duck). **Default mute** generated clips (the timeline owns the soundtrack).

### 6.3 The AI Presenter (per-client spokesperson)
A governed **Brand-Kit asset**, two axes both selectable per client:
- **Identity:** real specific person (dealer principal, from approved photos/footage) **or** generic brand face.
- **Behaviour:** talking (lip-synced to the timeline VO) **or** non-speaking presence.
On the timeline it's a **clip type** (`presenter`) alongside `generated_clip | uploaded_footage | gsap_composition`.

### 6.4 Own-it engine strategy (from the presenter-RnD scan — the decisive findings)
**No HeyGen-grade, cleanly-licensed, self-hostable avatar model exists off-the-shelf today.** Every open option is non-commercial, closed/API-only, or *permissive-code-but-contaminated*. Two systemic traps govern everything:
- **InsightFace** — MIT code but **non-commercial weights**; silently bundled in LivePortrait/Ditto/JoyVASA/Hallo/LatentSync. A repo's "MIT" badge is routinely overridden by an NC `.onnx` it ships. **Swap it** → MediaPipe/BlazeFace or a clean YOLO-face (not SCRFD — that's InsightFace too).
- **Training-data provenance** — CelebV-HQ/VoxCeleb/HDTF are academic-only; shipping *or retraining on* them inherits the taint + unresolved likeness rights. A clean owned model needs a **clean dataset** (licensed footage / consented paid actors / dealer talent).

**The path (one front door, swap the engine behind AI Gateway):**
- **Stage 0 — ship now (weeks):** front a commercial avatar API (OmniHuman via Replicate / Hedra / HeyGen) **through AI Gateway**; own only the governance wrapper. A bridge — these aren't trainable.
- **Stage 1 — own lip-sync:** **MuseTalk** on Replicate/Fal behind AI Gateway — the only cleanly ship-able, real-time, **trainable** option (MIT + commercial weights + no InsightFace). Covers "presenter speaks, lip-synced to the Audio Studio VO."
- **Stage 2 — own the presenter:** **EchoMimicV2** (Apache, no InsightFace, audio→half-body+gestures = true presenter shape) or **Ditto/LivePortrait after the InsightFace swap**; trainable track via **Hallo2/AniPortrait**.
- **Stage 3 — train your own (the moat):** fine-tune a permissive base on a clean owned dataset → per-dealer presenter as a Brand-Kit-scoped model, deployed to a GPU endpoint, still fronted by AI Gateway.

---

## 7. Compliance & governance (the moat — none of the competitors solve these)

- **OEM no-hallucination (read twice).** Text-to-video of vehicles hallucinates badges/trim/proportions → a non-starter under ADME's OEM constraints (Toyota especially). **Policy, not guideline:** gate text-to-video of vehicle subjects; the safe path — **image-to-video from approved assets** (OEM/dealer photography, inventory-feed ingest) — is the path of least resistance in the UI.
- **Likeness consent (presenter).** Real-person presenters = approved assets only, never free text-to-person. Each carries a **consent record** (who/scope/expiry) on the Brand-Kit asset, enforced on RBAC + `client_team_assignments` + audit. Generic brand face sidesteps likeness consent.
- **Enforceable per-tenant Brand Kit.** Logo/colours/fonts + VO voice persona + music bed + caption style + pronunciation dictionary + **presenter asset**. Lockable + auto-applied; *enforced* per-tenant scoping is our differentiator (competitors' locks are bypassable/workspace-global).
- **Approval gate + provenance.** Editor→reviewer→admin approve before publish; every generation + prompt retained → OEM sign-off audit trail ("prove this vehicle wasn't hallucinated / this person consented").
- **Per-tenant cost caps.** The gap HeyGen leaves open: show "this render ≈ X credits ≈ $Y", a per-dealer balance, and an **enforced cap before enqueue** — implemented via AI-Gateway per-tenant metadata + a spend-check-before-enqueue gate.
- **Ad-cleared-by-default audio.** Surface "cleared for commercial/ad use" as a literal asset property (competitors gate ad use behind extra licences — we invert it).

---

## 8. Distribution (the closed loop)
Finished asset → R2 → handed to the existing **Social Suite providers** (`server/utils/social-providers/`: YouTube incl. Shorts, TikTok, Facebook/IG Reels+Stories, LinkedIn) with per-platform profiles (9:16 / 1:1 / 16:9, duration/codec caps, LUFS). The render emits **destination-correct variants**; the existing scheduler owns timing; per-tenant OAuth activates each platform. The last mile is **wiring, not new integrations** — and the generate→edit→render→scheduled-publish loop is a moat competitors charge separately for.

---

## 9. Cost & latency reality
- **Audio:** cents/clip — cheap.
- **Video generation:** dollars/clip, seconds-to-minutes — per-tenant spend caps mandatory; charge on commit not exploration; cheap-draft vs expensive-final tiers shown at the button.
- **Video render:** headless overlay capture is heavy (~900 frames for a 30s/30fps ad). **Prototype the headless-overlay render path first** to get a real cost-per-second figure before scoping the feature.
- **Own avatar models:** cost flips from per-clip opex to **GPU/ML capex + effort** — cheaper at volume, not free; the OSS quality gap vs HeyGen is real today and is what "train our own" closes. Accepted for control + unit economics + a trainable moat.

---

## 10. Roadmap (consolidated phasing)

- **Phase 1a — Audio generation.** ✅ Shipped (music + VO → R2 → render).
- **Phase 1b — Audio timeline editor.** 🔨 In progress. SP0 contract ✅ · SP1 render ✅ · SP2a/b engine+playback 🔨 (PRs open) · **SP2c editing (slice/trim/move/snap/waveforms/transcript-edit/lock-mute) = next** · model-selector/governance picker.
- **Phase 2 — Video + AV editor.** Grow the timeline to AV (video + GSAP overlay lanes, scenes→shots, composite render). **V1 assembly-no-generation** (uploaded footage + image-to-video of approved stills + overlays + audio — compliant by construction; **non-speaking presenter** lands here). **V2 generation-in-loop** (text-to-video b-roll, **talking presenter**, native-audio reconciliation, spend caps, compliance gating). **V3 scale** (transitions, per-OEM templated scene/presenter presets, portfolio batch).
- **Presenter engine track (parallel to Phase 2):** Stage 0 API-via-AI-Gateway → Stage 1 MuseTalk → Stage 2 de-InsightFace'd EchoMimicV2/Ditto → Stage 3 own trained model.

---

## 11. Open decisions / risks
- **Editor build is the largest single piece.** Mitigated by building it once on audio (SP2c) before AV.
- **Headless video-render cost** — the gating Phase-2 unknown; prototype before committing scope.
- **Own-avatar quality gap vs HeyGen today** — closed only by training on a clean dataset (data + GPU + ML effort).
- **Clean training dataset** — the real blocker for a shippable owned presenter model (licensed/consented footage). Sourcing it is a project in itself.
- **Compliance gating UX** — hard block vs soft warning on text-to-video of vehicles/people (recommend hard block); an ADME/OEM-policy call.
- **Music ownership thesis** — proprietary vs Apache-2.0 for client ad redistribution (a business decision; the picker abstracts it).
- **Vendor ToS for interim APIs** — likeness/reseller terms, per-tenant cost attribution, single-photo quality — verify before Stage 0.

---

*Consolidated 2026-06-03 from the four engagr Media Studio companion docs + the presenter-RnD scan + this session's product decisions. Companions remain authoritative for depth; this brief is the overview + decision record.*
