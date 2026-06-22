# Async Banner MP4 Render Pipeline (#2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Banner Studio's prod-broken synchronous MP4 export with an async enqueue→container→poll render pipeline on the existing `workers/audio-jobs/` render rails.

**Architecture:** A refactored `export-video.post.ts` writes each format's HTML to R2, inserts a `banner_render_jobs` row, and enqueues to `BANNER_RENDER_QUEUE`. The `workers/audio-jobs/` consumer (which already runs a Chromium+ffmpeg container) renders each job and persists the MP4 to R2 + `banner_exports`. The modal polls a status endpoint. Pure logic lives in `renderJob.ts` (Pages) and `bannerRenderWorker.ts` (worker), both dependency-injected and unit-tested; the container `.mjs` and the modal are verify-live.

**Tech Stack:** Nuxt 4 / Nitro, Zod, Neon Postgres (`~~/server/utils/db`), Cloudflare R2 (`uploadFile`) + Queues + Containers, `@cloudflare/containers`, Vitest.

Spec: `docs/superpowers/specs/2026-06-22-banner-render-async-pipeline-design.md`.

## Global Constraints

- **Scope:** MP4 only. GIF (`export-gif`, pure-JS `gifenc`) and image (`export-image`, single screenshot) endpoints are **untouched**.
- **Caps (reuse current values):** `MAX_FORMATS=10`, `MAX_DIMENSION=2000`, `MAX_FRAMES=600`, duration cap 30s; fps clamp 12–60, crf clamp 0–51, quality ∈ {1,2}.
- **Migration 190**, additive with `IF NOT EXISTS` guards; column types align to `banner_exports` (mig 026): `project_id UUID REFERENCES banner_projects(id)`, `format_key VARCHAR(50)`, `created_by UUID REFERENCES team_members(id)`.
- **R2:** Pages writes via `uploadFile(buffer, key, contentType) → { url, size }` (bucket `agency-files`); the worker reads via `env.AUDIO_BUCKET.get(key)` and uploads output via the same bucket binding.
- **Enqueue:** resolve `event.context.cloudflare?.env?.BANNER_RENDER_QUEUE`; **absent → HTTP 503** ("MP4 export is not enabled yet"), matching music/video. Never throw raw.
- **Container is stateless** (no R2/DB creds): the worker POSTs HTML + render params and receives MP4 bytes; the worker owns all persistence. Mirror `workers/audio-jobs/src/videoCompositeContainer.ts`.
- **Server imports:** `~~/server/...`. Use Nitro global `$fetch` for internal routes; never raw `ofetch`.
- **Pure handlers never throw to callers** — return typed outcomes; the worker orchestrator rethrows AFTER `markFailed` so the queue branch can `msg.retry`.
- **Test commands:** Pages tests `npx vitest run test/<path>`; worker tests `npx vitest run test/banner/`. Apply the migration with the `DATABASE_URL` from `.env` (see CLAUDE.md migrations rule).

---

### Task 1: Migration 190 + pure `renderJob.ts` (enqueue + status projection)

**Files:**
- Create: `server/database/migrations/190_banner_render_jobs.sql`
- Create: `server/utils/banner/renderJob.ts`
- Test: `test/banner/renderJob.test.ts`

**Interfaces:**
- Produces:
  - `type BannerFormat = { key: string, html: string, width: number, height: number }`
  - `type BannerRenderInput = { projectId: string, formats: BannerFormat[], fps: number, quality: 1|2, crf: number, userId: string }`
  - `type BannerJobRow = { id: string, project_id: string, format_key: string, width: number, height: number, fps: number, crf: number, quality: number, source_r2_key: string, status: string, url: string|null, file_size: number|null, error: string|null }`
  - `type EnqueueDeps = { genId: () => string, putSourceHtml: (key: string, html: string) => Promise<void>, insertJob: (row: Omit<BannerJobRow,'status'|'url'|'file_size'|'error'>) => Promise<void>, sendQueue: (msg: { jobId: string }) => Promise<void> }`
  - `enqueueBannerRender(input, deps): Promise<{ jobIds: string[] }>` (throws `BannerRenderError` with `.code` on validation failure)
  - `projectJobStatus(rows: BannerJobRow[]): { jobId: string, formatKey: string, status: string, url: string|null, fileSize: number|null, error: string|null }[]`
  - `clampRenderParams(fps, crf, quality): { fps: number, crf: number, quality: 1|2 }`
  - `const CAPS = { MAX_FORMATS: 10, MAX_DIMENSION: 2000 }`

- [ ] **Step 1: Write the migration**

