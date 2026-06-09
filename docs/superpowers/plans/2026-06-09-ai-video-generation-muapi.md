# AI Video Generation (muapi) — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dormant Video Studio V2 generation scaffold actually generate clips — image-to-video + text-to-video via muapi.ai — surfacing finished clips in the editor's Video Library, addable to the timeline. Dormant behind flags.

**Architecture:** Additive on the existing scaffold (provider boundary, `video_generation_jobs`, queue/worker, cost/compliance/idempotency). Add a real muapi provider adapter, real model registry entries, async completion via webhook + reconcile cron, output-bytes persistence (finalize in Pages), and the editor UI. No migration.

**Tech Stack:** Nuxt 4 / Nitro, Cloudflare Pages + Queues + R2, Neon Postgres (`pg` via Hyperdrive in the worker), Vitest, Zod, Nuxt UI v4.

**Spec:** `docs/superpowers/specs/2026-06-09-ai-video-generation-muapi-design.md`

---

## File Structure

**Create**
- `server/utils/video-generation/providers/muapiProvider.ts` — muapi adapter (`submit`/`poll`), injected fetch+config.
- `server/utils/video-generation/finalize.ts` — Pages-side `finalizeVideoGenerationJob` (download → R2 → `video_assets` → mark succeeded).
- `server/utils/video-generation/createAsset.ts` — Pages-side `createVideoAsset` insert (mirrors worker `dbCreateVideoAsset`).
- `server/api/agency/video/generation/webhook.post.ts` — signed muapi callback.
- `server/api/agency/video/generation/jobs.get.ts` — project job list for the poller.
- `server/api/cron/video-generation-reconcile.post.ts` — running-past-threshold reconcile.
- `app/utils/videoGenerationForm.ts` — pure form logic (mode→model filter, validation, cost).
- `app/composables/useVideoGenerationJobs.ts` — jobs poller.
- `app/components/media/MediaGeneratePicker.vue` — the Generate slideover.
- Tests: `test/video-generation/{muapiProvider,finalize,webhook,jobsList,reconcile}.test.ts`, `test/app/videoGenerationForm.test.ts`.

**Modify**
- `server/utils/video-generation/modelRegistry.ts` — add real muapi i2v + t2v models with endpoint/param map.
- `server/utils/video-generation/types.ts` — add `muapi?` mapping fields to `VideoGenerationModel`.
- `workers/video-generation/src/worker.ts` — provider map + `running` branch (submit-then-ack for async).
- `workers/video-generation/src/index.ts` — pass `{ mock, muapi }` provider map.
- `nuxt.config.ts` — expose `public.videoGenerationEnabled`.
- `app/pages/agency/audio/projects/[id].vue` — Add-menu "Generate (AI)", wire slideover + poller.
- `app/components/media/MediaVideoLibrary.vue` — surface generation assets + "Add to timeline".
- `workers/pages-cron/src/index.ts` — call the reconcile endpoint on the cron tick.

---

## Task 1: muapi provider adapter

**Files:**
- Create: `server/utils/video-generation/providers/muapiProvider.ts`
- Test: `test/video-generation/muapiProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/video-generation/muapiProvider.test.ts
import { describe, expect, it, vi } from 'vitest'
import { makeMuapiProvider } from '~~/server/utils/video-generation/providers/muapiProvider'

const cfg = { apiKey: 'k-test', baseUrl: 'https://api.muapi.ai/api/v1', webhookUrl: 'https://app.example/api/agency/video/generation/webhook' }

describe('muapi provider', () => {
  it('submit() posts to the model endpoint with x-api-key and returns the request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ request_id: 'req-123' }),
    })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    const submission = await provider.submit({
      jobId: 'job-1', modelId: 'muapi/i2v-kling', mode: 'image-to-video',
      prompt: 'slow dolly in', sourceAssetUrls: ['https://r2.example/still.png'],
      durationSeconds: 5, aspectRatio: '9:16', resolution: '720p',
    })
    expect(submission.providerRequestId).toBe('req-123')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.muapi.ai/api/v1/generate_kling_i2v')
    expect(init.method).toBe('POST')
    expect(init.headers['x-api-key']).toBe('k-test')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ prompt: 'slow dolly in', image_url: 'https://r2.example/still.png', duration: 5, aspect_ratio: '9:16', webhook: cfg.webhookUrl })
  })

  it('submit() throws on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await expect(provider.submit({
      jobId: 'j', modelId: 'muapi/i2v-kling', mode: 'image-to-video', prompt: 'x',
      sourceAssetUrls: ['https://r2.example/s.png'], durationSeconds: 5, aspectRatio: '9:16', resolution: null,
    })).rejects.toThrow(/muapi submit failed: 401/)
  })

  it('poll() maps completed → succeeded with the output url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: 'completed', outputs: ['https://cdn.muapi/out.mp4'], cost: 0.42 }),
    })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    const r = await provider.poll({ providerRequestId: 'req-123', status: 'submitted' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.muapi.ai/api/v1/predictions/req-123/result')
    expect(r).toMatchObject({ status: 'succeeded', outputUrl: 'https://cdn.muapi/out.mp4', actualCostCents: 42 })
  })

  it('poll() maps processing → running and failed → failed', async () => {
    const running = makeMuapiProvider(cfg, (vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'processing' }) })) as any)
    expect(await running.poll({ providerRequestId: 'r', status: 's' })).toMatchObject({ status: 'running', outputUrl: null })
    const failed = makeMuapiProvider(cfg, (vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'failed', error: 'nsfw' }) })) as any)
    expect(await failed.poll({ providerRequestId: 'r', status: 's' })).toMatchObject({ status: 'failed', outputUrl: null, errorMessage: 'nsfw' })
  })

  it('image_url is omitted for text-to-video', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ request_id: 'r' }) })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await provider.submit({ jobId: 'j', modelId: 'muapi/t2v-wan', mode: 'text-to-video', prompt: 'a city at dusk', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.image_url).toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.muapi.ai/api/v1/generate_wan_t2v')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/video-generation/muapiProvider.test.ts`
Expected: FAIL — `makeMuapiProvider` is not exported.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/video-generation/providers/muapiProvider.ts
import type {
  VideoGenerationProvider,
  VideoGenerationProviderRequest,
  VideoGenerationProviderResult,
  VideoGenerationProviderSubmission,
} from './types'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

export interface MuapiConfig {
  apiKey: string
  baseUrl: string       // e.g. https://api.muapi.ai/api/v1
  webhookUrl: string    // public Pages callback URL
}

type FetchLike = typeof fetch

