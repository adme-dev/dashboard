# AI Video Gen — Slice 2B part 1: functional i2v source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make image-to-video generate a real clip: upload a still in the Generate panel → R2 → `video_gen_source_assets` (approval rail) → resolve to a presigned URL at enqueue → thread to the worker so `env.AI.run` receives a fetchable image.

**Architecture:** New dedicated source-asset table + store; presigned-URL resolution in Pages at enqueue, passed on the queue message; worker uses message URLs over the (UUID) job ids. Slideover swaps the empty timeline-still dropdown for an upload control. Migration 176 (additive).

**Tech Stack:** Nuxt/Nitro, Neon (pg), R2 (storage utils), CF Queues, Vitest, Nuxt UI v4.

**Spec:** `docs/superpowers/specs/2026-06-09-ai-video-gen-2b-i2v-source-design.md`

Known existing signatures (verified this session): `uploadFile(buffer,key,contentType,metadata?)`, `getPresignedDownloadUrl(key,expirySeconds)`, `validateFileType(mime,'media-image')`, `validateFileSize`, `getMaxFileSize`, `generateStorageKey` in `server/utils/storage.ts`. `queryOne/queryRows/execute` in `server/utils/db.ts`. `requireWriteAccess(event)` in `server/utils/auth.ts`. Worker message `VideoGenerationMessage { jobId, tenantId, idempotencyKey }` in `server/utils/video-generation/enqueue.ts`; `processVideoGenerationJob(message, deps)` in `workers/video-generation/src/worker.ts` builds the provider request with `sourceAssetUrls: job.sourceAssetIds`.

---

## Task 1: Migration — `video_gen_source_assets`

**Files:** Create `server/database/migrations/176_video_gen_source_assets.sql`.

- [ ] **Step 1: Write the migration**
```sql
-- 176_video_gen_source_assets.sql — approvable i2v source images. Additive.
CREATE TABLE IF NOT EXISTS video_gen_source_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NULL,
  created_by   UUID NOT NULL,
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'approved',
  subject_type TEXT NOT NULL DEFAULT 'unknown',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vgsa_client ON video_gen_source_assets (client_id, created_at DESC);
```
- [ ] **Step 2: Run it** (project rule — run migrations as part of the workflow):
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/176_video_gen_source_assets.sql
psql "$DATABASE_URL" -c "\d video_gen_source_assets"
```
Expected: CREATE TABLE / CREATE INDEX, then the table description.
- [ ] **Step 3: Commit**
```bash
git add server/database/migrations/176_video_gen_source_assets.sql
git commit -m "feat(video-gen): migration — video_gen_source_assets (approvable i2v sources)"
```

---

## Task 2: Source-asset store + pure validation

**Files:** Create `server/utils/video-generation/sourceAssetStore.ts`; Test `test/video-generation/sourceAssetStore.test.ts`.

- [ ] **Step 1: Write the failing test (pure validator)**
```ts
import { describe, expect, it } from 'vitest'
import { assertResolvableSources } from '~~/server/utils/video-generation/sourceAssetStore'

const row = (over = {}) => ({ id: 'a1', client_id: 'dealer-1', r2_key: 'k1', status: 'approved', ...over })

describe('assertResolvableSources', () => {
  it('returns rows in id order when all are approved and owned', () => {
    const rows = [row({ id: 'a2', r2_key: 'k2' }), row({ id: 'a1' })]
    const out = assertResolvableSources(rows as any, ['a1', 'a2'], 'dealer-1')
    expect(out.map((r) => r.id)).toEqual(['a1', 'a2'])
  })
  it('throws when an id is missing', () => {
    expect(() => assertResolvableSources([row()] as any, ['a1', 'a2'], 'dealer-1')).toThrow(/source asset a2 not found/)
  })
  it('throws when a source is not approved', () => {
    expect(() => assertResolvableSources([row({ status: 'pending' })] as any, ['a1'], 'dealer-1')).toThrow(/not approved/)
  })
  it('throws on cross-tenant reference', () => {
    expect(() => assertResolvableSources([row({ client_id: 'other' })] as any, ['a1'], 'dealer-1')).toThrow(/not owned/)
  })
  it('allows agency-owned (client_id null) sources for any tenant', () => {
    expect(assertResolvableSources([row({ client_id: null })] as any, ['a1'], 'dealer-1').length).toBe(1)
  })
})
```
- [ ] **Step 2: Run, verify FAIL:** `npx vitest run test/video-generation/sourceAssetStore.test.ts`
- [ ] **Step 3: Implement** `server/utils/video-generation/sourceAssetStore.ts`
```ts
import { randomUUID } from 'node:crypto'
import { queryOne, queryRows } from '~~/server/utils/db'