```sql
-- server/database/migrations/190_banner_render_jobs.sql
-- Async banner MP4 render jobs (#2a). Additive; safe to re-run.
CREATE TABLE IF NOT EXISTS banner_render_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  format_key    VARCHAR(50) NOT NULL,
  width         INT NOT NULL,
  height        INT NOT NULL,
  fps           INT NOT NULL,
  crf           INT NOT NULL,
  quality       INT NOT NULL,
  source_r2_key TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  r2_key        TEXT,
  url           TEXT,
  file_size     BIGINT,
  export_id     UUID REFERENCES banner_exports(id) ON DELETE SET NULL,
  error         TEXT,
  created_by    UUID NOT NULL REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_banner_render_jobs_project ON banner_render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_banner_render_jobs_status ON banner_render_jobs(status);
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/190_banner_render_jobs.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` (or no-ops if re-run).

- [ ] **Step 3: Write the failing test**

```ts
// test/banner/renderJob.test.ts
import { describe, it, expect, vi } from 'vitest'
import { enqueueBannerRender, projectJobStatus, clampRenderParams, BannerRenderError, type EnqueueDeps } from '~~/server/utils/banner/renderJob'

function deps(over: Partial<EnqueueDeps> = {}): EnqueueDeps {
  let n = 0
  return {
    genId: vi.fn(() => `job${n++}`),
    putSourceHtml: vi.fn().mockResolvedValue(undefined),
    insertJob: vi.fn().mockResolvedValue(undefined),
    sendQueue: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}
const fmt = (k: string) => ({ key: k, html: `<div>${k}</div>`, width: 300, height: 250 })

describe('clampRenderParams', () => {
  it('clamps fps/crf into range and coerces quality to 1|2', () => {
    expect(clampRenderParams(999, -5, 3)).toEqual({ fps: 60, crf: 0, quality: 2 })
    expect(clampRenderParams(1, 100, 0)).toEqual({ fps: 12, crf: 51, quality: 1 })
  })
})

describe('enqueueBannerRender', () => {
  it('creates one job per format: writes HTML to R2, inserts a row, enqueues a message', async () => {
    const d = deps()
    const res = await enqueueBannerRender({ projectId: 'p1', formats: [fmt('a'), fmt('b')], fps: 30, quality: 1, crf: 23, userId: 'u1' }, d)
    expect(res.jobIds).toEqual(['job0', 'job1'])
    expect(d.putSourceHtml).toHaveBeenCalledTimes(2)
    expect((d.putSourceHtml as any).mock.calls[0][0]).toBe('banner-render-jobs/job0/source.html')
    expect(d.insertJob).toHaveBeenCalledTimes(2)
    expect((d.insertJob as any).mock.calls[0][0]).toMatchObject({ id: 'job0', project_id: 'p1', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1, source_r2_key: 'banner-render-jobs/job0/source.html', created_by: 'u1' })
    expect(d.sendQueue).toHaveBeenCalledWith({ jobId: 'job1' })
  })

  it('rejects an empty or oversized formats array', async () => {
    await expect(enqueueBannerRender({ projectId: 'p1', formats: [], fps: 30, quality: 1, crf: 23, userId: 'u1' }, deps())).rejects.toMatchObject({ code: 'bad_request' })
    const many = Array.from({ length: 11 }, (_, i) => fmt(`f${i}`))
    await expect(enqueueBannerRender({ projectId: 'p1', formats: many, fps: 30, quality: 1, crf: 23, userId: 'u1' }, deps())).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('skips formats over the max dimension (no job created for them)', async () => {
    const d = deps()
    const res = await enqueueBannerRender({ projectId: 'p1', formats: [fmt('ok'), { key: 'big', html: '<i/>', width: 3000, height: 100 }], fps: 30, quality: 1, crf: 23, userId: 'u1' }, d)
    expect(res.jobIds).toHaveLength(1)
    expect(d.insertJob).toHaveBeenCalledTimes(1)
  })
})

describe('projectJobStatus', () => {
  it('maps rows to a compact status list', () => {
    const rows = [{ id: 'j1', project_id: 'p', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1, source_r2_key: 'k', status: 'done', url: 'https://x/a.mp4', file_size: 1234, error: null }]
    expect(projectJobStatus(rows as any)).toEqual([{ jobId: 'j1', formatKey: 'a', status: 'done', url: 'https://x/a.mp4', fileSize: 1234, error: null }])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run test/banner/renderJob.test.ts`
Expected: FAIL — cannot find module `renderJob`.

- [ ] **Step 5: Write the implementation**

