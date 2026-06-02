# engagr AI Media Studio — Architecture Brief

**Status:** Draft for review — the generation + authoritative-render spine is already shipped (see §0); the timeline editor is the active build.
**Scope:** AI-generated music + voiceover (generation + single-clip render SHIPPED; timeline + multi-clip mixdown in build) → AI-generated video with synced audio (separate, forthcoming video brief)
**Stack:** Nuxt 4 / Vue 3 / TypeScript on Cloudflare (Workers, R2, Queues, Containers GA Apr 2026, Workers AI). **Primary datastore is Neon Postgres** (the app's DB, via `server/utils/db.ts`); D1/KV are available but not the default — see §4.
**Model roster verified against:** Cloudflare AI model catalog + live provider endpoints, this session. Roster is a moving target — see governance rule below; do not treat any model list here as durable.
**See also:** `engagr-ai-media-studio-competitive-patterns.md` (competitive UI/UX R&D + patterns we're adopting) and `engagr-ai-media-studio-oss-prior-art.md` (open-source we can depend on / borrow + the edge-case checklist).

---

## 0. Current baseline — what's already shipped

This brief is **not greenfield**. The Audio Studio (`/agency/audio`) already runs the generation + authoritative-render spine in production; the timeline editor is the main remaining Phase-1 work. Treat the plumbing below as a reusable foundation, not something to rebuild.

**Live today (verified end-to-end this session):**
- **Music** — `minimax/music-2.6` (Proxied) via the `audio-jobs` companion Worker consuming a `music-gen` Cloudflare Queue → master in R2. (A Pages-side queue consumer can't run — the Pages worker entry exports only `fetch`+`scheduled` — hence the standalone Worker.)
- **Voiceover** — `@cf/myshell-ai/melotts` (Hosted) → R2.
- **Authoritative render** — a `RenderContainer` (ffmpeg) bound to `audio-jobs` produces per-channel loudness-normalised variants (`profiles.ts`: social −14 / radio −24 LUFS) after the master. Flow: Queue → Worker → Container → R2 → Neon status row.
- **State/storage** — masters + variants in R2; asset rows + status in **Neon Postgres** (`audio_assets`).

**Not yet built (the brief's real scope):**
- **Editing layer (timeline)** — nothing exists; current UX is generate → library → download.
- **Multi-clip mixdown** — the container renders *one* clip per channel, not an arranged timeline (no `amix`/ducking).
- **Model-selector + governance picker** for audio capability buckets — models are currently hardcoded.
- **Browser preview** (Tier 1 `OfflineAudioContext`).

## 1. Purpose

Give engagr a single surface where a dealer (or ADME operator) can generate AI media, arrange it on a timeline, and export a finished ad asset. Audio-only first (music bed + voiceover for radio/social), video later (animated walkthrough/banner visuals with synced audio). The system must produce deterministic, platform-compliant deliverables across the multi-tenant dealer portfolio.

## 2. Core principle: three independent layers

The single most important design decision is to keep these separate. Each can be built, tested, and swapped without touching the others.

1. **Generation** — turns a prompt into a clip (music, voiceover, eventually video). Model-pluggable. Outputs land in R2.
2. **Editing** — the timeline. Operates only on clips (audio buffers / video tracks). Does not know or care which model produced them.
3. **Render** — turns the timeline state into a finished file. Two tiers: instant browser preview (non-authoritative) and a server mixdown (source of truth).

The timeline being model-agnostic is what lets the model roster churn freely without destabilising the editor.

## 3. Generation layer

### Model selector
A dropdown grouped by capability: **Music**, **Voiceover**, and (later) **Video**. Each entry carries its own invocation contract, because the catalog mixes three calling conventions:

- **Hosted** (`@cf/…`) — Cloudflare's own GPUs, lowest latency, clean `env.AI.run()`. For audio today this includes **`@cf/myshell-ai/melotts`** (the model voiceover uses now), the Deepgram Aura-2 TTS family, and Whisper (STT). Hosted models return their payload inline — note melotts returns **base64 audio in `{ audio }`**, not raw bytes or a stream, so decode it (this exact assumption caused a prod 503).
- **Proxied** (`vendor/model` — bare id, **no `@cf/` prefix**) — Cloudflare passes through to the vendor via AI Gateway and bills it through **Unified Billing prepaid credits** (not the Workers AI plan). The music model (`minimax/music-2.6`) and most TTS/video models are here. Response shape differs from Hosted (music returns `{ result: { audio: "<url>" } }` → fetch + re-upload to R2). **Operational gate:** with a $0 balance these fail-safe with `2021 Insufficient balance` — credits must be loaded (account-wide, AI Gateway → Unified Billing, prepaid + optional auto-top-up) before activation.
- **External** — Replicate (ACE-Step), ElevenLabs Music — `fetch` + poll + re-upload to R2. Needed only if the ownership/licensing thesis rules out proprietary models. (Re-upload uses R2 — mind the Workers-runtime R2 gotcha in §5.)

### Current candidates (verify before use)
- **Music:** `minimax/music-2.6` (Proxied, on-platform, lowest friction); ACE-Step via Replicate (Apache-2.0, only option that satisfies "owned for client ad redistribution"); ElevenLabs Music (proprietary, high quality, check redistribution terms).
- **Voiceover:** Deepgram Aura-2 (Hosted, low-latency default); Inworld `tts-2` and MiniMax `speech-2.8-hd` (expressive, emotion/steering — Proxied); OpenAI `tts-1-hd`, Google `gemini-3.1-flash-tts` (Proxied).
- **Video (later):** the catalog carries Veo 3.1, Seedance 2.0, Hailuo 2.3, Grok Imagine Video, Runway Gen-4.5, Vidu Q3, PixVerse v6 — all Proxied. **Note:** several emit *native synchronised audio* (Grok Imagine, Seedance 2.0, Veo). This interacts with the timeline mixdown — see §6.

### Governance (reuse existing pattern)
Music/voice/video plug into the existing allowlist + role-governance pattern as new capability buckets. The standing rule holds: **no model enters the picker on memory — it is verified against the provider's live endpoint before activation**, and each entry stores its invocation contract (Hosted / Proxied / External) so the orchestration Worker calls it correctly. Super-admin redaction, audit logging, and rollback apply as they do to the LLM roles.

Brand identity is itself a **governed, per-tenant object** — a **Brand Kit** (logo/colors/fonts + the dealer's VO voice persona + music bed + a pronunciation dictionary) that is admin-lockable and auto-applied. This is the same primitive that enforces OEM brand safety on the video side, scoped per-dealer on the existing RBAC + `client_team_assignments` model (competitors' brand locks are bypassable / workspace-global — *enforced* per-tenant scoping is our differentiator). And because owned, **ad-cleared-by-default** audio is the product thesis, surface clearance as a visible asset property — most music tools gate ad use behind an extra licence; we invert that. (See competitive-patterns doc.)

## 4. Editing layer — the timeline

### Reuse the GSAP timeline as the editor surface
The Banner Studio GSAP timeline is the right interaction layer and should be reused, not rebuilt. Concretely, these ship today and port well (file paths for the build):

- **`app/composables/useBannerTimeline.ts`** — master-timeline singleton, seek/scrub, loop in/out range. Reuse the structure; **re-wire the clock (caveat below)**.
- **`app/components/banner/Timeline.client.vue`** — transport (play/pause/restart), ruler + playhead, zoom (Ctrl+wheel), drag-to-seek, snap-to-grid, keyframe lanes (add/drag/delete), Shift multi-select, context menus. ~90% reusable as the editor shell.
- **Waveform rendering** (same file) — `AudioContext` decode → peak sampling → canvas bars. Reuse near as-is for clip waveforms (can complement/replace wavesurfer.js).
- **Real-time collab** — `workers/banner-rooms/src/BannerRoom.ts` + `app/composables/useBannerRealtime.ts`: hibernatable WebSocket room, per-entity **soft locks**, presence, stale-lock cleanup, reconnect/backoff. Rename layer→clip and add clip message types; ~95% reusable (no DOM coupling).
- **State pattern** — `app/composables/useBannerStudio.ts`: reactive singleton + dirty flag + **undo/redo stack**. Reuse the pattern; **replace the schema** (banner `sets/layers` → media `tracks/clips`; keyframes → gain/pan/fade envelopes).

> **Critical caveat — the clock runs the wrong way today.** Banner Studio is **rAF/poller-driven** (a ~20 fps poller updates `currentTime`; GSAP is effectively the master). The audio engine needs the **inverse** (see "the clock rule" below): `AudioContext.currentTime` is master and GSAP slaves to it. Reuse the timeline's *UI, interactions, state, collab, and waveform* — but **do not reuse the banner clock authority; invert it.**

**Reuse traps:** don't adopt the `Layer` type wholesale (audio needs gain/pan/effects, not x/y/opacity); don't carry the multi-format `sets` hierarchy (collapse to one `tracks[]`); the image-export/Browser-Rendering path is **not** for audio — reuse only its job/queue/ZIP/progress *pattern* (the Browser-Rendering capture itself becomes relevant for the Phase-2 video render).

For audio the timeline is complemented by **wavesurfer.js** (region UI) and Web Audio for the engine.

### The clock rule (non-negotiable)
GSAP's ticker is `requestAnimationFrame` — frame-quantised, refresh-rate-dependent, and it **stalls when the tab is backgrounded**. Audio needs sample accuracy and must run regardless of frame state. Therefore:

> **`AudioContext.currentTime` is the master clock. GSAP slaves to it.**

A lookahead scheduler fires `bufferSource.start(when)` against the audio clock sample-accurately; each rAF frame reads `audioContext.currentTime` and drives the GSAP playhead via `.seek()`/`.time()`. GSAP renders visuals + scrubber; Web Audio renders sound; both reference the one clock. Never invert this — inverting causes cumulative drift (VO sliding against the bed, late fades).

### Timeline state
Pure JSON: track order, clip R2 keys, start offsets, gains, fade curves, ducking params. Stored in **Neon Postgres** per tenant/project — the app's primary DB (same place `audio_assets` lives, reached via `server/utils/db.ts`), as a JSONB column. This JSON is the single input to both render tiers. (D1 was the original sketch; the app is Neon-native, so keep one datastore unless a concrete edge-locality need for D1 emerges — see §8.) **Forward-compat:** shape this table so it extends into the video brief's scenes→shots without a rewrite — carry a `schema_version` on the JSON and prefer additive columns — because the video timeline reuses this exact table.

### Editor UX baseline (from competitive R&D)
Concrete editor affordances to ship — rationale + sources in the competitive-patterns doc:
- **Transcript-driven VO editing** (Descript) — trim/fix voiceover by editing text, for non-editor account managers.
- **Per-track hide / lock / mute** lanes (CapCut) — keep a crowded VO + music + overlay timeline navigable; lock brand/legal lanes.
- **Auto-ducking with a duck-amount control** (CapCut) — the default mix affordance for VO-over-music (drives the render `sidechaincompress`).
- **Two takes per generation + per-segment history with audition/restore**, and free re-rolls when input is unchanged (Suno / ElevenLabs) — audition-and-pick as the default loop; also caps per-tenant generation cost.
- **Per-segment render/convert status indicator** (ElevenLabs) — at-a-glance "what still needs rendering."

## 5. Render layer

### Tier 1 — browser preview (non-authoritative)
`OfflineAudioContext` produces an instant in-browser mixdown for playback/scrubbing. **Never shipped as the final asset** — browser resamplers/encoders drift per machine and offer no loudness control.

### Tier 2 — authoritative mixdown (source of truth)
Cloudflare **Container running ffmpeg** (Containers GA Apr 2026, ffmpeg is Cloudflare's headline use case). **This already exists** as the `RenderContainer` bound to the `audio-jobs` Worker — today it loudness-normalises a *single* clip per channel (`profiles.ts`). The Phase-1b work is to extend it from single-clip to a **timeline filtergraph**: read timeline JSON + R2 keys and build `adelay` + `volume` + `afade` + `sidechaincompress` (ducking) + `amix`, then `loudnorm`/EBU R128 to the per-platform target (**confirm LUFS per platform — radio/Meta/TikTok/YouTube differ; starter targets already in `profiles.ts`**), writing final WAV/MP3/AAC to R2. Keep the command builder a **pure, unit-tested** function (mirrors the existing `render.ts`).

### Async wiring
Client saves timeline → Worker enqueues a render job (Cloudflare Queue) with project ID + R2 keys → Worker returns immediately → Container renders → writes to R2 → flips a **Neon** status row. This is the exact shape already running for music gen (`music-gen` queue → `audio-jobs` → `RenderContainer`), so the wiring is proven — a timeline render job type is the only addition. (Kent C. Dodds' Queue→Container→R2 ffmpeg writeup is a usable reference for structure.)

> **Runtime gotcha (learned in prod):** server-side R2 access via the AWS S3 SDK throws `[unenv] https.request is not implemented` in the Workers runtime. The S3 client must use `@smithy/fetch-http-handler` (`requestHandler: new FetchHttpHandler()`), or use the native R2 binding (`env.BUCKET.put/get`). Applies to any External-path re-upload and all mixdown I/O.

### Distribution / publishing handoff (reuse the Social Suite)
A finished asset isn't done until it's posted — and the platform already ships **video-capable publishing providers**: `server/utils/social-providers/` (YouTube Data API v3 resumable upload incl. Shorts; TikTok Content Posting API pull-from-URL; Facebook video/Reels; Instagram video/Reel/Stories; LinkedIn) behind a `registry`, with a `MediaItem { type: 'image' | 'video' }` + `PlatformCapabilities` (`maxVideoSizeMB`, `supportsReels/Stories`, `supportedMediaTypes`) contract and the existing scheduler. So the studio's last mile is **wiring, not new integrations**: render → R2 → hand the R2 key to the provider → scheduled multi-platform publish. This closed loop (generate → edit → render → scheduled multi-platform post) is a moat competitors charge separately for, and it's real in code today.

Contract the render layer must honour:
- **Emit per-platform variants** keyed to each provider's `PlatformCapabilities` — aspect ratio, duration cap, codec/bitrate, and **LUFS** (radio −24 / social −14). Don't post one master everywhere.
- **Delivery mode differs per provider** — TikTok/Instagram *pull from a public R2 URL*; YouTube does a *resumable upload*. The render produces the right file + R2 key; the provider handles transport.
- **Per-tenant OAuth activation gate** — like Meta today, each of YouTube/TikTok/LinkedIn is enabled per dealer via its OAuth connection (provider code exists; connection is the operational step).

## 6. Video extension (later phase — see the forthcoming dedicated video brief)

> Full detail for this phase moves to a separate **video brief** (in progress). The summary below is the bridge; once the video brief lands, treat it as authoritative and this section as a pointer.

Video makes this a proper AV timeline: **GSAP timeline for visuals + Web Audio graph for sound, both locked to the audio clock.** Coherent extension of Banner Studio, not a new product.

Two genuinely new problems gate this phase:

1. **Headless visual render.** ffmpeg cannot render GSAP DOM/canvas animation — it only exists in a browser. Server-side requires **headless-Chrome frame capture** (Puppeteer in a Container), driving the *seekable* GSAP timeline to an exact `time()` per frame, capturing at a fixed timestep, then ffmpeg to encode frames + muxed audio into MP4. Meaningfully heavier than audio mixdown — slower, more CPU, more failure modes. Remotion is the canonical reference for the render architecture (React not GSAP, so adapt the pattern, don't adopt the tool). The saving grace: a seekable GSAP timeline is render-friendly in a way real-time-only animation would not be.
2. **Native-audio video models.** When a video model emits its own synced audio (Grok Imagine, Seedance, Veo), decide per-asset whether that audio is kept, replaced by the timeline's VO/music, or mixed. The timeline needs a per-video-clip "use source audio / mute / duck" control, or the mixdown will double up.

## 7. Phasing

- **Phase 1a (SHIPPED):** Music + voiceover generation → R2 → Container/ffmpeg single-clip per-channel LUFS render via Queue. Live on the current stack (see §0).
- **Phase 1b (now):** Model-selector + governance picker for audio buckets; GSAP+Web Audio timeline editor; extend the existing Container to a multi-clip mixdown filtergraph (ducking/`amix`); `OfflineAudioContext` browser preview; timeline JSON in Neon.
- **Phase 2 (later — video brief):** Add a video track to the same timeline, native-audio handling, headless-Chrome render Container, MP4 mux. Phase 1 is reused; only the render Container and the visual track are new.

## 8. Open decisions / risks

- **Music ownership thesis.** Still unresolved: proprietary (MiniMax/ElevenLabs) vs Apache-2.0 (ACE-Step) for client ad redistribution. Phase 1 can ship with either; the dropdown abstracts it, but the licensing call is a business decision, not a technical one.
- **Container cost at volume.** Active-CPU billing is ideal for bursty renders (scale to zero between jobs). If portfolio-wide mixdown volume becomes steady/high, re-run the math against a dedicated box before committing.
- **Loudness targets.** Per-platform LUFS/R128 targets must be confirmed (radio vs Meta vs TikTok vs YouTube). Bake into the mixdown profile, not hardcoded.
- **Headless video render cost/latency.** Phase 2's biggest unknown. Prototype the frame-capture path early to get a real cost-per-second-of-video figure before scoping the feature.

## 9. Immediate next artefacts (pick order)

- **Neon** schema for timeline state + render-job status (the model allowlist plugs into the existing governance tables, not a new store)
- ffmpeg filtergraph builder (timeline JSON → command) — **pure + unit-tested**, mirroring the existing `render.ts`
- **Extend** the existing `audio-jobs` Container + Queue consumer for the timeline render job (Dockerfile / Wrangler binding / consumer already in place — add the job type, don't rebuild)
- Model-dropdown governance pane extension (audio capability buckets) on the existing allowlist pattern
