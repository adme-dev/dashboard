# Video Asset Intelligence Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI Producer harness from blocked job capture into executable asset-intelligence jobs that create reusable masks, lifted layers, edited images, captions, and timeline-ready derivatives.

**Architecture:** Reuse the existing video-generation pattern: API creates a DB job, enqueues a Cloudflare Queue message when bindings exist, a worker runs the provider adapter, stores output in R2 and `video_asset_derivatives`, then the editor refreshes activity and lets users add derivatives to buckets/timeline. Start with deterministic `mask-only` and Workers AI-backed actions; keep disabled external providers blocked until their route is explicitly configured.

**Tech Stack:** Nuxt/Nitro server routes, Cloudflare Pages bindings, Cloudflare Queues, Workers AI `env.AI.run`, R2, Postgres migrations, Vitest.

---

## File Structure

- Modify `server/utils/video-asset-intelligence/db.ts`: add queued/running/succeeded/failed lifecycle helpers and derivative creation helpers.
- Create `server/utils/video-asset-intelligence/enqueue.ts`: reads `ASSET_INTELLIGENCE_QUEUE` from `event.context.cloudflare.env` and sends job messages.
- Modify `server/api/agency/video/assets/[id]/extract.post.ts`: create queued jobs when a queue binding exists; fall back to blocked jobs for unconfigured provider routes.
- Create `server/api/agency/video/derivatives/[id]/add-to-bucket.post.ts`: add generated derivative outputs into the project bucket system.
- Create `workers/asset-intelligence/src/index.ts`: queue consumer for asset-intelligence messages.
- Create `workers/asset-intelligence/src/worker.ts`: provider-independent job processing.
- Create `workers/asset-intelligence/src/providers.ts`: action-to-provider execution adapters.
- Create `workers/asset-intelligence/src/storage.ts`: R2 download/upload helpers for source assets, masks, and outputs.
- Create `workers/asset-intelligence/src/db.ts`: worker-side DB wrappers mirroring server lifecycle helpers.
- Create `workers/asset-intelligence/wrangler.toml`, `package.json`, `tsconfig.json`.
- Modify `app/components/media/MediaAssetHarness.vue`: show derivative outputs and expose “Add layer to bucket/timeline”.
- Modify `app/pages/agency/audio/projects/[id].vue`: receive derivative payloads from the harness and add them to the editor.
- Tests:
  - `test/server/api/videoAssetHarness.test.ts`
  - `test/video/assetIntelligenceLifecycle.test.ts`
  - `test/workers/asset-intelligence/worker.test.ts`
  - `test/workers/asset-intelligence/providers.test.ts`
  - `test/app/videoAssetHarnessDerivatives.test.ts`

---

### Task 1: Queue-Capable Job Lifecycle

**Files:**
- Modify: `server/utils/video-asset-intelligence/db.ts`
- Create: `server/utils/video-asset-intelligence/enqueue.ts`
- Modify: `server/api/agency/video/assets/[id]/extract.post.ts`
- Test: `test/video/assetIntelligenceLifecycle.test.ts`
- Test: `test/server/api/videoAssetHarness.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Add `test/video/assetIntelligenceLifecycle.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

const {
  createQueuedExtractionJob,
  markAssetIntelligenceJobRunning,
  markAssetIntelligenceJobSucceeded,
  markAssetIntelligenceJobFailed,
} = await import('~~/server/utils/video-asset-intelligence/db')

