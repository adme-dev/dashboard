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

## Phase 3 — FFmpeg render container (RENDER)

The `RenderContainer` (`container/Dockerfile` — node + ffmpeg) renders per-channel
loudness-normalised variants. After the master uploads, if the asset has target
channels, the worker sets `status='rendering'`, invokes the container once per
channel (POST /render, master bytes + `x-audio-profile` header), uploads each
variant to `audio/<client|org>/<assetId>/<channel>.<ext>`, writes the
`{channel→key}` map to `audio_assets.variants`, and flips `status='done'`. The
Pages reads mint per-variant download URLs (`variantUrls`).

- **Deploy** builds + ships the container automatically — `wrangler deploy` (from
  `workers/audio-jobs/`) detects `[[containers]]` and builds `container/Dockerfile`
  (needs Docker available locally, or CF builds remotely). The `[[migrations]]`
  tag registers the `RenderContainer` Durable Object class.
- **Render-only retries are cheap**: if a master already exists, a retry skips the
  model call and only re-renders (no MiniMax re-bill).
- **LUFS profiles** (`server/utils/audio/profiles.ts`): social −14 / radio −24,
  −1 dBTP. ⚠️ Confirm the radio target against the **delivering network's spec**
  (overridable per call — no redeploy). The ffmpeg "math" is unit-tested in
  `server/utils/audio/render.ts`; `container/render.mjs` is its JS port — **keep
  the two in sync**. Validate measured loudness against real audio post-deploy.
- **Stateless container**: no R2/DB creds inside it — the worker owns persistence.
  `sleepAfter = 5m`, `max_instances = 3`.