```ts
// server/utils/banner/renderJob.ts
export type BannerFormat = { key: string, html: string, width: number, height: number }
export type BannerRenderInput = { projectId: string, formats: BannerFormat[], fps: number, quality: 1 | 2, crf: number, userId: string }
export type BannerJobRow = {
  id: string, project_id: string, format_key: string, width: number, height: number,
  fps: number, crf: number, quality: number, source_r2_key: string,
  status: string, url: string | null, file_size: number | null, error: string | null,
}
export type InsertJobRow = {
  id: string, project_id: string, format_key: string, width: number, height: number,
  fps: number, crf: number, quality: number, source_r2_key: string, created_by: string,
}
export type EnqueueDeps = {
  genId: () => string
  putSourceHtml: (key: string, html: string) => Promise<void>
  insertJob: (row: InsertJobRow) => Promise<void>
  sendQueue: (msg: { jobId: string }) => Promise<void>
}

export const CAPS = { MAX_FORMATS: 10, MAX_DIMENSION: 2000 } as const

export class BannerRenderError extends Error {
  code: 'bad_request'
  constructor(message: string) { super(message); this.code = 'bad_request' }
}

export function clampRenderParams(fps: number, crf: number, quality: number): { fps: number, crf: number, quality: 1 | 2 } {
  return {
    fps: Math.min(60, Math.max(12, Math.round(fps || 30))),
    crf: Math.min(51, Math.max(0, Math.round(crf ?? 23))),
    quality: quality === 2 ? 2 : 1,
  }
}

export async function enqueueBannerRender(input: BannerRenderInput, deps: EnqueueDeps): Promise<{ jobIds: string[] }> {
  if (!input.projectId) throw new BannerRenderError('projectId is required')
  if (!input.formats?.length) throw new BannerRenderError('formats array is required')
  if (input.formats.length > CAPS.MAX_FORMATS) throw new BannerRenderError(`Max ${CAPS.MAX_FORMATS} formats per export`)
  const { fps, crf, quality } = clampRenderParams(input.fps, input.crf, input.quality)

  const jobIds: string[] = []
  for (const f of input.formats) {
    if (f.width > CAPS.MAX_DIMENSION || f.height > CAPS.MAX_DIMENSION) continue // skip oversize (mirrors current loop)
    const id = deps.genId()
    const source_r2_key = `banner-render-jobs/${id}/source.html`
    await deps.putSourceHtml(source_r2_key, f.html)
    await deps.insertJob({ id, project_id: input.projectId, format_key: f.key, width: f.width, height: f.height, fps, crf, quality, source_r2_key, created_by: input.userId })
    await deps.sendQueue({ jobId: id })
    jobIds.push(id)
  }
  if (!jobIds.length) throw new BannerRenderError('No renderable formats (all exceeded the size limit)')
  return { jobIds }
}

export function projectJobStatus(rows: BannerJobRow[]): { jobId: string, formatKey: string, status: string, url: string | null, fileSize: number | null, error: string | null }[] {
  return rows.map(r => ({ jobId: r.id, formatKey: r.format_key, status: r.status, url: r.url ?? null, fileSize: r.file_size ?? null, error: r.error ?? null }))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/banner/renderJob.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add server/database/migrations/190_banner_render_jobs.sql server/utils/banner/renderJob.ts test/banner/renderJob.test.ts
git commit -m "feat(banner): migration 190 + pure render-job enqueue/status core (#2a)"
```

---

### Task 2: Enqueue endpoint refactor + status endpoint + queue binding

**Files:**
- Modify: `server/api/agency/banner-studio/export-video.post.ts` (replace sync render with enqueue)
- Create: `server/api/agency/banner-studio/export-video/jobs.get.ts`
- Modify: `wrangler.toml` (add `BANNER_RENDER_QUEUE` producer binding)

**Interfaces:**
- Consumes: `enqueueBannerRender`, `projectJobStatus`, `BannerRenderError` from `renderJob.ts`; `uploadFile` from `~~/server/utils/storage`; `execute`/`queryRows` from `~~/server/utils/db`; `requireAuth`.
- Produces: `POST /api/agency/banner-studio/export-video → { jobIds }` (503 if binding absent); `GET /api/agency/banner-studio/export-video/jobs?ids=a,b → { jobs: [...] }`.

- [ ] **Step 1: Add the queue producer binding to `wrangler.toml`**

After the `VIDEO_RENDER_QUEUE` producer block, add:
```toml
# Producer binding for Banner Studio MP4 renders. Consumer runs in
# workers/audio-jobs/ as the `banner-render` queue branch.
[[queues.producers]]
binding = "BANNER_RENDER_QUEUE"
queue = "banner-render"
```

- [ ] **Step 2: Replace `export-video.post.ts` with the enqueue version**

