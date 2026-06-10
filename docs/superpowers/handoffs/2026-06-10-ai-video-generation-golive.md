# Handoff — AI Video Generation go-live (2026-06-10)

## Goal
Make AI video generation (image-to-video + text-to-video) actually work in **production**
(`app.xeroflow.io`), in the AV editor (`/agency/audio/projects/<id>`, e.g. project
`bfa93ac8-fc95-412c-bae4-81307cb7ede4`). User wants to upload a still, pick a model, Generate,
and get a finished clip in the Video Library.

## 🔴 THE ONE BLOCKER (start here)
**R2 uploads from the Pages app do not persist.** `server/utils/storage.ts::uploadFile` writes
via the AWS S3 SDK over `FetchHttpHandler`; in the Pages/workerd (and nuxt-dev/unenv) runtime the
`PutObject` returns HTTP 200 but **no object is written** (`UNSIGNED-PAYLOAD` means R2 won't reject
a missing body). Confirmed repeatedly: `video_gen_source_assets` rows exist with an `r2_key`, but
`wrangler r2 object get agency-files/<key>` → `The specified key does not exist`.

Consequence: i2v source images never reach R2 → the worker presigns a **dead** URL → Seedance
rejects it with `7003: User Input Error` (seen on a real job at 05:38Z). So generation cannot
succeed until uploads persist.

Note: standalone Node (`node scripts/r2-write-repro.mjs`) writes to R2 fine with the same creds —
so the creds/bucket/SDK are OK; it's the **serverless fetch handler + body** that fails.

### The fix (next session)
Switch `uploadFile` (and ideally all Pages R2 writes) to Cloudflare's **native R2 binding**
(`env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType } })`) — the reliable path the
audio worker already uses in prod. Steps:
1. Add an R2 binding to the **Pages** app. The main `wrangler.toml` has queue producers + `[ai]`
   but **no `[[r2_buckets]]`**. Add e.g. `[[r2_buckets]] binding = "MEDIA_BUCKET" bucket_name = "agency-files"`.
   ⚠️ Verify it actually reaches the deployed Pages runtime — bindings reach prod via the **dashboard
   Bindings tab** and/or wrangler.toml; `VIDEO_GENERATION_QUEUE` works (worker received messages) but
   `VIDEO_RENDER_QUEUE` reports "binding unavailable", so binding propagation is inconsistent — check
   the CF dashboard → Pages → agency-dashboard → Settings → **Bindings**.
2. `server/utils/email.ts` has `getCachedBinding(key)` but it only returns **strings**; R2 bindings
   are **objects**. Add a `getCachedObjectBinding(key)` (return `cachedCfBindings?.[key]`) and have
   `uploadFile` prefer the native binding (from `event` or the cache) and fall back to the S3 SDK for
   non-CF/standalone contexts.
3. A **write-verification** is already in `uploadFile` (HeadObject after PutObject, throws if absent) —
   it turns the silent failure into a loud `R2 write failed for <key>` error. Keep it; it's how the
   user/you will confirm the fix.

## ✅ What's DONE and DEPLOYED to prod this session (main, pushed to origin)
Commit chain (newest first): `bd2faa06` → `a2c86f24` → `50db2f22` → `b8fd956b` → `9fe38fee` →
`7dffa146` → `826465aa` → `2317f48b` → `638998d5` (+ earlier slices `4c95a5e6`…`784b0e3e`).

