# Audio Studio — Owned Voiceover & Music Generation

**Status:** Design approved · **Date:** 2026-06-01 · **Owner:** paul@adme.net.au

## Summary

Add an **Audio Studio** capability to the XeroFlow Agency dashboard: generate
**owned, cross-channel-legal** voiceover and music as reusable, tenant-scoped
assets that feed directly into the existing Banner Studio audio layers and the
social publishing module.

The design ports the proven multi-tier audio pipeline architecture
(`docs/Architected multi-service audio pipeline with honest/`) onto our existing
Cloudflare stack (Workers AI, Queues, Durable Objects, R2). The strategic
thesis: **TikTok's Commercial Music Library is TikTok-only and Meta's Sound
Collection is FB/IG-only — neither travels. One owned track runs on radio +
TikTok + Meta with no clearance and no takedown risk.**

## Goals

- Generate owned voiceover (TTS) and music as durable, reusable audio assets.
- Make those assets consumable in surfaces that already exist (Banner Studio
  audio layer `src`, social publishing) with zero changes to those engines.
- Tenant-aware engine from day one so the same core later powers a client-portal
  self-serve surface.
- Legally-aware by design: an artist-mimicry guard prevents briefs that imitate
  a named copyrighted artist (Meta bans AI audio that does this).

## Non-goals (v1)

- Client-portal self-serve UI (architected for, not built in v1 — internal-first).
- Full enterprise governance (cost caps, quotas, per-tenant rate limits) — gated
  to the portal phase; see Enterprise Readiness.
- Real-time collaborative audio editing.

## Context — what already exists

- **`server/utils/aiVoice.ts`** — TTS (MeloTTS `@cf/myshell-ai/melotts`) + STT
  (Whisper) via Workers AI. Returns mp3 bytes inline; **does not persist to R2**.
  Kept as-is; wrapped by `voiceGen.ts`.
- **Banner Studio audio layers** (`app/components/banner/inspector/Audio.vue`,
  `layers/Audio.client.vue`) — support `src`, volume, mute, loop. `src` is an
  uploaded file today; there is no way to *generate* owned audio. This is the gap.
- **Infra in production:** R2 (`server/utils/storage.ts`), Queues
  (`server/utils/queue.ts`, `JOBS_QUEUE`), Durable Objects (chat/board/banner
  rooms), companion-Worker pattern (`social-dispatch-cron`, `meta-status-cron`).
- **Source reference:** `docs/Architected multi-service audio pipeline with
  honest/` — README + job worker (`index.ts`) + render service (`service.ts`) +
  `music-prompt-guard.ts` + `profiles.ts` / `render.ts`.

## Chosen approach — Asset-library spine, phased vertical slices

Build a small Audio Studio engine whose core is an *owned-audio asset* (a DB
table + R2 layout + the guard), built once and reused by every tier. Each phase
ships independently. The render tier (the only new infra) is integrated **last**,
behind everything already working.

**Approaches considered and rejected:**
- *Infrastructure-first* (build the full spine with a stub model before any UI):
  front-loads the riskiest piece (render infra) and ships nothing usable until
  the end.
- *Inline Banner Studio extension* (a "Generate VO" button calling `aiVoice.ts`):
  smallest, but builds none of the tenant-aware asset engine the portal needs and
  leaves music/render nowhere to live. Useful only as a throwaway spike.

## Architecture

### Module layout

```
server/utils/audio/
  assets.ts          # owned-audio asset CRUD (tenant-scoped) — the SPINE
  voiceGen.ts        # TTS → R2 asset (wraps aiVoice.ts, adds persistence)
  musicGuard.ts      # artist-mimicry guard (port of music-prompt-guard.ts)
  musicJob.ts        # queue payload + DO-status proxy helpers (Phase 2)
  profiles.ts        # per-channel LUFS/container profiles (Phase 3)
server/api/agency/audio/
  assets/index.get.ts              # list/browse library (filter by client, kind)
  voiceover.post.ts                # Phase 1: synchronous VO generation
  stream/[...key].get.ts           # Phase 1: authenticated R2 stream (scoped)
  music/generate.post.ts           # Phase 2: enqueue music job (422 on guard)
  music/status/[id].get.ts         # Phase 2: poll job status (proxies DO)
  internal/render-complete.post.ts # Phase 3: render callback (x-render-secret)
app/components/audio/              # AudioStudioPanel, AssetLibrary, VoiceoverForm, MusicForm
app/composables/useAudioStudio.ts
```