```ts
// server/api/agency/banner-studio/export-video.post.ts
import { randomUUID } from 'uncrypto'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { execute } from '~~/server/utils/db'
import { enqueueBannerRender, BannerRenderError, type BannerFormat, type InsertJobRow } from '~~/server/utils/banner/renderJob'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { projectId, formats, fps = 30, quality = 1, crf = 23 } = body as {
    projectId: string, formats: BannerFormat[], fps?: number, quality?: 1 | 2, crf?: number
  }

  const queue = (event.context as any).cloudflare?.env?.BANNER_RENDER_QUEUE as { send: (m: unknown) => Promise<void> } | undefined
  if (!queue) {
    throw createError({ statusCode: 503, statusMessage: 'MP4 export is not enabled yet (render queue unavailable).' })
  }

  try {
    const { jobIds } = await enqueueBannerRender(
      { projectId, formats, fps, quality: quality === 2 ? 2 : 1, crf, userId: user.id },
      {
        genId: () => randomUUID(),
        putSourceHtml: async (key, html) => { await uploadFile(Buffer.from(html, 'utf8'), key, 'text/html') },
        insertJob: async (r: InsertJobRow) => {
          await execute(
            `INSERT INTO banner_render_jobs (id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [r.id, r.project_id, r.format_key, r.width, r.height, r.fps, r.crf, r.quality, r.source_r2_key, r.created_by],
          )
        },
        sendQueue: (msg) => queue.send(msg),
      },
    )
    return { jobIds }
  } catch (e) {
    if (e instanceof BannerRenderError) throw createError({ statusCode: 400, statusMessage: e.message })
    throw e
  }
})
```

- [ ] **Step 3: Add the status endpoint**

```ts
// server/api/agency/banner-studio/export-video/jobs.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { projectJobStatus, type BannerJobRow } from '~~/server/utils/banner/renderJob'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ids = String(getQuery(event).ids ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)
  if (!ids.length) return { jobs: [] }
  const rows = await queryRows<BannerJobRow>(
    `SELECT id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, status, url, file_size, error
       FROM banner_render_jobs WHERE id = ANY($1)`,
    [ids],
  )
  return { jobs: projectJobStatus(rows) }
})
```

- [ ] **Step 4: Typecheck the changed server files**

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "banner-studio/export-video|banner/renderJob" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`.

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/banner-studio/export-video.post.ts server/api/agency/banner-studio/export-video/jobs.get.ts wrangler.toml
git commit -m "feat(banner): enqueue-based export-video + status endpoint + queue binding (#2a)"
```

---

### Task 3: Worker DB helpers + `bannerRenderWorker.ts` orchestration

**Files:**
- Modify: `workers/audio-jobs/src/db.ts` (add banner job helpers)
- Create: `workers/audio-jobs/src/bannerRenderWorker.ts`
- Test: `test/banner/bannerRenderWorker.test.ts`

**Interfaces:**
- Consumes: `execute` from the worker's db module.
- Produces:
  - db: `dbLoadBannerJob(jobId) → BannerJob|null`, `dbMarkBannerRendering(jobId)`, `dbInsertBannerExport(args) → exportId`, `dbMarkBannerDone(jobId, {r2Key,url,size,exportId})`, `dbMarkBannerFailed(jobId, error)`
  - `runBannerRenderJob(msg: { jobId: string }, deps: BannerRenderDeps): Promise<void>`; `type BannerJob`; `type BannerRenderDeps`

- [ ] **Step 1: Write the failing test (pure orchestration with injected deps)**

```ts
// test/banner/bannerRenderWorker.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runBannerRenderJob, type BannerJob, type BannerRenderDeps } from '~~/workers/audio-jobs/src/bannerRenderWorker'

