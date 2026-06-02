# audio-jobs Worker — deployment (operator)

Music generation runs here, not in the Pages app (the Pages worker entry exports
only `fetch` + `scheduled`, so a Pages-side queue consumer never fires and can't
reach AI/R2). This standalone Worker consumes the `music-gen` queue.

## Current state (2026-06-02)

The Worker is **DEPLOYED to production** and verified — only the Pages producer
binding remains (step 1 below). Done already:

- ✅ Queues `music-gen` + `music-gen-dlq` **created** (don't re-create).
- ✅ Worker **deployed** (`audio-jobs.adme-dev.workers.dev`) — `music-gen` consumer
  registered (`wrangler queues info music-gen` → Consumers: 1, `worker:audio-jobs`),
  `RenderContainer` (ffmpeg) image built + pushed, bindings AI + AUDIO_BUCKET
  (`agency-files`) + HYPERDRIVE (`900b4b74…`) + RENDER all bound.
- ✅ `DATABASE_URL` secret **set** (Hyperdrive is the primary DB path; this is the
  fallback — `src/db.ts` prefers `HYPERDRIVE.connectionString`).
- ✅ Model integration **verified** against the CF docs (see "Model" below).

**Until step 1 is done the music tab returns 503 ("not enabled yet") — by design.**
Phase 1 voiceover and everything else are unaffected.

## Remaining: activate the producer side (dashboard — cannot be done via CLI)

1. **Producer binding on the Pages app.** Workers & Pages → `agency-dashboard` →
   Settings → Bindings → **Production** environment → add a **Queue producer**
   binding: variable **`MUSIC_QUEUE`** (exact — `generate.post.ts` reads
   `event.context.cloudflare.env.MUSIC_QUEUE`) → queue `music-gen`. Then **redeploy
   Production** (a queue-producer binding only attaches on the next deployment).

   ⚠️ Pages keeps **Production and Preview bindings separate** — add it to
   **Production**. Verify it took: `wrangler queues info music-gen` should flip to
   **Producers: 1** (Pages producer bindings do increment this count — `leads-delivery-queue`,
   produced by the Pages app, shows producers ≥ 1). Then E2E: sign in →
   `/agency/audio` → Music tab → generate → asset goes `processing`. A 503 means the
   binding isn't on the live Production deployment yet.

## Re-deploying / first-deploying the Worker (gotchas — these cost ~6 attempts)

Run from the repo root. Use the repo's wrangler binary
(`node_modules/.bin/wrangler`). The build MUST happen **in-repo** — the Worker
imports `../../../server/utils/audio/{profiles,render}`, so an isolated copy
outside the tree fails to resolve them.

```bash
# 1. Install the Worker's own deps ONCE (they're not in the root workspace).
#    `--ignore-workspace` is required — a plain `pnpm --dir` gets absorbed by the
#    root project and never populates workers/audio-jobs/node_modules.
cd workers/audio-jobs && pnpm install --ignore-workspace && cd ../..

# 2. Move the Pages deploy-redirect aside for the deploy, then restore it.
#    Reason: the gitignored root .wrangler/deploy/config.json (a Pages build
#    artifact, {"configPath":"…dist/_worker.js/wrangler.json"}) collides with this
#    sub-Worker's wrangler.toml — "do not share the same base path". Passing `-c`
#    does NOT fix it; you must move the file. It self-regenerates on the next Pages build.
CFG=".wrangler/deploy/config.json"; WRANGLER="$(pwd)/node_modules/.bin/wrangler"
mv "$CFG" /tmp/wr-deploy-config.bak
( cd workers/audio-jobs && "$WRANGLER" deploy )
mv /tmp/wr-deploy-config.bak "$CFG"

# 3. Set the DB secret (Worker must exist first — secret put fails on a missing Worker).
mv "$CFG" /tmp/wr-deploy-config.bak
( cd workers/audio-jobs && grep '^DATABASE_URL=' ../../.env | cut -d= -f2- \
    | "$WRANGLER" secret put DATABASE_URL )
mv /tmp/wr-deploy-config.bak "$CFG"
```

**Docker build gotchas** (`wrangler deploy` builds `container/Dockerfile` locally):

- `lease does not exist: not found` on `load metadata for node:22-bookworm-slim` →
  cold buildkit. Fix: `docker pull node:22-bookworm-slim` first, then redeploy.
- `apt-get ... At least one invalid signature ... not signed` (exit 100) →
  **corrupt buildkit cache** (NOT clock skew — verify with `docker run --rm
  node:22-bookworm-slim date -u` vs host; they match). Fix: `docker builder prune -af`
  then redeploy.
- Needs the Docker daemon running locally (or CF builds remotely).

## Model (verified 2026-06-02)

- **`MUSIC_MODEL = '@cf/minimax/music-2.6'`** — confirmed the correct id per the CF
  catalog (developers.cloudflare.com/ai/models/minimax/music-2.6/).
- **Response shape** — the model returns JSON `{ result: { audio: "<URL>" }, state }`
  (a URL, not bytes). `extractAudioUrl()` probes `result.audio` AND `result.result.audio`,
  so it handles both the unwrapped and gateway-wrapped forms. The worker fetches that
  URL and re-uploads the bytes to R2.
- **Inputs** sent: `prompt`, `is_instrumental`, `format`, and `lyrics` (when present)
  — all match the schema. (`lyrics_optimizer` is omitted; it defaults to `false`.)
- **AI Gateway** — route the `AI` binding through AI Gateway for per-tenant cost
  telemetry (enterprise-readiness item from the design spec; not yet done).
- Optional hardening: the Worker got a public `workers.dev` URL by wrangler default
  but has no `fetch` handler (queue consumer only), so it's benign. Set
  `workers_dev = false` in `wrangler.toml` to remove it.

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