describe('asset intelligence lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates queued extraction jobs with a default model/provider', async () => {
    mockQueryOne.mockResolvedValue({
      id: 'job-1',
      project_id: 'project-1',
      source_asset_id: 'asset-1',
      bucket_item_id: 'item-1',
      action: 'erase-fill',
      model_id: 'workers-ai/flux-edit',
      provider: 'workers-ai',
      status: 'queued',
      prompt: 'erase logo',
      brush_mask_key: 'mask.png',
      output_derivative_ids: [],
      error_message: null,
      created_by: 'user-1',
      created_at: 'now',
      updated_at: 'now',
      started_at: null,
      completed_at: null,
    })

    const job = await createQueuedExtractionJob({
      projectId: 'project-1',
      sourceAssetId: 'asset-1',
      bucketItemId: 'item-1',
      action: 'erase-fill',
      prompt: 'erase logo',
      brushMaskKey: 'mask.png',
      modelId: null,
      createdBy: 'user-1',
    })

    expect(mockQueryOne.mock.calls[0][0]).toContain(`'queued'`)
    expect(job).toMatchObject({ id: 'job-1', status: 'queued', modelId: 'workers-ai/flux-edit' })
  })

  it('marks jobs running, succeeded and failed idempotently', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'job-1', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'running', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: [], error_message: null, created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: null })
      .mockResolvedValueOnce({ id: 'job-1', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'succeeded', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: ['derivative-1'], error_message: null, created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: 'now' })
      .mockResolvedValueOnce({ id: 'job-2', project_id: 'project-1', source_asset_id: 'asset-1', bucket_item_id: null, action: 'mask-only', model_id: 'replicate/sam-2', provider: 'replicate', status: 'failed', prompt: null, brush_mask_key: 'mask.png', output_derivative_ids: [], error_message: 'bad mask', created_by: 'user-1', created_at: 'now', updated_at: 'now', started_at: 'now', completed_at: 'now' })

    await expect(markAssetIntelligenceJobRunning('job-1')).resolves.toMatchObject({ status: 'running' })
    await expect(markAssetIntelligenceJobSucceeded({ id: 'job-1', outputDerivativeIds: ['derivative-1'] })).resolves.toMatchObject({ status: 'succeeded' })
    await expect(markAssetIntelligenceJobFailed('job-2', 'bad mask')).resolves.toMatchObject({ status: 'failed', errorMessage: 'bad mask' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run test/video/assetIntelligenceLifecycle.test.ts
```

Expected: FAIL because `createQueuedExtractionJob`, `markAssetIntelligenceJobRunning`, `markAssetIntelligenceJobSucceeded`, and `markAssetIntelligenceJobFailed` are not exported.

- [ ] **Step 3: Implement lifecycle helpers**

Add to `server/utils/video-asset-intelligence/db.ts`:

```ts
export async function createQueuedExtractionJob(input: {
  projectId: string
  sourceAssetId: string
  bucketItemId?: string | null
  action: AssetIntelligenceActionId
  prompt?: string | null
  brushMaskKey?: string | null
  modelId?: string | null
  createdBy: string
}): Promise<VideoAssetIntelligenceJob> {
  const model = input.modelId ? null : defaultModelForAction(input.action)
  const modelId = input.modelId ?? model?.id ?? 'unconfigured/provider'
  const provider = model?.provider ?? modelId.split('/')[0] ?? 'unconfigured'
  const row = await queryOne(
    `INSERT INTO video_asset_intelligence_jobs
      (project_id, source_asset_id, bucket_item_id, action, model_id, provider, status, prompt, brush_mask_key, output_derivative_ids, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,'[]'::jsonb,$9)
     RETURNING *`,
    [
      input.projectId,
      input.sourceAssetId,
      input.bucketItemId ?? null,
      input.action,
      modelId,
      provider,
      input.prompt ?? null,
      input.brushMaskKey ?? null,
      input.createdBy,
    ]
  )
  return mapIntelligenceJobRow(row)
}

export async function markAssetIntelligenceJobRunning(id: string): Promise<VideoAssetIntelligenceJob> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id]
  )
  if (!row) throw new Error(`asset intelligence job ${id} not found`)
  return mapIntelligenceJobRow(row)
}

export async function markAssetIntelligenceJobSucceeded(input: {
  id: string
  outputDerivativeIds: string[]
}): Promise<VideoAssetIntelligenceJob> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'succeeded',
            output_derivative_ids = $2::jsonb,
            error_message = null,
            completed_at = now(),
            updated_at = now()
      WHERE id = $1 AND status NOT IN ('succeeded','failed')
      RETURNING *`,
    [input.id, JSON.stringify(input.outputDerivativeIds)]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [input.id])
    if (!existing) throw new Error(`asset intelligence job ${input.id} not found`)
    return mapIntelligenceJobRow(existing)
  }
  return mapIntelligenceJobRow(row)
}

export async function markAssetIntelligenceJobFailed(id: string, errorMessage: string): Promise<VideoAssetIntelligenceJob> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
      WHERE id = $1 AND status NOT IN ('succeeded','failed')
      RETURNING *`,
    [id, errorMessage]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [id])
    if (!existing) throw new Error(`asset intelligence job ${id} not found`)
    return mapIntelligenceJobRow(existing)
  }
  return mapIntelligenceJobRow(row)
}
```

- [ ] **Step 4: Add queue helper**

Create `server/utils/video-asset-intelligence/enqueue.ts`:

```ts
export interface AssetIntelligenceMessage {
  jobId: string
  projectId: string
  sourceAssetId: string
}

interface QueueBinding {
  send(body: unknown): Promise<void>
}

export function getAssetIntelligenceQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.ASSET_INTELLIGENCE_QUEUE as QueueBinding) ?? null
}

export async function enqueueAssetIntelligence(event: any, msg: AssetIntelligenceMessage): Promise<void> {
  const queue = getAssetIntelligenceQueue(event)
  if (!queue) throw new Error('ASSET_INTELLIGENCE_QUEUE binding unavailable')
  await queue.send(msg)
}
```

- [ ] **Step 5: Update extraction endpoint test**

In `test/server/api/videoAssetHarness.test.ts`, add mocks:

```ts
const mockCreateQueuedExtractionJob = vi.fn()
const mockEnqueueAssetIntelligence = vi.fn()
const mockGetAssetIntelligenceQueue = vi.fn()
```

Extend the existing mocks:

```ts
vi.mock('~~/server/utils/video-asset-intelligence/db', () => ({
  // keep existing exports
  createQueuedExtractionJob: (...args: unknown[]) => mockCreateQueuedExtractionJob(...args),
}))