const job = (over: Partial<BannerJob> = {}): BannerJob => ({
  id: 'j1', project_id: 'p1', format_key: 'a', width: 300, height: 250, fps: 30, crf: 23, quality: 1,
  source_r2_key: 'banner-render-jobs/j1/source.html', status: 'queued', created_by: 'u1', ...over,
})
function deps(over: Partial<BannerRenderDeps> = {}): BannerRenderDeps {
  return {
    loadJob: vi.fn().mockResolvedValue(job()),
    markRendering: vi.fn().mockResolvedValue(undefined),
    getSourceHtml: vi.fn().mockResolvedValue('<div>a</div>'),
    render: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadMp4: vi.fn().mockResolvedValue({ r2Key: 'banner-videos/p1/a.mp4', url: 'https://x/a.mp4', size: 3 }),
    insertExport: vi.fn().mockResolvedValue('exp1'),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('runBannerRenderJob', () => {
  it('renders, uploads, records the export, and marks done', async () => {
    const d = deps()
    await runBannerRenderJob({ jobId: 'j1' }, d)
    expect(d.markRendering).toHaveBeenCalledWith('j1')
    expect(d.render).toHaveBeenCalledWith('<div>a</div>', { width: 300, height: 250, fps: 30, crf: 23, quality: 1 })
    expect(d.insertExport).toHaveBeenCalledWith({ projectId: 'p1', formatKey: 'a', r2Key: 'banner-videos/p1/a.mp4', url: 'https://x/a.mp4', size: 3, quality: 1, userId: 'u1' })
    expect(d.markDone).toHaveBeenCalledWith('j1', { r2Key: 'banner-videos/p1/a.mp4', url: 'https://x/a.mp4', size: 3, exportId: 'exp1' })
    expect(d.markFailed).not.toHaveBeenCalled()
  })

  it('skips a missing job and an already-done job (idempotent)', async () => {
    const d1 = deps({ loadJob: vi.fn().mockResolvedValue(null) })
    await runBannerRenderJob({ jobId: 'x' }, d1)
    expect(d1.markRendering).not.toHaveBeenCalled()
    const d2 = deps({ loadJob: vi.fn().mockResolvedValue(job({ status: 'done' })) })
    await runBannerRenderJob({ jobId: 'j1' }, d2)
    expect(d2.render).not.toHaveBeenCalled()
  })

  it('marks failed and rethrows when rendering throws (so the queue retries)', async () => {
    const d = deps({ render: vi.fn().mockRejectedValue(new Error('chromium boom')) })
    await expect(runBannerRenderJob({ jobId: 'j1' }, d)).rejects.toThrow('chromium boom')
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'chromium boom')
    expect(d.markDone).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/banner/bannerRenderWorker.test.ts`
Expected: FAIL — cannot find module `bannerRenderWorker`.

- [ ] **Step 3: Write `bannerRenderWorker.ts`**

```ts
// workers/audio-jobs/src/bannerRenderWorker.ts
export type BannerJob = {
  id: string, project_id: string, format_key: string, width: number, height: number,
  fps: number, crf: number, quality: number, source_r2_key: string, status: string, created_by: string,
}
export type BannerRenderDeps = {
  loadJob: (jobId: string) => Promise<BannerJob | null>
  markRendering: (jobId: string) => Promise<void>
  getSourceHtml: (key: string) => Promise<string>
  render: (html: string, params: { width: number, height: number, fps: number, crf: number, quality: number }) => Promise<Uint8Array>
  uploadMp4: (projectId: string, formatKey: string, bytes: Uint8Array) => Promise<{ r2Key: string, url: string, size: number }>
  insertExport: (args: { projectId: string, formatKey: string, r2Key: string, url: string, size: number, quality: number, userId: string }) => Promise<string>
  markDone: (jobId: string, out: { r2Key: string, url: string, size: number, exportId: string }) => Promise<void>
  markFailed: (jobId: string, error: string) => Promise<void>
}

export async function runBannerRenderJob(msg: { jobId: string }, deps: BannerRenderDeps): Promise<void> {
  const job = await deps.loadJob(msg.jobId)
  if (!job) return                 // nothing to render
  if (job.status === 'done') return // idempotent: already rendered
  await deps.markRendering(job.id)
  try {
    const html = await deps.getSourceHtml(job.source_r2_key)
    const bytes = await deps.render(html, { width: job.width, height: job.height, fps: job.fps, crf: job.crf, quality: job.quality })
    const { r2Key, url, size } = await deps.uploadMp4(job.project_id, job.format_key, bytes)
    const exportId = await deps.insertExport({ projectId: job.project_id, formatKey: job.format_key, r2Key, url, size, quality: job.quality, userId: job.created_by })
    await deps.markDone(job.id, { r2Key, url, size, exportId })
  } catch (e) {
    await deps.markFailed(job.id, e instanceof Error ? e.message : String(e))
    throw e // surface to the queue branch → msg.retry
  }
}
```

- [ ] **Step 4: Add the DB helpers to `workers/audio-jobs/src/db.ts`**

Append (mirroring the existing `dbMarkRender*` writers):
```ts
// Banner render-job writers (#2a). Mirror the media-render writers' execute() usage.
export interface BannerJobDb {
  id: string; project_id: string; format_key: string; width: number; height: number
  fps: number; crf: number; quality: number; source_r2_key: string; status: string; created_by: string
}
export async function dbLoadBannerJob(jobId: string): Promise<BannerJobDb | null> {
  const rows = await queryRows<BannerJobDb>(
    `SELECT id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, status, created_by
       FROM banner_render_jobs WHERE id=$1`, [jobId])
  return rows[0] ?? null
}
export async function dbMarkBannerRendering(jobId: string): Promise<void> {
  await execute(`UPDATE banner_render_jobs SET status='rendering', started_at=now(), updated_at=now() WHERE id=$1`, [jobId])
}
export async function dbInsertBannerExport(a: { projectId: string, formatKey: string, r2Key: string, url: string, size: number, quality: number, userId: string }): Promise<string> {
  const rows = await queryRows<{ id: string }>(
    `INSERT INTO banner_exports (project_id, format_key, r2_key, url, file_size, export_type, quality, exported_by)
     VALUES ($1,$2,$3,$4,$5,'mp4',$6,$7) RETURNING id`,
    [a.projectId, a.formatKey, a.r2Key, a.url, a.size, a.quality, a.userId])
  return rows[0].id
}
export async function dbMarkBannerDone(jobId: string, o: { r2Key: string, url: string, size: number, exportId: string }): Promise<void> {
  await execute(
    `UPDATE banner_render_jobs SET status='done', r2_key=$1, url=$2, file_size=$3, export_id=$4, finished_at=now(), updated_at=now() WHERE id=$5`,
    [o.r2Key, o.url, o.size, o.exportId, jobId])
}
export async function dbMarkBannerFailed(jobId: string, error: string): Promise<void> {
  await execute(`UPDATE banner_render_jobs SET status='failed', error=$1, finished_at=now(), updated_at=now() WHERE id=$2`, [error, jobId])
}
```

(Confirm `queryRows` is imported in `db.ts`; it already imports `execute`. Add `queryRows` to the existing import from the worker's db client if missing.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/banner/bannerRenderWorker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add workers/audio-jobs/src/bannerRenderWorker.ts workers/audio-jobs/src/db.ts test/banner/bannerRenderWorker.test.ts
git commit -m "feat(banner): worker orchestration + DB helpers for async render (#2a)"
```

---

### Task 4: Worker queue branch + container capture (verify-live)

**Files:**
- Modify: `workers/audio-jobs/src/index.ts` (add `banner-render` branch)
- Create: `workers/audio-jobs/src/bannerRenderContainer.ts` (worker→container call + R2 upload)
- Create: `workers/audio-jobs/container/bannerCapture.mjs` (Chromium GSAP capture + ffmpeg)
- Modify: `workers/audio-jobs/container/server.mjs` (add `/render-banner` route)

**Interfaces:**
- Consumes: `runBannerRenderJob` + the `db` helpers (Task 3); `getContainer`/`Container` from `@cloudflare/containers`.
- Produces: a working `banner-render` queue consumer. **No unit tests** — Chromium+ffmpeg run only in the container; this task is verified live (Step 5).

- [ ] **Step 1: Add the worker→container caller + R2 upload**

```ts
// workers/audio-jobs/src/bannerRenderContainer.ts
import { getContainer } from '@cloudflare/containers'

export async function renderBanner(
  env: { RENDER: unknown, AUDIO_BUCKET: R2Bucket },
  args: { jobId: string, html: string, width: number, height: number, fps: number, crf: number, quality: number },
): Promise<Uint8Array> {
  const instance = getContainer(env.RENDER, `ban:${args.jobId}`)
  const res = await instance.fetch('http://render.local/render-banner', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(600_000),
  })
  if (!res.ok) throw new Error(`banner container ${res.status}: ${await res.text().catch(() => '')}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function getSourceHtml(env: { AUDIO_BUCKET: R2Bucket }, key: string): Promise<string> {
  const obj = await env.AUDIO_BUCKET.get(key)
  if (!obj) throw new Error(`source html not found: ${key}`)
  return await obj.text()
}

export async function uploadBannerMp4(env: { AUDIO_BUCKET: R2Bucket }, projectId: string, formatKey: string, bytes: Uint8Array, jobId: string): Promise<{ r2Key: string, url: string, size: number }> {
  const r2Key = `banner-videos/${projectId}/${formatKey}_${jobId}.mp4`
  await env.AUDIO_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  const base = (env as any).R2_PUBLIC_URL || ''
  return { r2Key, url: base ? `${base}/${r2Key}` : r2Key, size: bytes.byteLength }
}
```

- [ ] **Step 2: Add the `banner-render` branch to `index.ts`**

Inside the `queue()` handler, after the `video-render` branch:
```ts
    if (batch.queue === 'banner-render') {
      const { runBannerRenderJob } = await import('./bannerRenderWorker')
      const { renderBanner, getSourceHtml, uploadBannerMp4 } = await import('./bannerRenderContainer')
      const db = await import('./db')
      for (const msg of batch.messages) {
        const { jobId } = msg.body as { jobId: string }
        try {
          await runBannerRenderJob({ jobId }, {
            loadJob: db.dbLoadBannerJob,
            markRendering: db.dbMarkBannerRendering,
            getSourceHtml: (key) => getSourceHtml(env as any, key),
            render: (html, p) => renderBanner(env as any, { jobId, html, ...p }),
            uploadMp4: (projectId, formatKey, bytes) => uploadBannerMp4(env as any, projectId, formatKey, bytes, jobId),
            insertExport: db.dbInsertBannerExport,
            markDone: db.dbMarkBannerDone,
            markFailed: db.dbMarkBannerFailed,
          })
          msg.ack()
        } catch (e) {
          console.error('audio-jobs.banner-render.error', jobId, e)
          msg.retry({ delaySeconds: 30 })
        }
      }
      return
    }
```
Also add `AUDIO_BUCKET` and `RENDER` to the `Env` interface if not already present (they are, per the audio render branch).

- [ ] **Step 3: Add the container capture module (port of the current sync logic)**

```js
// workers/audio-jobs/container/bannerCapture.mjs
// Chromium captures GSAP frames of the banner HTML at WxH; ffmpeg encodes to MP4.
// Ported from the former server/api/agency/banner-studio/export-video.post.ts loop.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import puppeteer from 'puppeteer'

const MAX_FRAMES = 600

export async function captureBannerMp4({ html, width, height, fps, crf, quality }) {
  const vpW = width * (quality || 1)
  const vpH = height * (quality || 1)
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
  const tmp = join(tmpdir(), `banner-${randomUUID()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: vpW, height: vpH, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })
    await new Promise(r => setTimeout(r, 500))
    let duration = 5
    try {
      duration = await page.evaluate(() => {
        const g = globalThis.gsap
        if (!g) return 5
        const c = g.globalTimeline.getChildren(false)
        return c.length ? c[0].duration() : 5
      })
    } catch { /* default */ }
    duration = Math.min(duration, 30)
    const totalFrames = Math.min(MAX_FRAMES, Math.ceil(duration * fps))
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps
      await page.evaluate((tt) => {
        const g = globalThis.gsap
        if (!g) return
        const c = g.globalTimeline.getChildren(false)
        if (c.length) c[0].seek(tt)
      }, t)
      await new Promise(r => setTimeout(r, 20))
      await page.screenshot({ path: join(tmp, `frame_${String(f).padStart(5, '0')}.png`), type: 'png', clip: { x: 0, y: 0, width: vpW, height: vpH } })
    }
    const out = join(tmp, 'out.mp4')
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-framerate', String(fps), '-i', join(tmp, 'frame_%05d.png'),
        '-c:v', 'libx264', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-vf', `scale=${vpW}:${vpH}:flags=lanczos`, out], { timeout: 120000 })
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))
      ff.on('error', reject)
    })
    return readFileSync(out)
  } finally {
    await browser.close().catch(() => {})
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
```

- [ ] **Step 4: Add the `/render-banner` route to `container/server.mjs`**

Add a route alongside the existing render routes:
```js
// inside the HTTP handler dispatch
if (req.method === 'POST' && url.pathname === '/render-banner') {
  const { captureBannerMp4 } = await import('./bannerCapture.mjs')
  const body = JSON.parse(await readBody(req)) // reuse the file's existing body reader
  const mp4 = await captureBannerMp4(body)
  res.writeHead(200, { 'content-type': 'video/mp4' })
  res.end(mp4)
  return
}
```
(Match `server.mjs`'s existing request-parsing + routing style; reuse its body-reading helper rather than introducing a new one.)

- [ ] **Step 5: Verify-live (operator/manual — Chromium+ffmpeg only run in the container)**

After deploying (Task 5 activation), run ONE real in-app MP4 export and confirm: a `banner_render_jobs` row goes `queued→rendering→done`, an MP4 lands in R2 `banner-videos/...`, a `banner_exports` row is created, and the file plays. Document the result.

- [ ] **Step 6: Commit**

```bash
git add workers/audio-jobs/src/index.ts workers/audio-jobs/src/bannerRenderContainer.ts workers/audio-jobs/container/bannerCapture.mjs workers/audio-jobs/container/server.mjs
git commit -m "feat(banner): audio-jobs banner-render branch + Chromium/ffmpeg container capture (#2a)"
```

---

### Task 5: Modal enqueue→poll (verify-live) + activation notes

**Files:**
- Modify: `app/components/banner/BannerExportModal.client.vue` (MP4 path → enqueue + poll)
- Create: `test/banner/exportPoll.test.ts` (pure poll-state helper)

**Interfaces:**
- Consumes: `POST /api/agency/banner-studio/export-video` (`{ jobIds }`) and `GET .../export-video/jobs?ids=` (`{ jobs }`).
- Produces: a pure `summarizeExportJobs(jobs)` helper (progress %, done/failed) extracted for testability; the modal uses it.

- [ ] **Step 1: Write the failing test for the pure poll-summary helper**

```ts
// test/banner/exportPoll.test.ts
import { describe, it, expect } from 'vitest'
import { summarizeExportJobs } from '~~/app/utils/bannerExportPoll'

const j = (status: string, url?: string) => ({ jobId: 'x', formatKey: 'a', status, url: url ?? null, fileSize: null, error: null })

describe('summarizeExportJobs', () => {
  it('computes progress and completion across jobs', () => {
    expect(summarizeExportJobs([j('done', 'u'), j('rendering')])).toEqual({ total: 2, done: 1, failed: 0, progress: 50, finished: false, urls: ['u'] })
    expect(summarizeExportJobs([j('done', 'u1'), j('failed')])).toEqual({ total: 2, done: 1, failed: 1, progress: 100, finished: true, urls: ['u1'] })
    expect(summarizeExportJobs([])).toEqual({ total: 0, done: 0, failed: 0, progress: 0, finished: true, urls: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/banner/exportPoll.test.ts`
Expected: FAIL — cannot find module `bannerExportPoll`.

- [ ] **Step 3: Write the pure helper**

```ts
// app/utils/bannerExportPoll.ts
export type ExportJob = { jobId: string, formatKey: string, status: string, url: string | null, fileSize: number | null, error: string | null }
export function summarizeExportJobs(jobs: ExportJob[]): { total: number, done: number, failed: number, progress: number, finished: boolean, urls: string[] } {
  const total = jobs.length
  const done = jobs.filter(j => j.status === 'done').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const settled = done + failed
  return {
    total, done, failed,
    progress: total ? Math.round((settled / total) * 100) : 0,
    finished: total === 0 ? true : settled === total,
    urls: jobs.filter(j => j.status === 'done' && j.url).map(j => j.url as string),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/banner/exportPoll.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the modal's MP4 path to enqueue + poll**

In `BannerExportModal.client.vue`, replace the `exportVideos()` body so it: POSTs to `/api/agency/banner-studio/export-video` → gets `{ jobIds }`; then polls `GET /api/agency/banner-studio/export-video/jobs?ids=<jobIds>` every ~2s, feeding results through `summarizeExportJobs` to drive `exportProgress`; stops when `finished`; surfaces `urls` as downloads and a toast; on any `failed`, show an error toast. Keep `exportImages()`/`exportGifs()` unchanged. (Use `$fetch`; guard the 503 from a not-yet-activated queue with a clear toast.)

- [ ] **Step 6: Verify-live (manual)**

With the pipeline activated, open the export modal, export an MP4, watch the progress bar advance via polling, and confirm the download link works and the export appears in `/exports`.

- [ ] **Step 7: Commit**

```bash
git add app/utils/bannerExportPoll.ts test/banner/exportPoll.test.ts app/components/banner/BannerExportModal.client.vue
git commit -m "feat(banner): modal enqueue→poll MP4 export UX (#2a)"
```

---

## Self-Review

**1. Spec coverage:**
- §2 enqueue endpoint + R2 source + job insert + queue + 503 → Task 1 (pure) + Task 2 (wiring). ✓
- §2 worker branch + stateless container + R2/exports persistence → Task 3 (orchestration/DB) + Task 4 (branch/container). ✓
- §2 status endpoint + modal poll → Task 2 (endpoint) + Task 5 (modal). ✓
- §4 migration 190 (exact types) → Task 1 Step 1–2. ✓
- §5 lifecycle/idempotency/retry/DLQ → Task 3 (`status==='done'` skip; markFailed+rethrow) + Task 4 (`msg.retry`); **DLQ** is created at activation (§9) — note: add `banner-render-dlq` when creating the queue (Task 4 has no code for it; it's a queue-config step in §9/activation, called out in Step 5 activation + the spec). ✓
- §6 modal live-behaviour change → Task 5. ✓
- §7 security (client HTML in sandboxed container; auth on endpoints) → `requireAuth` in Task 2; container unchanged-surface noted. ✓
- §8 testing (pure renderJob + worker; container/modal verify-live) → Tasks 1,3,5 unit; Tasks 4,5 verify-live. ✓
- §9 activation → documented in Task 4 Step 5 + Task 5; queue/binding/container deploy are operator steps.

**2. Placeholder scan:** No TBD/TODO. Task 4 Step 4 and Task 5 Step 5 describe edits to existing files (`server.mjs` routing, the Vue modal) in prose because they must match each file's existing idiom; both specify exact inputs/outputs and the pure logic they call (`captureBannerMp4`, `summarizeExportJobs`) is given in full. Acceptable (matching-existing-style edits), not vague placeholders.

**3. Type consistency:** `BannerJob`/`BannerJobDb` fields match the migration columns and `runBannerRenderJob`'s usage. `renderBanner`/`getSourceHtml`/`uploadMp4` signatures in Task 4 match the `BannerRenderDeps` they're wired into in Task 4 Step 2. `enqueueBannerRender` deps (`genId/putSourceHtml/insertJob/sendQueue`) match Task 2's wiring. `summarizeExportJobs`'s `ExportJob` matches the status endpoint's `projectJobStatus` output (`jobId,formatKey,status,url,fileSize,error`). ✓

---

## Execution Handoff

Pick an execution approach when ready (see end of this message).