export interface SourceAssetRow {
  id: string
  client_id: string | null
  r2_key: string
  status: string
  content_type?: string
  subject_type?: string
}

export async function createSourceAsset(input: {
  clientId: string | null
  createdBy: string
  r2Key: string
  contentType: string
  subjectType: string
}): Promise<{ id: string; status: string }> {
  const row = await queryOne<{ id: string; status: string }>(
    `INSERT INTO video_gen_source_assets (id, client_id, created_by, r2_key, content_type, subject_type)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, status`,
    [randomUUID(), input.clientId, input.createdBy, input.r2Key, input.contentType, input.subjectType]
  )
  if (!row) throw new Error('failed to create source asset')
  return { id: row.id, status: row.status }
}

export async function loadSourceAssetsByIds(ids: string[]): Promise<SourceAssetRow[]> {
  if (ids.length === 0) return []
  return queryRows<SourceAssetRow>(
    `SELECT id, client_id, r2_key, status, content_type, subject_type
     FROM video_gen_source_assets WHERE id = ANY($1::uuid[])`,
    [ids]
  )
}

/** Validate every requested id resolves to an approved, tenant-or-agency-owned source.
 *  Returns the rows in the same order as `ids`. Throws on any violation. */
export function assertResolvableSources(rows: SourceAssetRow[], ids: string[], tenantId: string): SourceAssetRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => {
    const r = byId.get(id)
    if (!r) throw new Error(`source asset ${id} not found`)
    if (r.status !== 'approved') throw new Error(`source asset ${id} is not approved`)
    if (r.client_id !== null && r.client_id !== tenantId) throw new Error(`source asset ${id} is not owned by this tenant`)
    return r
  })
}
```
- [ ] **Step 4: Run, verify PASS** (5 tests).
- [ ] **Step 5: Commit**
```bash
git add server/utils/video-generation/sourceAssetStore.ts test/video-generation/sourceAssetStore.test.ts
git commit -m "feat(video-gen): source-asset store + approved/owned validation"
```

---

## Task 3: Resolve source ids → presigned URLs

**Files:** Create `server/utils/video-generation/resolveSourceUrls.ts`; Test `test/video-generation/resolveSourceUrls.test.ts`.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it, vi } from 'vitest'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'

describe('resolveSourceAssetUrls', () => {
  it('loads, validates, and presigns each source in order', async () => {
    const deps = {
      load: vi.fn().mockResolvedValue([
        { id: 'a1', client_id: 'd1', r2_key: 'k1', status: 'approved' },
        { id: 'a2', client_id: null, r2_key: 'k2', status: 'approved' },
      ]),
      presign: vi.fn().mockImplementation(async (key: string) => `https://r2/${key}?sig`),
    }
    const urls = await resolveSourceAssetUrls(['a1', 'a2'], 'd1', deps as any)
    expect(urls).toEqual(['https://r2/k1?sig', 'https://r2/k2?sig'])
    expect(deps.presign).toHaveBeenCalledWith('k1', 3600)
  })
  it('returns [] for no ids without hitting the db', async () => {
    const deps = { load: vi.fn(), presign: vi.fn() }
    expect(await resolveSourceAssetUrls([], 'd1', deps as any)).toEqual([])
    expect(deps.load).not.toHaveBeenCalled()
  })
  it('throws when a source is unapproved', async () => {
    const deps = { load: vi.fn().mockResolvedValue([{ id: 'a1', client_id: 'd1', r2_key: 'k1', status: 'pending' }]), presign: vi.fn() }
    await expect(resolveSourceAssetUrls(['a1'], 'd1', deps as any)).rejects.toThrow(/not approved/)
    expect(deps.presign).not.toHaveBeenCalled()
  })
})
```
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `server/utils/video-generation/resolveSourceUrls.ts`
```ts
import { loadSourceAssetsByIds, assertResolvableSources } from '~~/server/utils/video-generation/sourceAssetStore'
import { getPresignedDownloadUrl } from '~~/server/utils/storage'

