# audio-jobs Worker — deployment (operator)

Music generation runs here, not in the Pages app (the Pages worker entry exports
only `fetch` + `scheduled`, so a Pages-side queue consumer never fires and can't
reach AI/R2). This standalone Worker consumes the `music-gen` queue.

**Until these steps are done, the music tab returns 503 ("not enabled yet") — by
design.** Phase 1 voiceover and everything else are unaffected.

## One-time setup

1. **Create the queues:**
   ```bash
   wrangler queues create music-gen
   wrangler queues create music-gen-dlq
   ```

2. **Producer binding on the Pages app** (so the generate endpoint can enqueue):
   Workers & Pages → `agency-dashboard` → Settings → Bindings → add a **Queue
   producer** binding: variable `MUSIC_QUEUE` → queue `music-gen`. Redeploy Pages.

3. **Secrets / bindings on this Worker** (from `workers/audio-jobs/`):
   ```bash
   wrangler secret put DATABASE_URL     # same Neon connection string as Pages
   ```
   `AI`, `AUDIO_BUCKET` (R2 bucket `agency-files`), `HYPERDRIVE`, and the
   `music-gen` consumer + DLQ are declared in `wrangler.toml`. Confirm the
   Hyperdrive id matches the project's (shared with leads-delivery-worker).

4. **Deploy:**
   ```bash
   pnpm --dir workers/audio-jobs deploy
   ```

## ⚠️ Verify before relying (model placeholders)

- **`MUSIC_MODEL`** in `src/musicWorker.ts` (`@cf/minimax/music-2.6`) — confirm the
  exact `AI.run` string for the MiniMax music model in the CF dashboard / docs.
- **Response shape** — `extractAudioUrl()` probes common fields for the generated
  audio URL (MiniMax returns a URL, not bytes). Confirm the actual field and trim
  the probe list once known.
- **AI Gateway** — route the `AI` binding through AI Gateway for per-tenant cost
  telemetry (enterprise-readiness item from the design spec).

## Behaviour

- batch size 1 (each generation is a long AI call), `max_retries = 3`, then
  `music-gen-dlq`. On failure the `audio_assets` row is marked `failed` with the
  error; a redelivered message for a `done` asset no-ops (idempotent).
- The master is uploaded to R2 at `audio/<clientId|org>/<assetId>/master.<ext>`
  (matches the Pages presigner key shape); the row gets `status='done'` +
  `r2_key_master`, and the Pages status endpoint mints a playback URL.