Plus two **companion Workers** (existing pattern): `audio-jobs` (queue consumer +
owns `MusicJob` DO, Phase 2) and the render service (Phase 3).

### Boundary decisions

- **`assets.ts` is the sole gateway** to the `audio_assets` table and R2 keys.
  Voice, music, and render tiers all route through it — so the future portal
  surface reuses it untouched.
- **`aiVoice.ts` stays as-is** (returns bytes); `voiceGen.ts` wraps it to persist.
  The existing voice-chat feature is not forked.
- **Banner Studio integration is read-only consumption:** its audio-layer `src`
  picker gains an "Audio Studio" tab listing `ready` assets and drops the stream
  URL into the existing `src`. Zero changes to the banner engine.

### Data model

Migration `144` (asset spine), `145` (jobs, when Phase 2 lands).

**`audio_assets`** — the reusable owned-audio object:
- `id`, tenant/org scoping, `client_id` (nullable — tag to a client), `created_by`
- `kind` (`voiceover` | `music`)
- `status` — `ready` for VO; `queued → processing → rendering → done | failed`
  for music
- `prompt` / `text`, `voice` / `lang`, `r2_key_master`,
  `variants` JSONB (`{ radio, tiktok, meta }` → R2 keys), `duration_sec`, `error`,
  `idempotency_key` (unique), `cost_cents` (per-generation log)
- timestamps. Indexed on `(client_id, kind, status)`.

**R2 layout:** `audio/<tenant>/<assetId>/master.<ext>` and
`.../<channel>.<ext>`. Served only via the authenticated
`stream/[...key].get.ts` route — never a public bucket.

## Data flow by phase

### Phase 1 — Voiceover (synchronous, current stack, no new infra)

```
UI (VoiceoverForm) ──POST /api/agency/audio/voiceover──┐
   { text, voice/lang, clientId, channels[] }          │
                                                        ▼
  requireAuth + requireWriteAccess + client scope check
  guard (musicGuard advisory on VO — strips impersonation)
  voiceGen.ts → aiVoice.textToSpeech() → mp3 bytes
  assets.ts → R2 put master + INSERT audio_assets(status='ready')
                          ◄── 200 { assetId, streamUrl }┘
  Banner Studio audio picker lists ready assets → drops streamUrl into src
```

Synchronous because TTS is fast (source doc's TTS-is-sync principle). No queue,
no DO.

### Phase 2 — Music generation (async)

```
POST /api/agency/audio/music/generate
  guard.assertClean(brief) → 422 if mimics named artist   ← hard gate
  assets.ts INSERT(status='queued') + DO seed
  MUSIC_QUEUE.send({ assetId, tenantId, channels, params, idempotencyKey })
  → 202 { assetId }

audio-jobs Worker (queue consumer, owns MusicJob DO):
  status='processing' → AI.run(music model) → R2 put master → status='rendering'
  → POST render service (Phase 3)
  [Phase 2 in isolation: stops at status='done' on the master]

GET /api/agency/audio/music/status/[id] → proxies the DO (poll; WS optional later)
```

The DO is the single source of truth for live job state; `audio_assets` is the
durable record. The status route proxies the DO so the UI polls one stable
endpoint.

### Phase 3 — Render tier (FFmpeg, only new infra — integrated last)

```
audio-jobs hands master → render service (host TBD, x-render-secret)
render: pull master from R2 → FFmpeg loop/trim/fade + 2-pass loudnorm per channel
        → push variants to R2 → POST /api/agency/audio/internal/render-complete
callback: verify x-render-secret → assets.ts UPDATE(variants JSONB, status='done')
```

**Render host:** deferred to a benchmarking spike at the start of this phase —
Cloudflare Containers (stay all-CF, bound to a Worker) vs a Sydney VPS. Decided
with real audio to benchmark throughput/concurrency.

**Channel profiles (`profiles.ts`):** radio / tiktok / meta LUFS + container
targets — **not hardcoded**. Radio = the network's delivered spec (do not assume
-23); social -14 a sane default, confirm against current TikTok/Meta behaviour.

### API surface

| Route | Phase | Auth | Notes |
|---|---|---|---|
| `voiceover.post` | 1 | staff write | sync |
| `assets/index.get` | 1 | staff read | library browse, client filter |
| `stream/[...key].get` | 1 | scoped | R2 stream, never public |
| `music/generate.post` | 2 | staff write | 422 on guard |
| `music/status/[id].get` | 2 | scoped | DO proxy |
| `internal/render-complete.post` | 3 | `x-render-secret` | RBAC-exempt internal |