/** Resolve the muapi endpoint slug for a model (from the registry's muapi mapping). */
function endpointFor(modelId: string): string {
  const model = getVideoGenerationModel(modelId)
  const ep = model?.muapi?.endpoint
  if (!ep) throw new Error(`muapi endpoint not configured for model ${modelId}`)
  return ep
}

/** Map muapi status strings to the provider-result status union. */
function mapStatus(s: string): VideoGenerationProviderResult['status'] {
  if (s === 'completed' || s === 'succeeded' || s === 'success') return 'succeeded'
  if (s === 'failed' || s === 'error' || s === 'canceled') return 'failed'
  return 'running'
}

export function makeMuapiProvider(config: MuapiConfig, fetchImpl: FetchLike = fetch): VideoGenerationProvider {
  return {
    async submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission> {
      const endpoint = endpointFor(request.modelId)
      const body: Record<string, unknown> = {
        prompt: request.prompt,
        duration: request.durationSeconds,
        aspect_ratio: request.aspectRatio,
        webhook: config.webhookUrl,
      }
      if (request.resolution) body.resolution = request.resolution
      if (request.mode === 'image-to-video' && request.sourceAssetUrls[0]) {
        body.image_url = request.sourceAssetUrls[0]
      }
      const res = await fetchImpl(`${config.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'x-api-key': config.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`muapi submit failed: ${res.status} ${text}`)
      }
      const json: any = await res.json()
      const requestId = json.request_id ?? json.id
      if (!requestId) throw new Error('muapi submit returned no request id')
      return { providerRequestId: String(requestId), status: 'submitted' }
    },

    async poll(submission: VideoGenerationProviderSubmission): Promise<VideoGenerationProviderResult> {
      const res = await fetchImpl(`${config.baseUrl}/predictions/${submission.providerRequestId}/result`, {
        method: 'GET',
        headers: { 'x-api-key': config.apiKey },
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`muapi poll failed: ${res.status} ${text}`)
      }
      const json: any = await res.json()
      const status = mapStatus(String(json.status ?? 'processing'))
      const outputUrl = status === 'succeeded'
        ? (json.outputs?.[0] ?? json.output_url ?? json.url ?? null)
        : null
      const actualCostCents = typeof json.cost === 'number' ? Math.round(json.cost * 100) : null
      return { status, outputUrl, actualCostCents, errorMessage: json.error ?? null }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/video-generation/muapiProvider.test.ts`
Expected: PASS (5 tests). If `getVideoGenerationModel().muapi` is a type error, do Task 2 Step 3 (type addition) first, then return here.

- [ ] **Step 5: Commit**

```bash
git add server/utils/video-generation/providers/muapiProvider.ts test/video-generation/muapiProvider.test.ts
git commit -m "feat(video-gen): muapi provider adapter (submit/poll, injected fetch)"
```

---

## Task 2: Real model registry entries + muapi mapping type

**Files:**
- Modify: `server/utils/video-generation/types.ts` (add `muapi` field to `VideoGenerationModel`)
- Modify: `server/utils/video-generation/modelRegistry.ts`
- Test: `test/video-generation/modelRegistry.test.ts` (extend)

- [ ] **Step 1: Write the failing test (append to the existing describe)**

```ts
// test/video-generation/modelRegistry.test.ts  — add these cases
import { getVideoGenerationModel, listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

it('exposes a real muapi i2v model with an endpoint mapping', () => {
  const m = getVideoGenerationModel('muapi/i2v-kling')
  expect(m).toBeTruthy()
  expect(m!.provider).toBe('muapi')
  expect(m!.modes).toContain('image-to-video')
  expect(m!.muapi?.endpoint).toBe('generate_kling_i2v')
})

it('exposes a real muapi t2v model and both are selectable', () => {
  const t = getVideoGenerationModel('muapi/t2v-wan')
  expect(t!.provider).toBe('muapi')
  expect(t!.modes).toContain('text-to-video')
  const ids = listSelectableVideoGenerationModels().map((x) => x.id)
  expect(ids).toEqual(expect.arrayContaining(['muapi/i2v-kling', 'muapi/t2v-wan']))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/video-generation/modelRegistry.test.ts`
Expected: FAIL — models not found / `muapi` not on type.

- [ ] **Step 3: Add the `muapi` mapping field to the model type**

In `server/utils/video-generation/types.ts`, inside `interface VideoGenerationModel`, add after `defaultEnabled: boolean`:

```ts
  /** muapi gateway mapping — present only for provider==='muapi' models. */
  muapi?: {
    endpoint: string            // muapi model endpoint slug, e.g. 'generate_kling_i2v'
  }
```

- [ ] **Step 4: Add the two real models**

In `server/utils/video-generation/modelRegistry.ts`, add these entries to the `MODELS` array (before the `gateway/i2v-dormant` entry). Also update `listVideoGenerationModels()` map to preserve `muapi` (it already spreads `...model`, so `muapi` is preserved — no change needed):

```ts
  {
    id: 'muapi/i2v-kling',
    provider: 'muapi',
    displayName: 'Kling Image-to-Video',
    modes: ['image-to-video'],
    allowedSubjectTypes: ['vehicle', 'non_vehicle'],
    requiresApprovedSourceAsset: true,
    supportsNativeAudio: false,
    durationsSeconds: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    estimatedCostCents: 45,
    costUnit: 'second',
    safetyClass: 'vehicle_i2v_safe',
    defaultEnabled: true,
    muapi: { endpoint: 'generate_kling_i2v' },
  },
  {
    id: 'muapi/t2v-wan',
    provider: 'muapi',
    displayName: 'Wan Text-to-Video',
    modes: ['text-to-video'],
    allowedSubjectTypes: ['non_vehicle'],
    requiresApprovedSourceAsset: false,
    supportsNativeAudio: false,
    durationsSeconds: [5],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p'],
    estimatedCostCents: 180,
    costUnit: 'generation',
    safetyClass: 'non_vehicle_t2v',
    defaultEnabled: true,
    muapi: { endpoint: 'generate_wan_t2v' },
  },
```

> NOTE: `endpoint` slugs (`generate_kling_i2v`, `generate_wan_t2v`) and `estimatedCostCents` are the muapi values to **verify-live** against muapi's model catalogue before flipping the flag. They are encapsulated in the registry; correcting them is a one-line change.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/video-generation/modelRegistry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/video-generation/types.ts server/utils/video-generation/modelRegistry.ts test/video-generation/modelRegistry.test.ts
git commit -m "feat(video-gen): seed real muapi i2v/t2v models with endpoint mapping"
```

---

## Task 3: Pages-side asset insert + finalize (download → R2 → asset → succeeded)

**Files:**
- Create: `server/utils/video-generation/createAsset.ts`
- Create: `server/utils/video-generation/finalize.ts`
- Test: `test/video-generation/finalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/video-generation/finalize.test.ts
import { describe, expect, it, vi } from 'vitest'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'

const job = { id: 'job-1', tenantId: 'agency', projectId: 'p1', createdBy: 'u1', aspectRatio: '9:16', durationSeconds: 5 } as unknown as VideoGenerationJob

describe('finalizeVideoGenerationJob', () => {
  it('downloads the output, stores it in R2, creates an asset, and marks succeeded', async () => {
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: 'video-generation/agency/job-1/output.mp4' }),
      markSucceeded: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://cdn/out.mp4', actualCostCents: 42 }, deps as any)
    expect(deps.fetchImpl).toHaveBeenCalledWith('https://cdn/out.mp4')
    expect(deps.uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'video-generation/agency/job-1/output.mp4', 'video/mp4', expect.any(Object))
    expect(deps.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', outputAssetId: 'asset-1', actualCostCents: 42 }))
    expect(result.status).toBe('succeeded')
  })

  it('throws (so the caller can mark failed) when the output download fails', async () => {
    const deps = { fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }), uploadFile: vi.fn(), createVideoAsset: vi.fn(), markSucceeded: vi.fn() }
    await expect(finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://cdn/out.mp4', actualCostCents: null }, deps as any)).rejects.toThrow(/download failed: 404/)
    expect(deps.uploadFile).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/video-generation/finalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `createAsset.ts`**

```ts
// server/utils/video-generation/createAsset.ts
import { queryOne } from '~~/server/utils/db'

export async function createVideoAsset(input: {
  clientId: string | null
  createdBy: string
  title: string | null
  sourceProjectId: string | null
  r2Key: string
  format: string
  durationSec: number | null
}): Promise<{ id: string; r2Key: string }> {
  const row = await queryOne<{ id: string; r2_key: string }>(
    `INSERT INTO video_assets
       (client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,NULL,NULL,$7)
     RETURNING id, r2_key`,
    [input.clientId, input.createdBy, input.title, input.sourceProjectId, input.r2Key, input.format, input.durationSec]
  )
  if (!row) throw new Error('failed to create video asset')
  return { id: row.id, r2Key: row.r2_key }
}
```

- [ ] **Step 4: Write `finalize.ts`**

```ts
// server/utils/video-generation/finalize.ts
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'
import type { VideoGenerationProviderResult } from '~~/server/utils/video-generation/providers/types'
import { uploadFile } from '~~/server/utils/storage'
import { createVideoAsset } from '~~/server/utils/video-generation/createAsset'
import { markVideoGenerationJobSucceeded } from '~~/server/utils/video-generation/jobs'

export interface FinalizeDeps {
  fetchImpl: typeof fetch
  uploadFile: typeof uploadFile
  createVideoAsset: typeof createVideoAsset
  markSucceeded: typeof markVideoGenerationJobSucceeded
}

const defaultDeps: FinalizeDeps = { fetchImpl: fetch, uploadFile, createVideoAsset, markSucceeded: markVideoGenerationJobSucceeded }

/** Download the provider output, store it in R2, create a video_asset row, and mark the job succeeded.
 *  Throws on download failure so callers (webhook/reconcile) can mark the job failed. */
export async function finalizeVideoGenerationJob(
  job: VideoGenerationJob,
  result: VideoGenerationProviderResult,
  deps: FinalizeDeps = defaultDeps
): Promise<VideoGenerationJob> {
  if (!result.outputUrl) throw new Error('finalize called without an output url')
  const res = await deps.fetchImpl(result.outputUrl)
  if (!res.ok) throw new Error(`output download failed: ${(res as any).status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const r2Key = `video-generation/${job.tenantId}/${job.id}/output.mp4`
  await deps.uploadFile(bytes, r2Key, 'video/mp4', { projectId: job.projectId, jobId: job.id })
  const asset = await deps.createVideoAsset({
    clientId: job.tenantId === 'agency' ? null : job.tenantId,
    createdBy: job.createdBy,
    title: `Generated video ${job.id}`,
    sourceProjectId: job.projectId,
    r2Key,
    format: job.aspectRatio,
    durationSec: job.durationSeconds,
  })
  return deps.markSucceeded({
    id: job.id,
    providerStatus: result.status,
    providerResultUrl: result.outputUrl,
    outputAssetId: asset.id,
    outputR2Key: asset.r2Key,
    actualCostCents: result.actualCostCents,
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/video-generation/finalize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/utils/video-generation/createAsset.ts server/utils/video-generation/finalize.ts test/video-generation/finalize.test.ts
git commit -m "feat(video-gen): Pages-side finalize (download->R2->asset->succeeded)"
```

---

## Task 4: Worker — provider map + async 'running' branch

**Files:**
- Modify: `workers/video-generation/src/worker.ts`
- Modify: `workers/video-generation/src/index.ts`
- Test: `test/video-generation/worker.test.ts` (extend)

- [ ] **Step 1: Write the failing tests (append cases; update `deps()` to a provider map)**

Replace the `provider:` line in the existing `deps()` helper with a `providers` map, and add cases:

```ts
// in deps(): replace `provider: {...}` with:
    providers: {
      mock: {
        submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
        poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://provider.example/output.mp4', actualCostCents: 123 }),
      },
    },

// new cases:
it('leaves async jobs running (no finalize) when poll returns running', async () => {
  const d = deps({ ...baseJob, provider: 'muapi', modelId: 'muapi/i2v-kling' }, {
    providers: {
      muapi: {
        submit: vi.fn().mockResolvedValue({ providerRequestId: 'req-9', status: 'submitted' }),
        poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }),
      },
    },
  })
  const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
  expect(result).toEqual({ skipped: false, status: 'running' })
  expect(d.markRunning).toHaveBeenCalledWith('job-1', 'req-9')
  expect(d.markSucceeded).not.toHaveBeenCalled()
  expect(d.createOutputAsset).not.toHaveBeenCalled()
})

it('selects the provider by job.provider', async () => {
  const d = deps({ ...baseJob, provider: 'muapi', modelId: 'muapi/i2v-kling' }, {
    providers: {
      mock: { submit: vi.fn(), poll: vi.fn() },
      muapi: { submit: vi.fn().mockResolvedValue({ providerRequestId: 'req-9', status: 'submitted' }), poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }) },
    },
  })
  await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
  expect(d.providers.muapi.submit).toHaveBeenCalled()
  expect(d.providers.mock.submit).not.toHaveBeenCalled()
})
```

Update the existing `markRunning` assertion `expect(d.markRunning).toHaveBeenCalledWith('job-1')` to `expect(d.markRunning).toHaveBeenCalledWith('job-1', 'provider-job-1')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/video-generation/worker.test.ts`
Expected: FAIL — `providers` not used; `running` status not returned.

- [ ] **Step 3: Update `worker.ts`**

In `workers/video-generation/src/worker.ts`: change `ProcessVideoGenerationResult`, `ProcessVideoGenerationDeps`, and the body:

```ts
// types
export type ProcessVideoGenerationResult =
  | { skipped: true; reason: 'missing_job' | 'terminal_or_running' }
  | { skipped: false; status: 'succeeded' | 'failed' | 'running' }

// deps: replace `provider: VideoGenerationProvider` with:
  markRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob>
  providers: Record<string, VideoGenerationProvider>
```

Replace the `try { … }` body with:

```ts
  try {
    const provider = deps.providers[job.provider]
    if (!provider) {
      await deps.markFailed(job.id, `no provider registered for '${job.provider}'`)
      return { skipped: false, status: 'failed' }
    }
    const submission = await provider.submit({
      jobId: job.id, modelId: job.modelId, mode: job.mode, prompt: job.prompt,
      sourceAssetUrls: job.sourceAssetIds, durationSeconds: job.durationSeconds,
      aspectRatio: job.aspectRatio, resolution: job.resolution,
    })
    await deps.markRunning(job.id, submission.providerRequestId)
    const result = await provider.poll(submission)
    if (result.status === 'running') {
      return { skipped: false, status: 'running' }   // webhook/reconcile finalizes
    }
    if (result.status !== 'succeeded' || !result.outputUrl) {
      await deps.markFailed(job.id, result.errorMessage || `provider returned ${result.status}`)
      return { skipped: false, status: 'failed' }
    }
    const asset = await deps.createOutputAsset(job, result)
    await deps.markSucceeded({
      id: job.id, providerStatus: result.status, providerResultUrl: result.outputUrl,
      outputAssetId: asset.id, outputR2Key: asset.r2Key, actualCostCents: result.actualCostCents,
    })
    return { skipped: false, status: 'succeeded' }
  } catch (error) {
    await deps.markFailed(job.id, safeErrorMessage(error))
    return { skipped: false, status: 'failed' }
  }
```

Remove the now-unused `markRunning(job.id)` call that was before the submit (the new code calls `markRunning(job.id, submission.providerRequestId)` after submit).

- [ ] **Step 4: Update `index.ts` to pass the provider map**

In `workers/video-generation/src/index.ts`: replace `provider: mockVideoGenerationProvider,` in the `processVideoGenerationJob` deps with:

```ts
        markRunning: dbMarkVideoGenerationJobRunning,
        providers: {
          mock: mockVideoGenerationProvider,
          muapi: makeMuapiProvider(
            {
              apiKey: env.MUAPI_API_KEY ?? '',
              baseUrl: env.MUAPI_BASE_URL ?? 'https://api.muapi.ai/api/v1',
              webhookUrl: env.MUAPI_WEBHOOK_URL ?? '',
            },
            fetch,
          ),
        },
```

Add imports at the top of `index.ts`:

```ts
import { makeMuapiProvider } from '../../../server/utils/video-generation/providers/muapiProvider'
```

And extend the `Env` interface with: `MUAPI_API_KEY?: string; MUAPI_BASE_URL?: string; MUAPI_WEBHOOK_URL?: string`.
Update `dbMarkVideoGenerationJobRunning` in `workers/video-generation/src/db.ts` to accept an optional `providerRequestId` and `COALESCE` it (mirror the Pages `markVideoGenerationJobRunning` signature):

```ts
export async function dbMarkVideoGenerationJobRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `UPDATE video_generation_jobs
     SET status = 'running', provider_request_id = COALESCE($2, provider_request_id),
         provider_status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, providerRequestId ?? null]
  )
  if (!row) throw new Error(`video generation job ${id} not found`)
  return mapJob(row)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/video-generation/worker.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add workers/video-generation/src/worker.ts workers/video-generation/src/index.ts workers/video-generation/src/db.ts test/video-generation/worker.test.ts
git commit -m "feat(video-gen): worker provider map + async running branch"
```

---

## Task 5: Webhook endpoint (signed muapi callback)

**Files:**
- Create: `server/utils/video-generation/webhookAuth.ts`
- Create: `server/api/agency/video/generation/webhook.post.ts`
- Test: `test/video-generation/webhook.test.ts`

- [ ] **Step 1: Write the failing test (signature helper — pure, unit-testable)**

```ts
// test/video-generation/webhook.test.ts
import { describe, expect, it } from 'vitest'
import { verifyMuapiSignature, muapiSignature } from '~~/server/utils/video-generation/webhookAuth'

describe('muapi webhook signature', () => {
  it('accepts a correct HMAC-SHA256 signature and rejects a wrong one', async () => {
    const secret = 's3cret'
    const raw = JSON.stringify({ request_id: 'req-1', status: 'completed' })
    const sig = await muapiSignature(raw, secret)
    expect(await verifyMuapiSignature(raw, sig, secret)).toBe(true)
    expect(await verifyMuapiSignature(raw, 'deadbeef', secret)).toBe(false)
    expect(await verifyMuapiSignature(raw, sig, 'wrong-secret')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/video-generation/webhook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the signature helper (Web Crypto, Workers-compatible)**

```ts
// server/utils/video-generation/webhookAuth.ts
async function hmacHex(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function muapiSignature(raw: string, secret: string): Promise<string> {
  return hmacHex(raw, secret)
}

export async function verifyMuapiSignature(raw: string, provided: string, secret: string): Promise<boolean> {
  if (!provided || !secret) return false
  const expected = await hmacHex(raw, secret)
  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}
```

- [ ] **Step 4: Write the webhook endpoint**

```ts
// server/api/agency/video/generation/webhook.post.ts
import { verifyMuapiSignature } from '~~/server/utils/video-generation/webhookAuth'
import { queryOne } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const raw = await readRawBody(event)
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  const sig = getHeader(event, 'x-muapi-signature') ?? ''
  const ok = await verifyMuapiSignature(String(raw), sig, process.env.MUAPI_WEBHOOK_SECRET ?? '')
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })

  const payload = JSON.parse(String(raw))
  const requestId = payload.request_id ?? payload.id
  if (!requestId) throw createError({ statusCode: 400, statusMessage: 'Missing request id' })

  const row = await queryOne(`SELECT * FROM video_generation_jobs WHERE provider_request_id = $1`, [String(requestId)])
  if (!row) return { ok: true, ignored: 'unknown_request' }
  const job = mapVideoGenerationJobRow(row)
  if (job.status === 'succeeded' || job.status === 'failed') return { ok: true, ignored: 'already_terminal' }

  const status = String(payload.status ?? 'processing')
  const isSuccess = status === 'completed' || status === 'succeeded' || status === 'success'
  const outputUrl = payload.outputs?.[0] ?? payload.output_url ?? payload.url ?? null

  if (!isSuccess || !outputUrl) {
    await markVideoGenerationJobFailed(job.id, payload.error ?? `provider status ${status}`)
    return { ok: true, status: 'failed' }
  }
  try {
    await finalizeVideoGenerationJob(job, {
      status: 'succeeded', outputUrl,
      actualCostCents: typeof payload.cost === 'number' ? Math.round(payload.cost * 100) : null,
    })
  } catch (e: any) {
    await markVideoGenerationJobFailed(job.id, `finalize failed: ${e?.message ?? String(e)}`)
    return { ok: true, status: 'failed' }
  }
  return { ok: true, status: 'succeeded' }
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/video-generation/webhook.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/video-generation/webhookAuth.ts server/api/agency/video/generation/webhook.post.ts test/video-generation/webhook.test.ts
git commit -m "feat(video-gen): signed muapi webhook -> finalize"
```

---

## Task 6: Project jobs-list endpoint

**Files:**
- Create: `server/api/agency/video/generation/jobs.get.ts`
- Modify: `server/utils/video-generation/jobs.ts` (add `listVideoGenerationJobsForProject`)
- Test: `test/video-generation/jobsList.test.ts`

- [ ] **Step 1: Write the failing test (pure mapper list)**

```ts
// test/video-generation/jobsList.test.ts
import { describe, expect, it } from 'vitest'
import { mapVideoGenerationJobRow } from '~~/server/utils/video-generation/jobs'

describe('jobs list mapping', () => {
  it('maps rows for the project list (status + output asset surfaced)', () => {
    const job = mapVideoGenerationJobRow({
      id: 'j1', tenant_id: 'agency', project_id: 'p1', created_by: 'u1', status: 'succeeded',
      mode: 'image-to-video', model_id: 'muapi/i2v-kling', provider: 'muapi', prompt: 'x',
      source_asset_ids: '[]', duration_seconds: 5, aspect_ratio: '9:16', resolution: '720p',
      subject_type: 'vehicle', compliance_status: 'vehicle_i2v', compliance_reasons: '[]',
      estimated_cost_cents: 225, idempotency_key: 'k', output_asset_id: 'a1', output_r2_key: 'r2/k',
      created_at: 't', updated_at: 't',
    })
    expect(job).toMatchObject({ id: 'j1', status: 'succeeded', outputAssetId: 'a1', modelId: 'muapi/i2v-kling' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `npx vitest run test/video-generation/jobsList.test.ts`
Expected: PASS already (mapper exists) — this locks the row shape the endpoint depends on. (If it fails, the row keys are wrong; fix the test row.)

- [ ] **Step 3: Add the list query to `jobs.ts`**

Append to `server/utils/video-generation/jobs.ts`:

```ts
import { queryRows } from '~~/server/utils/db'

export async function listVideoGenerationJobsForProject(projectId: string, limit = 50): Promise<VideoGenerationJob[]> {
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit]
  )
  return rows.map(mapVideoGenerationJobRow)
}
```

(Adjust the existing `import { queryOne } from '~~/server/utils/db'` line to `import { queryOne, queryRows } from '~~/server/utils/db'` instead of adding a second import.)

- [ ] **Step 4: Write the endpoint**

```ts
// server/api/agency/video/generation/jobs.get.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { listVideoGenerationJobsForProject } from '~~/server/utils/video-generation/jobs'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  await requireWriteAccess(event)
  const projectId = String(getQuery(event).projectId ?? '')
  if (!projectId) throw createError({ statusCode: 400, statusMessage: 'projectId required' })
  const jobs = await listVideoGenerationJobsForProject(projectId)
  return { jobs }
})
```

- [ ] **Step 5: Run + Commit**

Run: `npx vitest run test/video-generation/jobsList.test.ts`
Expected: PASS.

```bash
git add server/api/agency/video/generation/jobs.get.ts server/utils/video-generation/jobs.ts test/video-generation/jobsList.test.ts
git commit -m "feat(video-gen): project jobs-list endpoint for the editor poller"
```

---

## Task 7: Reconcile cron (safety net for missed webhooks)

**Files:**
- Create: `server/utils/video-generation/reconcile.ts`
- Create: `server/api/cron/video-generation-reconcile.post.ts`
- Modify: `workers/pages-cron/src/index.ts`
- Test: `test/video-generation/reconcile.test.ts`

- [ ] **Step 1: Write the failing test (pure reconcile core)**

```ts
// test/video-generation/reconcile.test.ts
import { describe, expect, it, vi } from 'vitest'
import { reconcileRunningJob } from '~~/server/utils/video-generation/reconcile'
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'

const job = { id: 'j1', tenantId: 'agency', projectId: 'p1', createdBy: 'u1', provider: 'muapi', modelId: 'muapi/i2v-kling', providerRequestId: 'req-1', aspectRatio: '9:16', durationSeconds: 5 } as unknown as VideoGenerationJob

describe('reconcileRunningJob', () => {
  it('finalizes when the provider now reports succeeded', async () => {
    const deps = {
      providers: { muapi: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://cdn/o.mp4', actualCostCents: 30 }) } },
      finalize: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
      markFailed: vi.fn(),
    }
    const r = await reconcileRunningJob(job, deps as any)
    expect(deps.finalize).toHaveBeenCalled()
    expect(r).toBe('succeeded')
  })

  it('leaves still-running jobs untouched', async () => {
    const deps = { providers: { muapi: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }) } }, finalize: vi.fn(), markFailed: vi.fn() }
    expect(await reconcileRunningJob(job, deps as any)).toBe('running')
    expect(deps.finalize).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/video-generation/reconcile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `reconcile.ts`**

```ts
// server/utils/video-generation/reconcile.ts
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'
import type { VideoGenerationProvider } from '~~/server/utils/video-generation/providers/types'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import { markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'

export interface ReconcileDeps {
  providers: Record<string, VideoGenerationProvider>
  finalize: typeof finalizeVideoGenerationJob
  markFailed: typeof markVideoGenerationJobFailed
}

export async function reconcileRunningJob(job: VideoGenerationJob, deps: ReconcileDeps): Promise<'succeeded' | 'failed' | 'running' | 'skipped'> {
  const provider = deps.providers[job.provider]
  if (!provider || !job.providerRequestId) return 'skipped'
  const result = await provider.poll({ providerRequestId: job.providerRequestId, status: job.providerStatus ?? 'running' })
  if (result.status === 'running') return 'running'
  if (result.status !== 'succeeded' || !result.outputUrl) {
    await deps.markFailed(job.id, result.errorMessage || `reconcile: provider ${result.status}`)
    return 'failed'
  }
  await deps.finalize(job, result)
  return 'succeeded'
}
```

- [ ] **Step 4: Write the cron endpoint**

```ts
// server/api/cron/video-generation-reconcile.post.ts
import { queryRows } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import { makeMuapiProvider } from '~~/server/utils/video-generation/providers/muapiProvider'
import { reconcileRunningJob } from '~~/server/utils/video-generation/reconcile'

export default defineEventHandler(async (event) => {
  if (getHeader(event, 'x-cron-secret') !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    return { ran: false, reason: 'disabled' }
  }
  const muapi = makeMuapiProvider({
    apiKey: process.env.MUAPI_API_KEY ?? '',
    baseUrl: process.env.MUAPI_BASE_URL ?? 'https://api.muapi.ai/api/v1',
    webhookUrl: process.env.MUAPI_WEBHOOK_URL ?? '',
  })
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs
     WHERE status = 'running' AND started_at < now() - interval '2 minutes'
     ORDER BY started_at ASC LIMIT 25`
  )
  const deps = { providers: { muapi }, finalize: finalizeVideoGenerationJob, markFailed: markVideoGenerationJobFailed }
  let succeeded = 0, failed = 0, running = 0
  for (const row of rows) {
    const outcome = await reconcileRunningJob(mapVideoGenerationJobRow(row), deps).catch(() => 'skipped' as const)
    if (outcome === 'succeeded') succeeded++
    else if (outcome === 'failed') failed++
    else if (outcome === 'running') running++
  }
  return { ran: true, succeeded, failed, running, checked: rows.length }
})
```

- [ ] **Step 5: Wire into pages-cron**

In `workers/pages-cron/src/index.ts`, find where other `/api/cron/*` endpoints are POSTed on the scheduled tick and add an identical call to `/api/cron/video-generation-reconcile` with the `x-cron-secret` header. (Match the existing fetch pattern in that file exactly — same base URL + headers.)

- [ ] **Step 6: Run + Commit**

Run: `npx vitest run test/video-generation/reconcile.test.ts`
Expected: PASS.

```bash
git add server/utils/video-generation/reconcile.ts server/api/cron/video-generation-reconcile.post.ts workers/pages-cron/src/index.ts test/video-generation/reconcile.test.ts
git commit -m "feat(video-gen): reconcile cron for missed muapi webhooks"
```

---

## Task 8: Public runtime flag

**Files:**
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Add the flag**

In `nuxt.config.ts`, under `runtimeConfig.public`, add (mirroring the existing `videoStudioEnabled`):

```ts
      videoGenerationEnabled: process.env.VIDEO_GENERATION_ENABLED === 'true',
```

- [ ] **Step 2: Verify type/build**

Run: `npx vitest run test/audio/videoProfiles.test.ts`
Expected: PASS (smoke — config still loads).

- [ ] **Step 3: Commit**

```bash
git add nuxt.config.ts
git commit -m "feat(video-gen): expose videoGenerationEnabled public flag"
```

---

## Task 9: Pure form logic (`videoGenerationForm.ts`)

**Files:**
- Create: `app/utils/videoGenerationForm.ts`
- Test: `test/app/videoGenerationForm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/app/videoGenerationForm.test.ts
import { describe, expect, it } from 'vitest'
import { modelsForMode, validateGenerationForm, costPreviewCents } from '~~/app/utils/videoGenerationForm'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

const models = listSelectableVideoGenerationModels()

describe('videoGenerationForm', () => {
  it('filters models by mode', () => {
    expect(modelsForMode(models, 'image-to-video').map((m) => m.id)).toContain('muapi/i2v-kling')
    expect(modelsForMode(models, 'text-to-video').map((m) => m.id)).toContain('muapi/t2v-wan')
    expect(modelsForMode(models, 'image-to-video').map((m) => m.id)).not.toContain('muapi/t2v-wan')
  })

  it('requires a prompt, and a source asset for image-to-video', () => {
    const i2v = models.find((m) => m.id === 'muapi/i2v-kling')!
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: '', sourceAssetId: null, durationSeconds: 5 }).valid).toBe(false)
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: 'go', sourceAssetId: null, durationSeconds: 5 }).errors).toContain('A source image is required for image-to-video.')
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: 'go', sourceAssetId: 'a1', durationSeconds: 5 }).valid).toBe(true)
  })

  it('computes cost preview using the model cost unit', () => {
    const i2v = models.find((m) => m.id === 'muapi/i2v-kling')!  // 45c/second
    const t2v = models.find((m) => m.id === 'muapi/t2v-wan')!    // 180c/generation
    expect(costPreviewCents(i2v, 10)).toBe(450)
    expect(costPreviewCents(t2v, 5)).toBe(180)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/app/videoGenerationForm.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// app/utils/videoGenerationForm.ts
import type { VideoGenerationModel, VideoGenerationMode } from '~~/server/utils/video-generation/types'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'

export function modelsForMode(models: VideoGenerationModel[], mode: VideoGenerationMode): VideoGenerationModel[] {
  return models.filter((m) => m.modes.includes(mode))
}

export function costPreviewCents(model: VideoGenerationModel, durationSeconds: number): number {
  return estimateVideoGenerationCostCents(model, durationSeconds)
}

export interface GenerationFormInput {
  mode: VideoGenerationMode
  model: VideoGenerationModel | null
  prompt: string
  sourceAssetId: string | null
  durationSeconds: number
}

export function validateGenerationForm(input: GenerationFormInput): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!input.model) errors.push('Select a model.')
  if (!input.prompt.trim()) errors.push('A prompt is required.')
  if (input.mode === 'image-to-video' && !input.sourceAssetId) errors.push('A source image is required for image-to-video.')
  if (input.model && !input.model.durationsSeconds.includes(input.durationSeconds)) errors.push('Pick a supported duration.')
  return { valid: errors.length === 0, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/app/videoGenerationForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/videoGenerationForm.ts test/app/videoGenerationForm.test.ts
git commit -m "feat(video-gen): pure generation-form logic (mode filter, validate, cost)"
```

---

## Task 10: Jobs poller composable

**Files:**
- Create: `app/composables/useVideoGenerationJobs.ts`

- [ ] **Step 1: Write the composable** (no separate test — it is thin glue over `$fetch`; logic lives in Task 9 / `nextPollDelay`)

```ts
// app/composables/useVideoGenerationJobs.ts
import { ref } from 'vue'

export interface VideoGenerationJobView {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
  mode: string
  prompt: string
  outputAssetId: string | null
  outputR2Key: string | null
  errorMessage: string | null
}

export function useVideoGenerationJobs(projectId: string) {
  const jobs = ref<VideoGenerationJobView[]>([])
  let timer: ReturnType<typeof setTimeout> | null = null

  async function refresh() {
    try {
      const res = await $fetch<{ jobs: VideoGenerationJobView[] }>(`/api/agency/video/generation/jobs`, { query: { projectId } })
      jobs.value = res?.jobs ?? []
    } catch { /* surfaced via UI emptiness */ }
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    const active = jobs.value.some((j) => j.status === 'queued' || j.status === 'running')
    if (!active) return
    timer = setTimeout(async () => { await refresh(); schedule() }, 2500)
  }

  async function start() { await refresh(); schedule() }
  function stop() { if (timer) clearTimeout(timer); timer = null }

  return { jobs, refresh, start, stop }
}
```

- [ ] **Step 2: Typecheck smoke + Commit**

Run: `npx vitest run test/app/videoGenerationForm.test.ts` (ensures app/ alias still resolves)
Expected: PASS.

```bash
git add app/composables/useVideoGenerationJobs.ts
git commit -m "feat(video-gen): jobs poller composable"
```

---

## Task 11: Generate slideover (`MediaGeneratePicker.vue`)

**Files:**
- Create: `app/components/media/MediaGeneratePicker.vue`

> **Sub-skill:** invoke `frontend-design` before writing the form markup (project rule: any form-touching work). Apply UFormField labels, USelectMenu (never empty-string values — use mode/model ids), grid-cols-2 paired controls.

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
// MediaGeneratePicker.vue — USlideover to generate an AI video clip (text-to-video
// or image-to-video) via the gated generation API. Emits `submitted(jobId)` so the
// page can start polling; the finished asset surfaces in the Video Library.
import { ref, computed } from 'vue'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { modelsForMode, validateGenerationForm, costPreviewCents } from '~~/app/utils/videoGenerationForm'
import type { VideoGenerationMode } from '~~/server/utils/video-generation/types'

const props = defineProps<{
  open: boolean
  projectId: string
  /** stills already on the timeline: { assetId, label } — assetId must be a video_assets id */
  timelineStills: { assetId: string; label: string }[]
  /** default aspect from the project format, e.g. '9:16' */
  defaultAspect: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'submitted', jobId: string): void }>()

const toast = useToast()
const allModels = listSelectableVideoGenerationModels()

const mode = ref<VideoGenerationMode>('image-to-video')
const models = computed(() => modelsForMode(allModels, mode.value))
const modelId = ref<string>(models.value[0]?.id ?? '')
const model = computed(() => allModels.find((m) => m.id === modelId.value) ?? null)
const prompt = ref('')
const sourceAssetId = ref<string | null>(null)
const subjectType = ref<'vehicle' | 'non_vehicle' | 'unknown'>('unknown')
const durationSeconds = ref<number>(model.value?.durationsSeconds[0] ?? 5)
const submitting = ref(false)

const MODE_OPTIONS = [
  { label: 'Image → video', value: 'image-to-video' },
  { label: 'Text → video', value: 'text-to-video' },
]
const SUBJECT_OPTIONS = [
  { label: 'Unknown', value: 'unknown' },
  { label: 'Vehicle', value: 'vehicle' },
  { label: 'Non-vehicle', value: 'non_vehicle' },
]

const validation = computed(() => validateGenerationForm({ mode: mode.value, model: model.value, prompt: prompt.value, sourceAssetId: sourceAssetId.value, durationSeconds: durationSeconds.value }))
const estCostCents = computed(() => (model.value ? costPreviewCents(model.value, durationSeconds.value) : 0))

function onModeChange() {
  modelId.value = models.value[0]?.id ?? ''
  durationSeconds.value = model.value?.durationsSeconds[0] ?? 5
  if (mode.value === 'text-to-video') sourceAssetId.value = null
}

async function submit() {
  if (!validation.value.valid || !model.value) return
  submitting.value = true
  try {
    const res = await $fetch<{ job: { id: string } }>(`/api/agency/video/generation/jobs`, {
      method: 'POST',
      body: {
        projectId: props.projectId,
        mode: mode.value,
        modelId: model.value.id,
        prompt: prompt.value,
        sourceAssetIds: sourceAssetId.value ? [sourceAssetId.value] : [],
        durationSeconds: durationSeconds.value,
        aspectRatio: props.defaultAspect,
        subjectType: subjectType.value,
        idempotencyKey: crypto.randomUUID(),
      },
    })
    toast.add({ title: 'Generation queued', description: 'Your clip will appear in the Library when ready.', color: 'success' })
    emit('submitted', res.job.id)
    emit('update:open', false)
  } catch (e: any) {
    const reasons = e?.data?.data?.reasons as string[] | undefined
    toast.add({ title: 'Could not start generation', description: reasons?.join(' ') ?? e?.data?.statusMessage ?? 'Failed', color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <USlideover :open="open" title="Generate video (AI)" description="Create a clip from a prompt or animate a still." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Mode">
          <USelect v-model="mode" :items="MODE_OPTIONS" value-key="value" @update:model-value="onModeChange" />
        </UFormField>
        <UFormField label="Model">
          <USelectMenu v-model="modelId" :items="models.map((m) => ({ label: m.displayName, value: m.id }))" value-key="value" />
        </UFormField>
        <UFormField v-if="mode === 'image-to-video'" label="Source still">
          <USelectMenu v-model="sourceAssetId" :items="timelineStills.map((s) => ({ label: s.label, value: s.assetId }))" value-key="value" placeholder="Pick a still from the timeline" />
        </UFormField>
        <UFormField label="Prompt">
          <UTextarea v-model="prompt" :rows="3" placeholder="Describe the motion / scene…" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Duration (s)">
            <USelect v-model="durationSeconds" :items="(model?.durationsSeconds ?? [5]).map((d) => ({ label: `${d}s`, value: d }))" value-key="value" />
          </UFormField>
          <UFormField label="Subject">
            <USelect v-model="subjectType" :items="SUBJECT_OPTIONS" value-key="value" />
          </UFormField>
        </div>
        <p class="text-xs text-muted">Estimated cost: ${{ (estCostCents / 100).toFixed(2) }}</p>
        <UAlert v-if="!validation.valid" color="warning" variant="subtle" icon="i-lucide-info" :title="validation.errors[0]" />
        <UButton block color="primary" icon="i-lucide-sparkles" :loading="submitting" :disabled="!validation.valid" label="Generate" @click="submit" />
      </div>
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Typecheck smoke + Commit**

Run: `npx vitest run test/app/videoGenerationForm.test.ts`
Expected: PASS (alias + imports resolve).

```bash
git add app/components/media/MediaGeneratePicker.vue
git commit -m "feat(video-gen): Generate (AI) slideover"
```

---

## Task 12: Editor wiring + Library "Add to timeline"

**Files:**
- Modify: `app/pages/agency/audio/projects/[id].vue`
- Modify: `app/components/media/MediaVideoLibrary.vue`

- [ ] **Step 1: Add the flag + state + handlers to the editor page**

In `<script setup>` of `app/pages/agency/audio/projects/[id].vue`, near the other AV wiring (around line 50-63), add:

```ts
const videoGenerationEnabled = computed(() => Boolean((config.public as any).videoGenerationEnabled))
const generatePickerOpen = ref(false)
const genJobs = useVideoGenerationJobs(projectId.value)

// stills already on the timeline that have a backing video_assets id (for i2v source).
// base_source stills are uploaded files; only assets with an asset id are reusable here.
const timelineStills = computed(() => {
  const tl = editor.timeline.value
  if (!tl) return [] as { assetId: string; label: string }[]
  const out: { assetId: string; label: string }[] = []
  for (const t of tl.tracks) if (t.kind === 'video') for (const c of (t.clips as any[])) {
    if (c.base_source === 'still_kenburns' && c.asset_id) out.push({ assetId: c.asset_id, label: `Still @ ${Math.round(c.timeline_start_sec)}s` })
  }
  return out
})
const projectAspect = computed(() => {
  const tl = editor.timeline.value
  if (!tl) return '9:16'
  return tl.width >= tl.height ? '16:9' : '9:16'
})

function onGenerationSubmitted(_jobId: string) { void genJobs.start() }
onMounted(() => { if (videoGenerationEnabled.value) void genJobs.start() })
onBeforeUnmount(() => genJobs.stop())
```

- [ ] **Step 2: Add the "Generate (AI)" item to the Add dropdown**

In the `UDropdownMenu` items array (around line 286-290), add a fourth item after "Overlay" (only meaningful when enabled — guard inside `onSelect`):

```ts
            { label: 'Generate (AI)', icon: 'i-lucide-sparkles', onSelect: () => { if (videoGenerationEnabled) generatePickerOpen = true } },
```

- [ ] **Step 3: Mount the slideover near the other pickers** (around line 445-450)

```vue
        <!-- AI generation -->
        <MediaGeneratePicker
          v-if="videoGenerationEnabled"
          v-model:open="generatePickerOpen"
          :project-id="projectId"
          :timeline-stills="timelineStills"
          :default-aspect="projectAspect"
          @submitted="onGenerationSubmitted"
        />
```

- [ ] **Step 4: Surface generated assets + "Add to timeline" in the Library**

In `app/components/media/MediaVideoLibrary.vue`, add an `@add-to-timeline` emit carrying `{ r2Key, durationSec }` for completed generation assets, and render an "Add to timeline" button per asset. In the editor page, handle it:

```ts
function onLibraryAddToTimeline(p: { r2Key: string; durationSec: number }) {
  editor.addVideoClipAction(p.r2Key, p.durationSec, 'uploaded_footage', editor.currentTime.value)
  toast.add({ title: 'Added to timeline', color: 'success' })
}
```

Wire it on the existing `<MediaVideoLibrary>` usage (around line 450): add `@add-to-timeline="onLibraryAddToTimeline"`.

> The Library already lists `video_assets`; generated outputs are `video_assets` rows (Task 3), so they appear automatically. The poller (`genJobs`) drives a "generating…" indicator; on `succeeded` the asset is in the list. (If `MediaVideoLibrary` fetches assets on open, add a `genJobs.jobs` watch to refetch when a job flips to `succeeded`.)

- [ ] **Step 5: Manual smoke (dev) + Commit**

Because generation needs CF Queue + muapi (not available in `pnpm dev`), verify only that: the "Generate (AI)" item appears when `VIDEO_GENERATION_ENABLED=true` locally, the slideover opens, validation gates the button, and submitting with queues unavailable surfaces the 502/“could not start” toast gracefully (the binding-unavailable path). Full end-to-end is an operator verify-live after provisioning.

Run: `npx vitest run test/video-generation test/app/videoGenerationForm.test.ts test/audio/timelineEditAv.test.ts`
Expected: PASS (whole feature suite green).

```bash
git add app/pages/agency/audio/projects/[id].vue app/components/media/MediaVideoLibrary.vue
git commit -m "feat(video-gen): wire Generate slideover + Library add-to-timeline into the editor"
```

---

## Final verification

- [ ] **Run the full video-generation + AV suites**

Run: `npx vitest run test/video-generation test/audio test/app/videoGenerationForm.test.ts`
Expected: all PASS (the pre-existing `renderVariants.test.ts` `cloudflare:workers` import failure is unrelated/environmental).

- [ ] **Confirm dormancy**: with `VIDEO_GENERATION_ENABLED` unset, `jobs.post`, `jobs.get`, `webhook`, and the reconcile cron all return 404/`disabled`, and the editor shows no "Generate (AI)" item. No migration was added.

---

## Operator activation runbook (NOT part of implementation — do not run)

1. `wrangler queues create video-generation` + `wrangler queues create video-generation-dlq`.
2. Set Pages env: `VIDEO_STUDIO_ENABLED=true`, `VIDEO_GENERATION_ENABLED=true`, `MUAPI_API_KEY`, `MUAPI_BASE_URL`, `MUAPI_WEBHOOK_URL` (the public `…/api/agency/video/generation/webhook`), `MUAPI_WEBHOOK_SECRET`.
3. Set the same `MUAPI_*` vars on the `video-generation` worker; `pnpm --dir workers/video-generation deploy`.
4. Configure tenant policy: `enabled:true`, `monthlyCapCents`, `allowedModelIds: ['muapi/i2v-kling','muapi/t2v-wan']`.
5. Verify-live: muapi endpoint slugs + cost values in `modelRegistry.ts`; run one i2v + one t2v end-to-end; confirm webhook finalize + reconcile fallback.
6. Marketing-site sync (features pages) at go-live.
</content>