vi.mock('~~/server/utils/video-asset-intelligence/enqueue', () => ({
  getAssetIntelligenceQueue: (...args: unknown[]) => mockGetAssetIntelligenceQueue(...args),
  enqueueAssetIntelligence: (...args: unknown[]) => mockEnqueueAssetIntelligence(...args),
}))
```

Add test:

```ts
it('creates and enqueues executable asset intelligence jobs when queue binding exists', async () => {
  mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
  mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'erase-fill' })

  const res = await extractHandler({
    params: { id: '22222222-2222-4222-8222-222222222222' },
    body: {
      projectId: '11111111-1111-4111-8111-111111111111',
      action: 'erase-fill',
      prompt: 'erase badge',
      brushMaskKey: 'mask.png',
    }
  } as any)

  expect(mockCreateQueuedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
    sourceAssetId: '22222222-2222-4222-8222-222222222222',
    action: 'erase-fill',
    createdBy: 'user-1',
  }))
  expect(mockEnqueueAssetIntelligence).toHaveBeenCalledWith(expect.anything(), {
    jobId: 'job-queued',
    projectId: '11111111-1111-4111-8111-111111111111',
    sourceAssetId: '22222222-2222-4222-8222-222222222222',
  })
  expect(res.job.status).toBe('queued')
})
```

- [ ] **Step 6: Run endpoint test to verify it fails**

Run:

```bash
pnpm test:run test/server/api/videoAssetHarness.test.ts
```

Expected: FAIL because `extract.post.ts` still always creates blocked jobs.

- [ ] **Step 7: Update extraction endpoint**

Modify `server/api/agency/video/assets/[id]/extract.post.ts`:

```ts
import { createBlockedExtractionJob, createQueuedExtractionJob } from '~~/server/utils/video-asset-intelligence/db'
import { enqueueAssetIntelligence, getAssetIntelligenceQueue } from '~~/server/utils/video-asset-intelligence/enqueue'
```

Replace job creation block with:

```ts
const input = {
  projectId: body.projectId,
  sourceAssetId,
  bucketItemId: body.bucketItemId ?? null,
  action: body.action,
  prompt: body.prompt ?? null,
  brushMaskKey: body.brushMaskKey ?? null,
  modelId: body.modelId ?? null,
  createdBy: user.id,
}

if (getAssetIntelligenceQueue(event)) {
  const job = await createQueuedExtractionJob(input)
  await enqueueAssetIntelligence(event, { jobId: job.id, projectId: body.projectId, sourceAssetId })
  setResponseStatus(event, 202)
  return { job }
}

const job = await createBlockedExtractionJob(input)
setResponseStatus(event, 202)
return { job }
```

- [ ] **Step 8: Verify and commit**

Run:

```bash
pnpm test:run test/video/assetIntelligenceLifecycle.test.ts test/server/api/videoAssetHarness.test.ts
git diff --check
git add server/utils/video-asset-intelligence/db.ts server/utils/video-asset-intelligence/enqueue.ts server/api/agency/video/assets/[id]/extract.post.ts test/video/assetIntelligenceLifecycle.test.ts test/server/api/videoAssetHarness.test.ts
git commit -m "feat(video-studio): enqueue asset intelligence jobs"
```

Expected: tests PASS; commit created.

---

### Task 2: Worker Scaffold and Deterministic Mask Provider

**Files:**
- Create: `workers/asset-intelligence/src/index.ts`
- Create: `workers/asset-intelligence/src/worker.ts`
- Create: `workers/asset-intelligence/src/providers.ts`
- Create: `workers/asset-intelligence/src/db.ts`
- Create: `workers/asset-intelligence/src/storage.ts`
- Create: `workers/asset-intelligence/package.json`
- Create: `workers/asset-intelligence/tsconfig.json`
- Create: `workers/asset-intelligence/wrangler.toml`
- Test: `test/workers/asset-intelligence/worker.test.ts`
- Test: `test/workers/asset-intelligence/providers.test.ts`

- [ ] **Step 1: Write provider tests**

Create `test/workers/asset-intelligence/providers.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runAssetIntelligenceProvider } from '~~/workers/asset-intelligence/src/providers'