## Cross-cutting concerns (every phase)

- **Guard (`musicGuard.ts`).** Port of `music-prompt-guard.ts`: regex + blocklist
  first, AI backstop second (advisory — never *clears* a clean result, only
  flags). Blocklist lives in **KV** (`CACHE`), not inline, so it is maintainable
  without a deploy. Hard 422 on music; advisory strip on VO.
- **Multi-tenancy.** All access flows through `assets.ts` with a tenant/client
  scope on every call; the streaming route enforces the same scope (no IDOR —
  reuse the `client_team_assignments` scoping pattern from the tracking fix).
- **Error handling.** Job tier: `msg.retry()` on transient failure, route to
  `music-gen-dlq` after max attempts, DO flips `failed` with the error surfaced
  to the UI. Render-callback failures post `status:'failed'`. Graceful
  degradation: AI binding null → `voiceGen` returns null, UI shows "audio
  unavailable" (matches `aiVoice.ts` today).
- **Testing.** Vitest units for `musicGuard` (impersonation strings, clean
  briefs, edge cases), `assets.ts` (scope enforcement, R2 key shape), `profiles`
  (LUFS targets). Integration: voiceover round-trip with a mocked AI binding.
  Render math validated against real audio in the Phase 3 spike.

## Enterprise readiness — phased by surface

Internal v1 gets the *correctness* essentials; heavier governance is gated to the
portal phase where the abuse/cost surface actually opens. The foundation needs
**zero rework** to climb the curve — the asset spine, AI Gateway, and idempotency
are in from the start.

| Concern | Internal (Phase 1–2) | Portal phase | Rationale |
|---|---|---|---|
| **AI Gateway** in front of every `AI.run` | from day one | (same) | Per-tenant cost telemetry + caching; source doc flags it |
| **Idempotency key** on jobs + render callback | from day one | (same) | Correctness — prevents double-generate / double-charge on retry |
| **Cost visibility** (`cost_cents` per generation) | basic log | → **budget caps + quota** | Internal = bounded; portal clients can run up unbounded bills |
| **Rate limiting** | staff trust, light | → per-tenant (`tracking/rate-limit.ts`) | Abuse surface opens only with self-serve |
| **Observability** (DLQ alarm, job-failure + LUFS-out-of-spec alerts) | DLQ alarm | → full dashboard | Operate it, don't just deploy it |
| **Data lifecycle** (retention, R2 growth, client right-to-deletion) | deletion endpoint | → automated retention | Privacy/GDPR mandatory once client-facing |
| **Model verification** (music IDs, LUFS targets) | before Phase 2 ships | (same) | Never put unverified inference in front of paying clients |

**Idempotency mechanism:** the `idempotency_key` in the queue payload maps to a
unique constraint on `audio_assets` (or a KV `processed:<key>` marker the
consumer checks first) — a redelivered message no-ops instead of regenerating.
The render callback carries the same key so a duplicate callback is ignored.

## Verification flags (from the source doc — must confirm before relying)

- **Model strings + I/O.** `@cf/deepgram/aura-2-en` is solid; `@cf/myshell-ai/melotts`
  is in use today. Music model IDs (MiniMax / Inworld) are **placeholders** —
  confirm exact IDs and whether each returns bytes or a URL before Phase 2.
- **FFmpeg render numbers.** Render logic is untested skeleton — run real audio
  through it and confirm measured loudness lands on target.
- **LUFS targets.** Radio = the network's delivered spec; social -14 a default to
  confirm against current platform behaviour.

## Deploy order (per phase)

- **Phase 1:** ships with the main Nuxt app — migration `144`, no new infra.
- **Phase 2:** `wrangler queues create music-gen` (+ `music-gen-dlq`); deploy
  `audio-jobs` Worker first (defines the `MusicJob` DO bound by `script_name`);
  migration `145`.
- **Phase 3:** deploy render service (host from the spike); set `RENDER_SECRET`
  on both the app and `audio-jobs`; set `RENDER_SERVICE_URL` on `audio-jobs`.

## Open questions

- Music model selection (MiniMax vs Inworld vs self-hosted ACE-Step) — resolve in
  the Phase 2 research spike.
- Render host (Cloudflare Containers vs VPS) — resolve in the Phase 3 spike.
- Exact LUFS targets per channel — confirm against current network specs.