export interface ResolveDeps {
  load: typeof loadSourceAssetsByIds
  presign: typeof getPresignedDownloadUrl
}
const defaultDeps: ResolveDeps = { load: loadSourceAssetsByIds, presign: getPresignedDownloadUrl }

/** Resolve approved, tenant-owned source-asset ids to presigned R2 URLs (1h), in order. */
export async function resolveSourceAssetUrls(ids: string[], tenantId: string, deps: ResolveDeps = defaultDeps): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await deps.load(ids)
  const ordered = assertResolvableSources(rows, ids, tenantId)
  return Promise.all(ordered.map((r) => deps.presign(r.r2_key, 3600)))
}
```
- [ ] **Step 4: Run, verify PASS** (3 tests).
- [ ] **Step 5: Commit**
```bash
git add server/utils/video-generation/resolveSourceUrls.ts test/video-generation/resolveSourceUrls.test.ts
git commit -m "feat(video-gen): resolve source-asset ids -> presigned R2 urls"
```

---

## Task 4: Upload endpoint

**Files:** Create `server/api/agency/video/generation/source-assets.post.ts`.

- [ ] **Step 1: Implement** (no unit test — H3 multipart; manual verify)
```ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { uploadFile, validateFileType, validateFileSize, getMaxFileSize } from '~~/server/utils/storage'
import { createSourceAsset } from '~~/server/utils/video-generation/sourceAssetStore'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const user = await requireWriteAccess(event)
  const form = await readMultipartFormData(event)
  const file = form?.find((f) => f.name === 'file')
  const clientField = form?.find((f) => f.name === 'clientId')
  const subjectField = form?.find((f) => f.name === 'subjectType')
  if (!file?.data || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  const fileType = file.type || 'application/octet-stream'
  if (!validateFileType(fileType, 'media-image')) throw createError({ statusCode: 400, statusMessage: `Unsupported image type: ${fileType}` })
  if (!validateFileSize(file.data.length, 'media-image')) {
    const maxMB = Math.round(getMaxFileSize('media-image') / (1024 * 1024))
    throw createError({ statusCode: 400, statusMessage: `Image exceeds the ${maxMB}MB limit` })
  }
  const clientId = clientField?.data ? new TextDecoder().decode(clientField.data) || null : null
  const subjectType = subjectField?.data ? new TextDecoder().decode(subjectField.data) : 'unknown'
  const ext = (file.filename.split('.').pop() || 'jpg').toLowerCase()
  const r2Key = `video-gen-sources/${clientId ?? 'agency'}/${randomUUID()}.${ext}`
  await uploadFile(file.data, r2Key, fileType, { kind: 'i2v-source' })
  const asset = await createSourceAsset({ clientId, createdBy: user.id, r2Key, contentType: fileType, subjectType })
  setResponseStatus(event, 201)
  return { id: asset.id, status: asset.status }
})
```
- [ ] **Step 2: Smoke** `npx vitest run test/video-generation/sourceAssetStore.test.ts` (alias resolves).
- [ ] **Step 3: Commit**
```bash
git add server/api/agency/video/generation/source-assets.post.ts
git commit -m "feat(video-gen): i2v source-image upload endpoint"
```

---

## Task 5: Thread resolved URLs (enqueue → message → worker)

**Files:** Modify `server/utils/video-generation/enqueue.ts`, `server/api/agency/video/generation/jobs.post.ts`, `workers/video-generation/src/worker.ts`, `workers/video-generation/src/index.ts`; Test `test/video-generation/worker.test.ts`.

- [ ] **Step 1: enqueue.ts** — add to `interface VideoGenerationMessage`: `sourceAssetUrls?: string[]`.
- [ ] **Step 2: jobs.post.ts** — after compliance/cost succeed and the job row is created, for i2v resolve the URLs and pass them on enqueue. Find the `enqueueVideoGeneration(event, { jobId: job.id, tenantId, idempotencyKey: body.idempotencyKey })` call. Replace with:
```ts
  let sourceAssetUrls: string[] = []
  if (body.mode === 'image-to-video') {
    try {
      sourceAssetUrls = await resolveSourceAssetUrls(body.sourceAssetIds, tenantId)
    } catch (e: any) {
      await markVideoGenerationJobFailed(job.id, `source resolution failed: ${e?.message ?? String(e)}`)
      throw createError({ statusCode: 400, statusMessage: `Source image unavailable: ${e?.message ?? 'unresolved'}` })
    }
  }
  await enqueueVideoGeneration(event, { jobId: job.id, tenantId, idempotencyKey: body.idempotencyKey, sourceAssetUrls })