describe('asset intelligence providers', () => {
  it('turns mask-only jobs into a persisted mask derivative without calling AI', async () => {
    const result = await runAssetIntelligenceProvider({
      job: {
        id: 'job-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'mask-only',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        prompt: null,
        brushMaskKey: 'video-asset-masks/project-1/asset-1/mask.png',
      },
      env: { AI: { run: vi.fn() } } as any,
      fetchAssetBytes: vi.fn(),
      copyR2Object: vi.fn().mockResolvedValue({ r2Key: 'video-asset-derivatives/project-1/job-1/mask.png', contentType: 'image/png', size: 128 }),
      uploadJson: vi.fn(),
      uploadBinary: vi.fn(),
    })

    expect(result.derivatives).toEqual([
      expect.objectContaining({
        kind: 'mask-png',
        r2Key: 'video-asset-derivatives/project-1/job-1/mask.png',
      }),
    ])
  })

  it('runs Workers AI analysis jobs and writes analysis JSON', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'hero vehicle, red sand, logo visible' })
    const uploadJson = vi.fn().mockResolvedValue({ r2Key: 'video-asset-derivatives/project-1/job-2/analysis.json', contentType: 'application/json', size: 64 })

    const result = await runAssetIntelligenceProvider({
      job: {
        id: 'job-2',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'asset-analysis',
        modelId: 'workers-ai/kimi-planner',
        provider: 'workers-ai',
        prompt: 'analyze this asset',
        brushMaskKey: null,
      },
      env: { AI: { run } } as any,
      fetchAssetBytes: vi.fn().mockResolvedValue({ dataUri: 'data:image/png;base64,AA==', contentType: 'image/png' }),
      copyR2Object: vi.fn(),
      uploadJson,
      uploadBinary: vi.fn(),
    })

    expect(run).toHaveBeenCalled()
    expect(result.derivatives[0]).toMatchObject({ kind: 'analysis-json' })
  })
})
```

- [ ] **Step 2: Run provider tests to verify they fail**

Run:

```bash
pnpm test:run test/workers/asset-intelligence/providers.test.ts
```

Expected: FAIL because `workers/asset-intelligence/src/providers.ts` does not exist.

- [ ] **Step 3: Implement provider result types and deterministic providers**

Create `workers/asset-intelligence/src/providers.ts`:

```ts
export interface AssetIntelligenceWorkerJob {
  id: string
  projectId: string
  sourceAssetId: string | null
  action: string
  modelId: string
  provider: string
  prompt: string | null
  brushMaskKey: string | null
}

export interface AssetDerivativeOutput {
  kind: 'foreground-png' | 'mask-png' | 'background-png' | 'plate-png' | 'edited-image' | 'layer-package' | 'thumbnail' | 'caption-vtt' | 'analysis-json'
  r2Key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown>
}

export interface ProviderDeps {
  job: AssetIntelligenceWorkerJob
  env: { AI?: { run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<any> } }
  fetchAssetBytes(sourceAssetId: string): Promise<{ dataUri: string; contentType: string }>
  copyR2Object(sourceKey: string, destinationKey: string): Promise<{ r2Key: string; contentType: string; size: number }>
  uploadJson(key: string, value: unknown): Promise<{ r2Key: string; contentType: string; size: number }>
  uploadBinary(key: string, bytes: Uint8Array, contentType: string): Promise<{ r2Key: string; contentType: string; size: number }>
}

export async function runAssetIntelligenceProvider(deps: ProviderDeps): Promise<{ derivatives: AssetDerivativeOutput[] }> {
  const { job } = deps

  if (job.action === 'mask-only') {
    if (!job.brushMaskKey) throw new Error('mask-only requires brushMaskKey')
    const copied = await deps.copyR2Object(job.brushMaskKey, `video-asset-derivatives/${job.projectId}/${job.id}/mask.png`)
    return {
      derivatives: [{
        kind: 'mask-png',
        r2Key: copied.r2Key,
        width: null,
        height: null,
        metadata: { sourceMaskKey: job.brushMaskKey },
      }],
    }
  }

  if (job.action === 'asset-analysis') {
    if (!job.sourceAssetId) throw new Error('asset-analysis requires sourceAssetId')
    if (!deps.env.AI) throw new Error('Workers AI binding unavailable')
    const asset = await deps.fetchAssetBytes(job.sourceAssetId)
    const raw = await deps.env.AI.run('@cf/moonshotai/kimi-k2-instruct', {
      prompt: job.prompt || 'Analyze this marketing asset for objects, text, brand elements, and edit recommendations.',
      image: asset.dataUri,
    }, {
      gateway: { metadata: { projectId: job.projectId, jobId: job.id, modelId: job.modelId } },
    })
    const uploaded = await deps.uploadJson(`video-asset-derivatives/${job.projectId}/${job.id}/analysis.json`, {
      action: job.action,
      modelId: job.modelId,
      raw,
    })
    return {
      derivatives: [{
        kind: 'analysis-json',
        r2Key: uploaded.r2Key,
        width: null,
        height: null,
        metadata: { modelId: job.modelId },
      }],
    }
  }

  throw new Error(`provider execution not configured for ${job.action} (${job.modelId})`)
}
```

- [ ] **Step 4: Write worker orchestration test**

Create `test/workers/asset-intelligence/worker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { processAssetIntelligenceJob } from '~~/workers/asset-intelligence/src/worker'

describe('asset intelligence worker', () => {
  it('marks job running, persists derivatives, then marks succeeded', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({
        id: 'job-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'mask-only',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        prompt: null,
        brushMaskKey: 'mask.png',
      }),
      markRunning: vi.fn(),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn().mockResolvedValue({ id: 'derivative-1' }),
      runProvider: vi.fn().mockResolvedValue({
        derivatives: [{ kind: 'mask-png', r2Key: 'out-mask.png', width: null, height: null, metadata: {} }],
      }),
    }

    await processAssetIntelligenceJob({ jobId: 'job-1', projectId: 'project-1', sourceAssetId: 'asset-1' }, deps)

    expect(deps.markRunning).toHaveBeenCalledWith('job-1')
    expect(deps.createDerivative).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mask-png', r2Key: 'out-mask.png' }))
    expect(deps.markSucceeded).toHaveBeenCalledWith({ id: 'job-1', outputDerivativeIds: ['derivative-1'] })
  })
})
```

- [ ] **Step 5: Implement worker orchestration**

Create `workers/asset-intelligence/src/worker.ts`:

```ts
import type { AssetDerivativeOutput } from './providers'

