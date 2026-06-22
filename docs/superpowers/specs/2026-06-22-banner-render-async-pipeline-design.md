# Design — Async banner MP4 render pipeline (#2a)

**Date:** 2026-06-22 · **Status:** design (awaiting review) · **Owner:** agent build
**Roadmap:** sub-project **#2a** of "build the other missing MCPs". Hard prerequisite for **#2b** (banner render over MCP).
Siblings: #1 read-coverage (built), #2b banner-MCP-tools (next, own spec), #3 financial writes (own spec, D4-gated).

## 1. Goal & context

Banner Studio's MP4 export (`server/api/agency/banner-studio/export-video.post.ts`) renders **synchronously inside the
HTTP request**: it launches Chromium, captures GSAP frames, and shells out to **`ffmpeg` via `child_process.spawn`**,
then uploads to R2 and returns a results array. On Cloudflare Pages (prod) `child_process`/`ffmpeg`/`fs` are Node-only
APIs the Workers runtime lacks, so the endpoint **almost certainly 503s in prod** (it explicitly throws 503 when the
`ffmpeg -version` check fails). It also can't serve an external AI host, which needs a non-blocking
`propose → confirm → poll` flow.

This sub-project replaces the synchronous MP4 path with an **async render pipeline** on the existing Media-Studio
render rails: enqueue a job, render in the `workers/audio-jobs/` container (which already runs Chromium + ffmpeg),
persist to R2, and poll for status. This **fixes the prod-broken in-app export** (standalone value) **and** lays the
foundation #2b builds on.