- **DB**: ran migration `175_video_generation_jobs.sql` (it had never been run — every jobs query
  500'd `relation "video_generation_jobs" does not exist`). 176 (source assets) was already run. All
  3 tables now present (jobs, sources, video_assets). Shared Neon DB = fixes local + prod.
- **Async transport** (`638998d5`): `aiGatewayProvider` reworked to CF's async batch API —
  `submit()` calls `run(cfModel, { requests:[inputs] }, { queueRequest:true, gateway:{metadata} })` →
  returns `request_id`; `poll()` calls `run(cfModel, { request_id })`. Worker leaves 'queued' jobs
  running; **reconcile cron** (now every **5 min** via `pages-cron`) polls to completion.
- **Worker DEPLOYED**: `video-generation.adme-dev.workers.dev` (version after `c4b025a0`), bindings
  AI + R2 `agency-files` (AUDIO_BUCKET) + Hyperdrive. Queues `video-generation` + `-dlq` exist,
  producer+consumer bound. Worker `~~/` import made relative (`2317f48b`) so wrangler bundles it.
- **Flags**: gate **decoupled** from `VIDEO_STUDIO_ENABLED` → gen needs only `VIDEO_GENERATION_ENABLED`
  (`b8fd956b`). Set `VIDEO_GENERATION_ENABLED=true` + `VIDEO_GENERATION_TEST_TENANT_ENABLED=true` as
  **dashboard Secrets** on the Pages project (NOTE: the dashboard only allows Secrets; plaintext vars
  are "managed through wrangler.toml"). The gate passing in prod (enqueue worked) means **secrets ARE
  readable via `process.env` in request handlers** (cfEnv's "secrets not in process.env" caveat is
  about event-less contexts only).
- **Frontend**: deploys from `.worktrees/deploy-prod` are built with
  `VIDEO_STUDIO_ENABLED=true VIDEO_GENERATION_ENABLED=true VIDEO_GENERATION_TEST_TENANT_ENABLED=true`
  exported, because `runtimeConfig.public.videoGenerationEnabled` is **baked at build time**.
- **Compliance fixes** (`9fe38fee`): `loadVideoGenerationSourceAssets` was querying the wrong table
  (`video_assets`) and hardcoding approved/vehicle → now reads `video_gen_source_assets`. Vehicle i2v
  no longer requires the asset to be self-tagged 'vehicle' (approval+ownership is the gate).
- **Models** (`a2c86f24`): hid `mock/i2v-safe` (returns fake `mock.local` URL → was the picker
  default → `download failed: 530`). Wired real CF models: **i2v** seedance-i2v, wan-i2v
  (`alibaba/wan-2.7-i2v`), hailuo-i2v (`minimax/hailuo-2.3-fast`), runway-i2v (`runwayml/gen-4.5`),
  vidu-i2v (`vidu/q3-pro`), pixverse-i2v (`pixverse/v5.6`); **t2v** veo-t2v (`google/veo-3.1-fast`),
  hailuo-t2v (`minimax/hailuo-2.3`). Test-tenant policy now allows ALL registered models.
- **Progress UI** (`a2c86f24` + crash fix `bd2faa06`): `app/components/media/MediaGenerationStatus.vue`
  floating card shows queued/running with live elapsed timer + spinner, and failures with the error.
  (Crash fix: `genJobs.jobs` is a nested ref — bind `genJobs.jobs.value`; component hardened.)
- **R2 CORS** (`7dffa146`): bucket had zero CORS → canvas/browser couldn't load stills. Added GET/HEAD
  for localhost + xeroflow.io + pages.dev (`scripts/r2-cors-agency-files.json`).
- **i2v source UX**: Generate panel can reuse an existing project still (`source-assets/from-asset`)
  or upload a new one. Marketing page live at `/features/ai-video-generation`.

## ⚠️ Other open items (after the upload blocker)
1. **Verify Seedance/CF input mapping live.** Once a source image actually persists, confirm the
   `{ requests:[{ prompt, image, duration, aspect_ratio, resolution }] }` + `queueRequest:true` shape
   is what each model expects (field names like `image` vs `image_url`, response `responses[0].result`
   video field). Watch `wrangler tail video-generation` during a real Generate. The `7003` so far was
   the dead image URL, not necessarily the field names — re-test after the upload fix.
2. **"Render video" fails**: `enqueue failed: VIDEO_RENDER_QUEUE binding unavailable`. Separate feature
   (media-studio composite render, not AI gen). The `VIDEO_RENDER_QUEUE` producer binding isn't in the
   Pages runtime though it's in `wrangler.toml` + dashboard. Same binding-propagation investigation as
   the R2 fix.
3. Per-client video policy: there's **no DB-backed tenant policy** — `loadTenantVideoGenerationPolicy`
   only returns the test-tenant policy (gated on `VIDEO_GENERATION_TEST_TENANT_ENABLED`) or disabled.
   Build a real policy table before broad rollout.
4. **Diagnostic to remove later**: `console.log('[uploadFile] R2 PutObject', …)` in storage.ts.

## How to deploy
From repo root, deploy from the **clean** worktree (never the main tree — it carries unrelated
uncommitted adspend WIP that must NOT be bundled):
```
cd .worktrees/deploy-prod && git checkout <commit> && pnpm install --frozen-lockfile
VIDEO_STUDIO_ENABLED=true VIDEO_GENERATION_ENABLED=true VIDEO_GENERATION_TEST_TENANT_ENABLED=true pnpm deploy:production
```
Worker: `cd workers/video-generation && npx wrangler deploy`. Migrations: `psql "$DATABASE_URL" -f …`.
Latest prod deploy this session: `6b483279` (then crash-fix `bd2faa06` deploying as of handoff).
Account `a5b299b3ad15c1b5b895dc66f9357b17`. 91 video-gen tests green. gh push uses the `adme-dev` account.

## Immediate next step
The user was about to test an upload on prod (the write-verification will say "R2 write failed" if
broken). Either way, implement the **native R2 binding** fix above — that's what unblocks the whole
feature. Then re-test Generate end-to-end with `wrangler tail video-generation` running.