export interface AssetIntelligenceMessage {
  jobId: string
  projectId: string
  sourceAssetId: string
}

export interface ProcessDeps {
  getJob(id: string): Promise<any | null>
  markRunning(id: string): Promise<unknown>
  markFailed(id: string, errorMessage: string): Promise<unknown>
  markSucceeded(input: { id: string; outputDerivativeIds: string[] }): Promise<unknown>
  createDerivative(input: AssetDerivativeOutput & { sourceAssetId: string | null; projectId: string }): Promise<{ id: string }>
  runProvider(job: any): Promise<{ derivatives: AssetDerivativeOutput[] }>
}

export async function processAssetIntelligenceJob(message: AssetIntelligenceMessage, deps: ProcessDeps): Promise<void> {
  const job = await deps.getJob(message.jobId)
  if (!job) throw new Error(`asset intelligence job ${message.jobId} not found`)

  try {
    await deps.markRunning(job.id)
    const result = await deps.runProvider(job)
    const derivativeIds: string[] = []
    for (const derivative of result.derivatives) {
      const row = await deps.createDerivative({
        ...derivative,
        sourceAssetId: job.sourceAssetId ?? message.sourceAssetId,
        projectId: job.projectId ?? message.projectId,
      })
      derivativeIds.push(row.id)
    }
    await deps.markSucceeded({ id: job.id, outputDerivativeIds: derivativeIds })
  } catch (error: any) {
    await deps.markFailed(job.id, error?.message ?? String(error))
  }
}
```

- [ ] **Step 6: Implement worker entrypoint and config**

Create `workers/asset-intelligence/src/index.ts`:

```ts
import { processAssetIntelligenceJob } from './worker'
import { runAssetIntelligenceProvider } from './providers'
import {
  createDerivative,
  getAssetIntelligenceJob,
  markAssetIntelligenceJobFailed,
  markAssetIntelligenceJobRunning,
  markAssetIntelligenceJobSucceeded,
} from './db'
import { copyR2Object, fetchAssetBytes, uploadBinary, uploadJson } from './storage'

interface Env {
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString: string }
  AI?: { run(model: string, inputs: Record<string, unknown>, options?: any): Promise<any> }
  MEDIA_BUCKET: R2Bucket
}