```
Add imports: `import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'` and ensure `markVideoGenerationJobFailed` is imported from `~~/server/utils/video-generation/jobs`. (`tenantId` is the same value jobs.post already computed for the job row.)
- [ ] **Step 3: worker.ts** — in `processVideoGenerationJob(message, deps)`, where the provider request is built, change `sourceAssetUrls: job.sourceAssetIds,` to `sourceAssetUrls: message.sourceAssetUrls?.length ? message.sourceAssetUrls : job.sourceAssetIds,`.
- [ ] **Step 4: index.ts** — no change needed (it passes `msg.body` as `message`); confirm `processVideoGenerationJob(msg.body, {...})` already receives the full message.
- [ ] **Step 5: worker.test.ts** — add:
```ts
it('uses message.sourceAssetUrls over job.sourceAssetIds when present', async () => {
  const d = deps(baseJob)
  await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1', sourceAssetUrls: ['https://r2/x?sig'] }, d)
  expect(d.providers.mock.submit).toHaveBeenCalledWith(expect.objectContaining({ sourceAssetUrls: ['https://r2/x?sig'] }))
})
```
- [ ] **Step 6: Run** `npx vitest run test/video-generation` — all PASS.
- [ ] **Step 7: Commit**
```bash
git add server/utils/video-generation/enqueue.ts server/api/agency/video/generation/jobs.post.ts workers/video-generation/src/worker.ts test/video-generation/worker.test.ts
git commit -m "feat(video-gen): resolve i2v source urls at enqueue; worker uses them"
```

---

## Task 6: Slideover upload control

**Files:** Modify `app/components/media/MediaGeneratePicker.vue`.

> Invoke `frontend-design` first (project rule for form work).

- [ ] **Step 1:** For `mode === 'image-to-video'`, replace the timeline-still `USelectMenu` with an upload control: a hidden `<input type="file" accept="image/*">` + a `UButton` "Upload source image"; on change, POST the file (FormData with `file`, `subjectType`, and the project's client id if available) to `/api/agency/video/generation/source-assets`; set `sourceAssetId.value = res.id`; show the filename + a "Replace" affordance. Keep `validateGenerationForm` (still requires `sourceAssetId` for i2v) and the rest of the submit flow unchanged. Remove the now-unused `timelineStills` prop usage (or leave the prop, unused). Use Nuxt UI v4 only.
- [ ] **Step 2:** Smoke `npx vitest run test/app/videoGenerationForm.test.ts` (alias resolves).
- [ ] **Step 3: Commit**
```bash
git add app/components/media/MediaGeneratePicker.vue
git commit -m "feat(video-gen): upload i2v source image in the Generate panel"
```

---

## Final verification
- [ ] `npx vitest run test/video-generation test/app/videoGenerationForm.test.ts` — all PASS.
- [ ] Dormancy: source-assets endpoint + jobs.post still 404 when flags off; migration additive.

## Verify-live (operator, before flag-flip)
- Migration 176 run on prod DB.
- One real i2v: upload a car still → generate → confirm `env.AI.run` gets the presigned URL and returns a clip. (Plus the 2A items: worker tsconfig `paths`, real env.AI.run cost/slug check.)
</content>