**Scope:** **MP4 video render only.** GIF export uses a pure-JS encoder (`gifenc`, no ffmpeg) and image export is a
single Chromium screenshot — neither is broken on prod, so both are **left untouched** (GIF async-ification is an
optional later optimisation, not a fix). **Non-goals:** the MCP banner tools (#2b), server-side HTML generation for MCP
(#2b's concern — #2a's job carries the client-supplied HTML), GIF/image changes, new permission groups.

## 2. Architecture

Mirrors the Media-Studio video-render spine (`VIDEO_RENDER_QUEUE` → `workers/audio-jobs/` `video-render` branch →
stateless `RenderContainer` → worker owns R2/DB):

```
POST /api/agency/banner-studio/export-video           (REFACTORED — enqueue, no longer renders)
  validate (reuse MAX_FORMATS/MAX_DIMENSION caps) →
  for each format:
    putSourceHtml → R2  banner-render-jobs/{jobId}/source.html   (HTML can exceed the 128KB queue-msg limit)
    INSERT banner_render_jobs (status='queued', dims/fps/crf, source_r2_key)
    enqueue {jobId} → BANNER_RENDER_QUEUE
  → 503 if BANNER_RENDER_QUEUE binding absent (mirrors music/video "not enabled yet")
  → return { jobIds: string[] }

workers/audio-jobs/  (NEW `banner-render` queue branch — container already has Chromium + ffmpeg)
  load job → mark 'rendering'
  fetch source.html from R2 → POST bytes + dims/fps/crf headers to container /render-banner
  container (STATELESS): Chromium captures GSAP frames at WxH → ffmpeg → returns MP4 bytes
  worker: upload MP4 → R2 (banner-videos/{projectId}/...) → INSERT banner_exports → mark 'done' (url,size,export_id)
  on error → mark 'failed' (error msg) + msg.retry({delaySeconds:30}); DLQ after max attempts

GET /api/agency/banner-studio/export-video/jobs?ids=a,b,c   (poll)
  → [{ jobId, formatKey, status, url?, fileSize?, error? }]

BannerExportModal.client.vue (mp4 path): enqueue → poll jobs → progress bar → download links;
  finished exports also appear in the existing /exports list, so the user can close the modal and return.
```

The container is **stateless** (no R2/DB creds) — exactly the audio `RenderContainer` contract: the Worker POSTs input
bytes + headers and gets output bytes back; the Worker owns all persistence.

## 3. Files

**Create**
- `server/database/migrations/190_banner_render_jobs.sql` — the job table (additive, `IF NOT EXISTS`).
- `server/utils/banner/renderJob.ts` — **pure, dependency-injected** enqueue + status-projection logic (the unit-tested
  core). Exposes `enqueueBannerRender(input, deps)` → `{ jobIds }` and `projectJobStatus(rows)` → status list.
- `server/api/agency/banner-studio/export-video/jobs.get.ts` — status-by-ids endpoint (`requireAuth`).
- `workers/audio-jobs/src/bannerRenderWorker.ts` — orchestration (load → fetch HTML → container → upload → mark),
  injected deps (`loadJob/markRendering/markDone/markFailed/getSourceHtml/renderOne`), unit-testable.
- `workers/audio-jobs/container/bannerCapture.mjs` — Chromium GSAP-frame capture + ffmpeg encode (port of today's
  `export-video.post.ts` capture loop; reuse `overlayCapture.mjs`'s Chromium approach + `videoProfiles` patterns).

**Modify**
- `server/api/agency/banner-studio/export-video.post.ts` — refactor from synchronous render to enqueue (returns
  `{ jobIds }`; 503 when the queue binding is absent). Keep the request/format validation.
- `workers/audio-jobs/src/index.ts` — add a `batch.queue === 'banner-render'` branch (mirrors the `video-render` branch).
- `workers/audio-jobs/container/server.mjs` — add a `/render-banner` route invoking `bannerCapture.mjs`.
- `wrangler.toml` — add the `BANNER_RENDER_QUEUE` producer binding (`queue = "banner-render"`).
- `app/components/banner/BannerExportModal.client.vue` — MP4 path: enqueue → poll → progress → links (GIF/image paths
  unchanged).

## 4. Data model — `banner_render_jobs` (migration 190)
Column types align with the existing `banner_exports` (mig 026): `project_id UUID REFERENCES banner_projects(id)`,
`format_key VARCHAR(50)`, `created_by UUID REFERENCES team_members(id)`.

| column | type | notes |
|---|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() | the jobId |
| `project_id` | UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE | banner-studio project |
| `format_key` | VARCHAR(50) NOT NULL | one job per (project, format) |
| `width`,`height` | INT NOT NULL | capped at MAX_DIMENSION (2000) |
| `fps`,`crf`,`quality` | INT NOT NULL | validated (fps 12–60, crf 0–51, quality 1–2) |
| `source_r2_key` | TEXT NOT NULL | the rendered source HTML in R2 |
| `status` | TEXT NOT NULL DEFAULT `'queued'` | `queued`→`rendering`→`done`\|`failed` |
| `r2_key`,`url` | TEXT NULL | output MP4 location/URL on success |
| `file_size` | BIGINT NULL | output bytes |
| `export_id` | UUID NULL REFERENCES banner_exports(id) ON DELETE SET NULL | the export row created on success |
| `error` | TEXT NULL | failure message |
| `created_by` | UUID NOT NULL REFERENCES team_members(id) | actor |
| `created_at`,`updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `started_at`,`finished_at` | TIMESTAMPTZ NULL | lifecycle timestamps |

Indexes: `idx_banner_render_jobs_project (project_id)`, `idx_banner_render_jobs_status (status)`. Whole migration is
additive with `IF NOT EXISTS` guards; applied to prod DB as part of the build (safe).

## 5. Job lifecycle & reliability
- `queued → rendering → done | failed`. One job per (project, format); **idempotent on jobId** (the worker re-marks
  rendering and re-renders safely; a `done` job is skipped).
- Reuse the existing caps: `MAX_FORMATS=10`, `MAX_DIMENSION=2000`, `MAX_FRAMES=600`, duration cap 30s.
- Per-job container timeout; on failure `markFailed` + `msg.retry({ delaySeconds: 30 })`; **dead-letter** `banner-render-dlq`
  after max attempts (mirrors video). Stuck-job visibility via `status` + `started_at`.

## 6. Live-behaviour change (the flagged risk)
The export modal's MP4 path changes from "await a results array" to "enqueue → poll → links". UX stays equivalent
(existing progress bar drives off poll percentage; downloads appear as today) **and** results persist to the existing
`/exports` list so the user can close the modal and come back. The old synchronous path is **removed** (it 503s on prod
anyway). GIF/image export paths are unchanged.

## 7. Security
The container renders **client-supplied HTML** in headless Chromium — this is the **same surface as today's** sync
endpoint (`page.setContent(fmt.html)`); no new risk. The container is sandboxed and stateless (no R2/DB creds, no
secrets); the Worker owns persistence. Enqueue requires `requireAuth` (Banner Studio is staff-only); jobs stamp
`created_by`. Status endpoint returns only the caller's render metadata (no HTML echoed back).

## 8. Testing
- **`renderJob.ts`** (pure, injected deps): enqueue creates N job rows + N R2 source writes + N queue messages and
  returns the jobIds; cap/validation rejects (too many formats, oversize dims); status projection maps rows →
  `{jobId,formatKey,status,url?,error?}`; missing-binding path surfaces a typed "disabled" outcome (endpoint → 503).
- **`bannerRenderWorker.ts`** (injected deps): happy path marks rendering→done with url/size and inserts the export;
  container/throw path marks failed and signals retry; a `done` job is skipped (idempotency).
- **Container `bannerCapture.mjs`**: parity/operator-verified-live (Chromium + ffmpeg can't run in vitest) — same posture
  as the video-render spine. Document a manual verify-live step.
- Full `test/ai/` + existing suites stay green; no regressions.

## 9. Activation (operator-gated; dormant until done)
1. `npx wrangler queues create banner-render` + `banner-render-dlq`.
2. Add the `BANNER_RENDER_QUEUE` producer binding (`wrangler.toml`, baked at deploy) + the consumer branch ships in
   `workers/audio-jobs/`; redeploy that Worker with the updated container image.
3. Migration 190 applied to prod DB.
Until the binding exists, the enqueue endpoint returns 503 (in-app MP4 export shows "not enabled yet") — no behaviour
regression vs the current prod 503.

## 10. Rollout
Build behind the natural gate (no queue binding → 503). Deploy from the clean `.worktrees/deploy-prod` worktree. The
container image change requires redeploying `workers/audio-jobs/`. After activation, verify-live one real MP4 render
(in-app), then #2b layers the MCP tools on top.