export default {
  async queue(batch: MessageBatch<{ jobId: string; projectId: string; sourceAssetId: string }>, env: Env): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) (globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL

    for (const msg of batch.messages) {
      try {
        await processAssetIntelligenceJob(msg.body, {
          getJob: getAssetIntelligenceJob,
          markRunning: markAssetIntelligenceJobRunning,
          markFailed: markAssetIntelligenceJobFailed,
          markSucceeded: markAssetIntelligenceJobSucceeded,
          createDerivative,
          runProvider: job => runAssetIntelligenceProvider({
            job,
            env,
            fetchAssetBytes: sourceAssetId => fetchAssetBytes(env.MEDIA_BUCKET, sourceAssetId),
            copyR2Object: (sourceKey, destinationKey) => copyR2Object(env.MEDIA_BUCKET, sourceKey, destinationKey),
            uploadJson: (key, value) => uploadJson(env.MEDIA_BUCKET, key, value),
            uploadBinary: (key, bytes, contentType) => uploadBinary(env.MEDIA_BUCKET, key, bytes, contentType),
          }),
        })
        msg.ack()
      } catch (error) {
        console.error('asset-intelligence.queue.error', msg.body?.jobId, error)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
```

Create `workers/asset-intelligence/package.json`:

```json
{
  "name": "asset-intelligence-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@neondatabase/serverless": "*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "*",
    "typescript": "*",
    "wrangler": "^4.95.0"
  }
}
```

Create `workers/asset-intelligence/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `workers/asset-intelligence/wrangler.toml`:

```toml
name = "xeroflow-asset-intelligence"
main = "src/index.ts"
compatibility_date = "2024-07-11"

[[queues.consumers]]
queue = "asset-intelligence"
max_batch_size = 1
max_batch_timeout = 5

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "agency-files"

[ai]
binding = "AI"
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
pnpm test:run test/workers/asset-intelligence/providers.test.ts test/workers/asset-intelligence/worker.test.ts
pnpm --dir workers/asset-intelligence run typecheck
git diff --check
git add workers/asset-intelligence test/workers/asset-intelligence
git commit -m "feat(video-studio): add asset intelligence worker"
```

Expected: tests PASS; worker typecheck PASS; commit created.

---

### Task 3: Derivative Persistence and Bucket Reuse

**Files:**
- Modify: `server/utils/video-asset-intelligence/db.ts`
- Create: `server/api/agency/video/derivatives/[id]/add-to-bucket.post.ts`
- Modify: `app/components/media/MediaAssetHarness.vue`
- Test: `test/server/api/videoAssetHarness.test.ts`

- [ ] **Step 1: Write failing API test**

Add to `test/server/api/videoAssetHarness.test.ts`:

```ts
const mockGetDerivative = vi.fn()
const mockAddDerivativeToBucket = vi.fn()

// extend DB mock
getAssetDerivative: (...args: unknown[]) => mockGetDerivative(...args),
addDerivativeToProjectBucket: (...args: unknown[]) => mockAddDerivativeToBucket(...args),

const addDerivativeHandler = (await import('~~/server/api/agency/video/derivatives/[id]/add-to-bucket.post')).default

it('adds a derivative output back into a project bucket', async () => {
  mockGetDerivative.mockResolvedValue({
    id: 'derivative-1',
    sourceAssetId: 'asset-1',
    projectId: '11111111-1111-4111-8111-111111111111',
    kind: 'mask-png',
    r2Key: 'video-asset-derivatives/project-1/job-1/mask.png',
    width: null,
    height: null,
    metadata: {},
    createdAt: 'now',
  })
  mockAddDerivativeToBucket.mockResolvedValue({ id: 'item-derivative-1', role: 'mask-layer' })

  const res = await addDerivativeHandler({
    params: { id: 'derivative-1' },
    body: { bucketKind: 'graphics', role: 'mask-layer' },
  } as any)

  expect(mockAddDerivativeToBucket).toHaveBeenCalledWith({
    derivativeId: 'derivative-1',
    projectId: '11111111-1111-4111-8111-111111111111',
    bucketKind: 'graphics',
    role: 'mask-layer',
  })
  expect(res.item.id).toBe('item-derivative-1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run test/server/api/videoAssetHarness.test.ts
```

Expected: FAIL because the derivative bucket route and helpers do not exist.

- [ ] **Step 3: Implement DB helpers**

Add to `server/utils/video-asset-intelligence/db.ts`:

```ts
export async function getAssetDerivative(id: string) {
  const row = await queryOne(`SELECT * FROM video_asset_derivatives WHERE id = $1`, [id])
  return row ? mapDerivativeRow(row) : null
}

export async function createAssetDerivative(input: {
  sourceAssetId: string | null
  projectId: string
  kind: string
  r2Key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown>
}) {
  const row = await queryOne(
    `INSERT INTO video_asset_derivatives (source_asset_id, project_id, kind, r2_key, width, height, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING *`,
    [input.sourceAssetId, input.projectId, input.kind, input.r2Key, input.width, input.height, JSON.stringify(input.metadata ?? {})]
  )
  return mapDerivativeRow(row)
}

export async function addDerivativeToProjectBucket(input: {
  derivativeId: string
  projectId: string
  bucketKind: string
  role: string
}) {
  const row = await queryOne(
    `WITH bucket AS (
       SELECT id FROM video_project_buckets WHERE project_id = $1 AND kind = $2
     ), derivative AS (
       SELECT * FROM video_asset_derivatives WHERE id = $3
     )
     INSERT INTO video_project_bucket_items (bucket_id, asset_id, r2_key, title, role, directive, status)
     SELECT bucket.id, derivative.source_asset_id, derivative.r2_key,
            derivative.kind || ' ' || derivative.id::text,
            $4,
            jsonb_build_object('source', 'video_asset_derivatives', 'derivativeId', derivative.id, 'kind', derivative.kind),
            'ready'
       FROM bucket, derivative
     RETURNING *`,
    [input.projectId, input.bucketKind, input.derivativeId, input.role]
  )
  if (!row) throw new Error(`Could not add derivative ${input.derivativeId} to bucket ${input.bucketKind}`)
  return mapBucketItemRow(row)
}
```

- [ ] **Step 4: Implement route**

Create `server/api/agency/video/derivatives/[id]/add-to-bucket.post.ts`:

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { addDerivativeToProjectBucket, getAssetDerivative } from '~~/server/utils/video-asset-intelligence/db'

const BodySchema = z.object({
  bucketKind: z.enum(['footage', 'stills', 'products', 'logos', 'people', 'backgrounds', 'audio', 'graphics', 'generated', 'exports']).default('graphics'),
  role: z.string().min(1).max(80).default('generated-layer'),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Derivative id is required' })
  const body = BodySchema.parse(await readBody(event))
  const derivative = await getAssetDerivative(id)
  if (!derivative) throw createError({ statusCode: 404, statusMessage: 'Derivative not found' })
  if (!derivative.projectId) throw createError({ statusCode: 400, statusMessage: 'Derivative is not attached to a project' })
  const item = await addDerivativeToProjectBucket({
    derivativeId: id,
    projectId: derivative.projectId,
    bucketKind: body.bucketKind,
    role: body.role,
  })
  setResponseStatus(event, 201)
  return { item }
})
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm test:run test/server/api/videoAssetHarness.test.ts
git diff --check
git add server/utils/video-asset-intelligence/db.ts server/api/agency/video/derivatives/[id]/add-to-bucket.post.ts test/server/api/videoAssetHarness.test.ts
git commit -m "feat(video-studio): reuse asset intelligence derivatives"
```

Expected: tests PASS; commit created.

---

### Task 4: Harness Derivative UX

**Files:**
- Modify: `app/components/media/MediaAssetHarness.vue`
- Modify: `app/pages/agency/audio/projects/[id].vue`
- Test: `test/app/videoAssetHarnessDerivatives.test.ts`

- [ ] **Step 1: Write utility-level UI payload test**

Create `test/app/videoAssetHarnessDerivatives.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { derivativeTimelinePayload } from '~~/app/utils/video/assetDerivativeTimeline'

describe('asset derivative timeline payload', () => {
  it('turns image derivatives into timeline clip payloads', () => {
    expect(derivativeTimelinePayload({
      id: 'derivative-1',
      sourceAssetId: 'asset-1',
      kind: 'edited-image',
      r2Key: 'video-asset-derivatives/project/job/edit.png',
      width: 1080,
      height: 1920,
    })).toEqual({
      assetId: 'asset-1',
      r2Key: 'video-asset-derivatives/project/job/edit.png',
      durationSec: 5,
      title: 'edited-image derivative',
      format: null,
      baseSource: 'still_kenburns',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run test/app/videoAssetHarnessDerivatives.test.ts
```

Expected: FAIL because `app/utils/video/assetDerivativeTimeline.ts` does not exist.

- [ ] **Step 3: Implement derivative payload utility**

Create `app/utils/video/assetDerivativeTimeline.ts`:

```ts
export interface AssetDerivativeTimelineInput {
  id: string
  sourceAssetId: string | null
  kind: string
  r2Key: string
  width: number | null
  height: number | null
}

export function derivativeTimelinePayload(derivative: AssetDerivativeTimelineInput) {
  return {
    assetId: derivative.sourceAssetId,
    r2Key: derivative.r2Key,
    durationSec: 5,
    title: `${derivative.kind} derivative`,
    format: null,
    baseSource: derivative.r2Key.endsWith('.mp4') ? 'uploaded_footage' : 'still_kenburns',
  } as const
}
```

- [ ] **Step 4: Update harness component**

In `app/components/media/MediaAssetHarness.vue`:

Add derivative interface:

```ts
interface AssetDerivative {
  id: string
  sourceAssetId: string | null
  projectId: string | null
  kind: string
  r2Key: string
  width: number | null
  height: number | null
  metadata: Record<string, unknown>
  createdAt: string
}
```

Add emits:

```ts
(event: 'add-derivative-to-timeline', payload: ReturnType<typeof derivativeTimelinePayload>): void
```

Load derivatives when `selectedItem` changes:

```ts
const selectedDerivatives = ref<AssetDerivative[]>([])

async function loadSelectedDerivatives() {
  const assetId = selectedItem.value?.assetId
  if (!assetId) {
    selectedDerivatives.value = []
    return
  }
  const res = await $fetch<{ derivatives: AssetDerivative[] }>(`/api/agency/video/assets/${assetId}/derivatives`)
  selectedDerivatives.value = res.derivatives
}

watch(selectedItemId, () => {
  clearMask()
  maskPreviewFailed.value = false
  void loadSelectedDerivatives()
})
```

Add buttons in the selected asset activity area:

```vue
<div v-if="selectedDerivatives.length" class="mt-2 space-y-1">
  <div v-for="derivative in selectedDerivatives.slice(0, 4)" :key="derivative.id" class="flex items-center gap-2 text-xs">
    <UBadge :label="derivative.kind" size="xs" variant="subtle" color="neutral" />
    <span class="min-w-0 flex-1 truncate text-muted">{{ derivative.r2Key }}</span>
    <UButton icon="i-lucide-list-plus" size="xs" variant="ghost" color="neutral" aria-label="Add derivative to timeline" @click="emit('add-derivative-to-timeline', derivativeTimelinePayload(derivative))" />
  </div>
</div>
```

- [ ] **Step 5: Update project page**

In `app/pages/agency/audio/projects/[id].vue`, add handler:

```ts
function onHarnessDerivativeAddToTimeline(p: { assetId: string | null; r2Key: string; durationSec: number; title: string | null; format: string | null; baseSource: 'uploaded_footage' | 'still_kenburns' }) {
  const streamUrl = p.assetId ? `/api/agency/video/assets/${encodeURIComponent(p.assetId)}/stream` : p.r2Key
  editor.mergeSource(p.r2Key, streamUrl, { durationSec: p.durationSec, assetId: p.assetId, title: p.title, format: p.format })
  editor.addVideoClipAction(p.r2Key, p.durationSec, p.baseSource, editor.currentTime.value, p.assetId)
}
```

Wire event:

```vue
<MediaAssetHarness
  v-if="isAv && videoAssetHarnessEnabled"
  :project-id="projectId"
  @add-to-timeline="onHarnessAddToTimeline"
  @add-derivative-to-timeline="onHarnessDerivativeAddToTimeline"
/>
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm test:run test/app/videoAssetHarnessDerivatives.test.ts test/audio/timelineEditAv.test.ts
env NODE_OPTIONS=--max-old-space-size=16384 fnm exec --using v24.15.0 pnpm run build
git diff --check
git add app/components/media/MediaAssetHarness.vue app/pages/agency/audio/projects/[id].vue app/utils/video/assetDerivativeTimeline.ts test/app/videoAssetHarnessDerivatives.test.ts
git commit -m "feat(video-studio): add derivative reuse controls"
```

Expected: tests PASS; build PASS; commit created.

---

### Task 5: Production Bindings and Deployment Wiring

**Files:**
- Modify: `wrangler.toml`
- Modify: `workers/asset-intelligence/wrangler.toml`
- Modify: `docs/ENVIRONMENT_VARIABLES.md`
- Test: `test/video/assetIntelligenceBindings.test.ts`

- [ ] **Step 1: Write binding documentation test**

Create `test/video/assetIntelligenceBindings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('asset intelligence deployment wiring docs', () => {
  it('documents the queue binding and worker deployment variables', () => {
    const docs = readFileSync('docs/ENVIRONMENT_VARIABLES.md', 'utf8')
    expect(docs).toContain('ASSET_INTELLIGENCE_QUEUE')
    expect(docs).toContain('xeroflow-asset-intelligence')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run test/video/assetIntelligenceBindings.test.ts
```

Expected: FAIL because docs do not mention the new queue/worker yet.

- [ ] **Step 3: Document bindings**

Add to `docs/ENVIRONMENT_VARIABLES.md`:

```md
### Video Asset Intelligence

`ASSET_INTELLIGENCE_QUEUE`
: Cloudflare Queue binding used by the Nuxt app to enqueue AI Producer lift/erase/layer jobs.

`xeroflow-asset-intelligence`
: Cloudflare Worker consumer for the `asset-intelligence` queue. Requires `DATABASE_URL` or `HYPERDRIVE`, `MEDIA_BUCKET`, and the Workers AI `AI` binding.
```

- [ ] **Step 4: Wire main Pages queue producer**

In root `wrangler.toml`, add:

```toml
[[queues.producers]]
binding = "ASSET_INTELLIGENCE_QUEUE"
queue = "asset-intelligence"
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm test:run test/video/assetIntelligenceBindings.test.ts
env NODE_OPTIONS=--max-old-space-size=16384 fnm exec --using v24.15.0 pnpm run build
git diff --check
git add wrangler.toml workers/asset-intelligence/wrangler.toml docs/ENVIRONMENT_VARIABLES.md test/video/assetIntelligenceBindings.test.ts
git commit -m "chore(video-studio): wire asset intelligence queue"
```

Expected: tests PASS; build PASS; commit created.

---

## Verification Checklist

- [ ] Focused unit tests pass:

```bash
pnpm test:run test/video/assetIntelligenceLifecycle.test.ts test/server/api/videoAssetHarness.test.ts test/workers/asset-intelligence/providers.test.ts test/workers/asset-intelligence/worker.test.ts test/app/videoAssetHarnessDerivatives.test.ts test/video/assetIntelligenceBindings.test.ts
```

- [ ] Existing editor regression tests pass:

```bash
pnpm test:run test/audio/timelineEditAv.test.ts test/video/assetBuckets.test.ts test/video/aiAssemblyTimeline.test.ts
```

- [ ] Asset intelligence worker typecheck passes:

```bash
pnpm --dir workers/asset-intelligence run typecheck
```

- [ ] Production build passes:

```bash
env NODE_OPTIONS=--max-old-space-size=16384 fnm exec --using v24.15.0 pnpm run build
```

- [ ] Manual production smoke after deploy:
  - Open `/agency/audio/projects/bfa93ac8-fc95-412c-bae4-81307cb7ede4`.
  - Open AI Producer.
  - Select a generated video/library asset.
  - Draw a highlighter mask.
  - Run `Mask only`.
  - Confirm activity moves from `queued` to `running` to `succeeded`.
  - Confirm derivative appears under selected asset activity.
  - Add derivative to timeline.
  - Press play and confirm the editor still plays the current timeline.

## Self-Review

Spec coverage:
- Executable provider jobs: Tasks 1 and 2.
- Mask/highlighter lift workflow: Tasks 2, 3, and 4.
- Bucket folder/project asset reuse: Task 3.
- Agentic video editing harness foundation: Task 4 extends the harness with outputs that can be used by timeline assembly.
- Cloudflare AI Gateway/Workers AI route: Tasks 1, 2, and 5.
- Enterprise visibility into status/model/prompt: existing commits plus Task 4 derivative status complete the loop.

Gaps intentionally deferred:
- True third-party Replicate/Hugging Face/FAL execution through Cloudflare AI Gateway is kept behind disabled model entries until credentials and exact model schemas are verified in production. The first production cut executes deterministic `mask-only` and Workers AI analysis paths, then fails non-configured actions loudly instead of silently pretending to edit.
- Full video mask tracking across frames is not included in this plan; that needs a separate worker/runtime decision after still-image layer jobs are stable.
