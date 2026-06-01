# Audio Studio — Phase 2 (Music Generation) Implementation Plan

**Date:** 2026-06-01 · **Branch:** `feat/audio-studio-phase2-music` (off merged main `12ab7bef`) · **Worktree:** `.worktrees/audio-studio-p1` (reused; own node_modules)

Builds on Phase 1 (shipped to prod). Design spec: `docs/superpowers/specs/2026-06-01-audio-studio-design.md`. This plan supersedes the spec's Phase 2 architecture where the **spike findings** below contradict it.

## Spike findings (resolve the spec's open questions)

1. **Model = `minimax/music-2.6`** (Cloudflare AI, partner model via AI Gateway). Inputs: `prompt`≤2000, `is_instrumental`, `lyrics`≤3500, `lyrics_optimizer`, `format` mp3/wav, `sample_rate`, `bitrate`. ⚠️ **Verify exact `AI.run` string at impl** — likely `@cf/minimax/music-2.6`. **Output is a URL** (MiniMax Aliyun OSS), NOT bytes.
2. **Licensing OK** — MiniMax paid/API terms: user retains all IP + commercial rights (non-exclusive grant-back to MiniMax; not *exclusive* ownership). ACE-Step (Apache 2.0, self-host GPU) is the documented fallback if exclusivity is ever required.
3. **Architecture correction — must use a dedicated companion Worker.** The Pages worker entry (`scripts/wrap-worker.mjs` dispatcher) exports only `fetch` + `scheduled`, **no `queue()` handler** → the in-Pages `cloudflare:queue` hook (`server/plugins/queue.ts`) never fires in prod, and AI/R2 bindings aren't reachable outside a request anyway (existing embed jobs guard `!event` and skip Workers AI in queue context). So:
   - **DROP** the spec's `MusicJob` Durable Object (unnecessary — DB row is the status SoT).
   - **DROP** reuse of `JOBS_QUEUE` (its consumer is effectively dead in prod).
   - **USE** a dedicated `audio-jobs` companion Worker with its own bindings, mirroring `workers/social-dispatch-cron` + `workers/leads-delivery-worker`.

## Architecture (corrected)

```
Pages (Nitro):
  POST /api/agency/audio/music/generate
    requireWriteAccess + Zod + musicGuard.assertClean(brief)  ← HARD 422 on artist mimicry
    assets.ts createMusicAsset(status='queued', is_instrumental, lyrics, format)
    MUSIC_QUEUE.send({ assetId, tenantId, prompt, is_instrumental, lyrics, format, idempotencyKey })  ← producer binding
    → 202 { assetId }
  GET /api/agency/audio/music/status/[id]
    requireWriteAccess + scope → reads audio_assets row → { status, streamUrl?, error? }

audio-jobs Worker (workers/audio-jobs, own wrangler.toml):
  bindings: AI, R2 (AUDIO bucket = same bucket as Pages), MUSIC_QUEUE (consumer), MUSIC_DLQ, DATABASE_URL (secret)
  queue(batch, env, ctx):
    for msg:
      idempotency: skip if asset already done (SELECT status)
      UPDATE status='processing'
      env.AI.run('@cf/minimax/music-2.6', {...}) → { audio: URL }
      fetch(URL) → bytes → env.<R2>.put(buildMasterKey) (REUSE Phase 1 R2 key shape)
      UPDATE status='done', r2_key_master, duration_sec, cost_cents
      on throw: msg.retry(); after max → DLQ; UPDATE status='failed', error
  (DB access via @neondatabase/serverless HTTP — separate worker, no Nitro db.ts; mirror leads-delivery-worker)

UI: /agency/audio gains a "Music" tab — MusicForm (brief + instrumental toggle + lyrics) → poll status → AssetLibrary already lists kind='music' rows (reuse).
Banner Studio: AssetsPanel "Audio Studio" section already lists ready assets → music with a master appears automatically (kind-agnostic). Verify filter includes music.
```

## Task breakdown (TDD; atomic commits)

1. **Migration 150** — `ALTER TABLE audio_assets ADD COLUMN IF NOT EXISTS is_instrumental BOOLEAN, lyrics TEXT, format TEXT`. Idempotent. Run against prod DB per CLAUDE.md.
2. **`assets.ts`** — add `createMusicAsset()` + `markProcessing/markDone/markFailed()` (all through the sole gateway). Unit tests for key shape + status transitions.
3. **`musicGuard.ts`** — already exists (Phase 1). Phase 2 wires it as a **hard 422 gate** (Phase 1 used it advisory on VO). Add tests for the assertClean-throws path.
4. **`server/api/agency/audio/music/generate.post.ts`** — Zod, guard hard-gate, createMusicAsset, enqueue to MUSIC_QUEUE producer, 202.
5. **`server/api/agency/audio/music/status/[id].get.ts`** — scoped read of the row.
6. **`workers/audio-jobs/`** — `wrangler.toml` + `src/index.ts` (queue consumer; AI→R2→DB). Mirror leads-delivery-worker structure. Vitest for the URL→R2→DB happy path with mocked AI/R2/fetch.
7. **UI** — `MusicForm.vue` (invoke frontend-design skill first), wire a Music tab into `/agency/audio` (UTabs: Voiceover | Music), poll status. Reuse `AssetLibrary`.
8. **Marketing sync** — features `[slug]` audio-studio entry: add a music section; features index copy; MarketingNav if needed.
9. **Verify** — vitest green, lint/type clean, two-stage review, then preview deploy.

## Operator steps (cannot be done from code — document, don't block)

- `wrangler queues create music-gen` + `wrangler queues create music-gen-dlq`
- Deploy `audio-jobs` Worker (`wrangler deploy` from `workers/audio-jobs`); set `DATABASE_URL` + `RENDER_SECRET`(later) secrets; bind R2 bucket (same as Pages), AI, MUSIC_QUEUE consumer + DLQ.
- On Pages: add `MUSIC_QUEUE` **producer** binding (dashboard).
- Confirm AI Gateway is in front of the AI binding for cost telemetry (enterprise-readiness item).

## Deferred (unchanged)

Phase 3 FFmpeg render tier (per-channel LUFS variants); enterprise governance (budget caps, quotas, rate limiting, retention) at the portal phase. Fast-follows: collapse status `done`/`ready`; set `idempotency_key` on create (now used for queue idempotency).
