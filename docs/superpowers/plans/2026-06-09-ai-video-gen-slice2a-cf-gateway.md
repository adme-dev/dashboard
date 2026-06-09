# AI Video Gen — Slice 2A: Cloudflare AI Gateway transport — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cloudflare AI Gateway (Workers AI `env.AI.run`) the primary video-generation transport — a synchronous, in-worker path that reuses the existing provider boundary — and retire muapi as the default.

**Architecture:** A new synchronous `aiGatewayProvider` (injected `run`, result cached in-instance so `poll` returns it) sits behind the Slice-1 `VideoGenerationProvider` boundary. The video-generation worker gains an `[ai]` binding and finalizes the CF path entirely in-worker (it already has R2 + DB): `env.AI.run → fetch(videoUrl) → AUDIO_BUCKET.put → dbCreateVideoAsset → markSucceeded`. The registry swaps muapi models for CF models and adds `surface`/`modality`/`cfModel`. No migration, dormant behind flags.

**Tech Stack:** Cloudflare Workers AI (`env.AI.run`) + AI Gateway, R2, Neon (pg via Hyperdrive), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-ai-video-generation-slice2-cf-gateway-design.md`

**Deferred to a follow-up (NOT in 2A):** fal.ai fallback adapter + its ED25519 webhook; the 2B governance hardening (i2v-only tenant enforcement, approved-asset check, pre-flight reserve). The Pages webhook/reconcile/finalize from Slice 1 stay in place (dormant — no provider uses them until fal lands).

---

## File Structure

**Create**
- `server/utils/video-generation/providers/aiGatewayProvider.ts` — synchronous CF provider (`makeAiGatewayProvider`).
- `workers/video-generation/src/downloadToR2.ts` — pure helper: fetch a URL → put bytes to an R2 bucket.
- Tests: `test/video-generation/aiGatewayProvider.test.ts`, `test/video-generation/downloadToR2.test.ts`.

**Modify**
- `server/utils/video-generation/types.ts` — add `surface`, `modality`, `cfModel` to `VideoGenerationModel`; add optional `tenantId` to `VideoGenerationProviderRequest`.
- `server/utils/video-generation/modelRegistry.ts` — add CF models; set muapi models `defaultEnabled: false`.
- `workers/video-generation/wrangler.toml` — add `[ai]` binding.
- `workers/video-generation/src/index.ts` — Env `AI`; provider map `{ aigateway, mock }` (drop muapi); `createOutputAsset` downloads→R2.
- `workers/video-generation/src/worker.ts` — pass `tenantId` into the provider request.
- `server/utils/video-generation/createAsset.ts` + `server/utils/video-generation/finalize.ts` + `test/video-generation/finalize.test.ts` — rename `createVideoAsset` → `createGeneratedVideoAsset` (fix the auto-import collision found at deploy).

---

## Task 1: Registry — surface/modality/cfModel + CF models + retire muapi

**Files:**
- Modify: `server/utils/video-generation/types.ts`
- Modify: `server/utils/video-generation/modelRegistry.ts`
- Test: `test/video-generation/modelRegistry.test.ts` (extend)

- [ ] **Step 1: Write failing tests (append to the existing describe)**

```ts
import { getVideoGenerationModel, listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

it('exposes a tenant-facing CF AI Gateway i2v model with a cfModel mapping', () => {
  const m = getVideoGenerationModel('aigateway/seedance-i2v')
  expect(m).toBeTruthy()
  expect(m!.provider).toBe('aigateway')
  expect(m!.surface).toBe('tenant')
  expect(m!.modality).toBe('i2v')
  expect(m!.modes).toContain('image-to-video')
  expect(m!.cfModel).toBe('bytedance/seedance-2.0-fast')
})

it('registers an internal-only CF t2v model that is NOT tenant-selectable', () => {
  const t = getVideoGenerationModel('aigateway/veo-t2v-internal')
  expect(t!.surface).toBe('internal')
  const ids = listSelectableVideoGenerationModels().map((x) => x.id)
  expect(ids).not.toContain('aigateway/veo-t2v-internal')
})

it('retires muapi models from the default selectable set', () => {
  const ids = listSelectableVideoGenerationModels().map((x) => x.id)
  expect(ids).not.toContain('muapi/i2v-kling')
  expect(ids).not.toContain('muapi/t2v-wan')
  expect(ids).toContain('aigateway/seedance-i2v')
})
```

- [ ] **Step 2: Run, verify FAIL:** `npx vitest run test/video-generation/modelRegistry.test.ts`

- [ ] **Step 3: Extend the type.** In `server/utils/video-generation/types.ts`, inside `interface VideoGenerationModel`, replace the existing `muapi?` block (added in Slice 1) with:

```ts
  /** muapi gateway mapping — present only for provider==='muapi' models (Slice 1, retired). */
  muapi?: {
    endpoint: string
  }
  /** Cloudflare Workers AI model id for provider==='aigateway' (the env.AI.run string). */
  cfModel?: string
  /** Where the model may be offered. 'internal' models are never tenant-selectable. */
  surface?: 'tenant' | 'internal'
  /** Generation modality (governance: tenant path is i2v-only — enforced in Slice 2B). */
  modality?: 'i2v' | 't2v' | 'i2v+t2v'
```

Also add an optional `tenantId` to the provider request — in `server/utils/video-generation/providers/types.ts`, inside `interface VideoGenerationProviderRequest`, after `resolution: string | null`:

```ts
  /** Tenant id, for AI Gateway per-tenant metadata tagging. Optional (mock/muapi ignore it). */
  tenantId?: string
```

- [ ] **Step 4: Add CF models + retire muapi.** In `server/utils/video-generation/modelRegistry.ts`:

(a) Add these two entries to `MODELS` (place before the existing `muapi/i2v-kling` entry):

```ts
  {
    id: 'aigateway/seedance-i2v',
    provider: 'aigateway',
    displayName: 'Seedance (image-to-video)',
    modes: ['image-to-video'],
    allowedSubjectTypes: ['vehicle', 'non_vehicle'],
    requiresApprovedSourceAsset: true,
    supportsNativeAudio: false,
    durationsSeconds: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    estimatedCostCents: 30,
    costUnit: 'second',
    safetyClass: 'vehicle_i2v_safe',
    defaultEnabled: true,
    cfModel: 'bytedance/seedance-2.0-fast',
    surface: 'tenant',
    modality: 'i2v',
  },
  {
    id: 'aigateway/veo-t2v-internal',
    provider: 'aigateway',
    displayName: 'Veo (text-to-video, internal)',
    modes: ['text-to-video'],
    allowedSubjectTypes: ['non_vehicle'],
    requiresApprovedSourceAsset: false,
    supportsNativeAudio: true,
    durationsSeconds: [5, 8],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p'],
    estimatedCostCents: 200,
    costUnit: 'second',
    safetyClass: 'non_vehicle_t2v',
    defaultEnabled: false,
    cfModel: 'google/veo-3.1-fast',
    surface: 'internal',
    modality: 't2v',
  },
```

(b) On BOTH existing `muapi/i2v-kling` and `muapi/t2v-wan` entries, change `defaultEnabled: true,` to `defaultEnabled: false,` (retire from the selectable set; keep entries for reference).

> NOTE: `cfModel` slugs (`bytedance/seedance-2.0-fast`, `google/veo-3.1-fast`), `estimatedCostCents`, and the `input` field names are **verify-live** against the live Cloudflare Workers AI catalogue before flag-flip. Encapsulated in the registry + provider.

- [ ] **Step 5: Run, verify PASS:** `npx vitest run test/video-generation/modelRegistry.test.ts`

- [ ] **Step 6: Commit**

```bash
git add server/utils/video-generation/types.ts server/utils/video-generation/providers/types.ts server/utils/video-generation/modelRegistry.ts test/video-generation/modelRegistry.test.ts
git commit -m "feat(video-gen): CF AI Gateway models + surface/modality/cfModel; retire muapi default"
```

---

## Task 2: aiGatewayProvider (synchronous CF provider)

**Files:**
- Create: `server/utils/video-generation/providers/aiGatewayProvider.ts`
- Test: `test/video-generation/aiGatewayProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'

describe('aiGateway provider (synchronous)', () => {
  it('submit() runs the cfModel with an image input for i2v + tenant metadata, and poll() returns the video url', async () => {
    const run = vi.fn().mockResolvedValue({ result: { video: 'https://cf/out.mp4' } })
    const provider = makeAiGatewayProvider({ run })
    const req = {
      jobId: 'job-1', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video' as const,
      prompt: 'slow pan', sourceAssetUrls: ['https://r2/still.png'], durationSeconds: 5,
      aspectRatio: '9:16', resolution: '720p', tenantId: 'dealer-1',
    }
    const sub = await provider.submit(req)
    expect(sub.providerRequestId).toBe('job-1')
    const [model, inputs, meta] = run.mock.calls[0]
    expect(model).toBe('bytedance/seedance-2.0-fast')
    expect(inputs).toMatchObject({ prompt: 'slow pan', image: 'https://r2/still.png', duration: 5, aspect_ratio: '9:16', resolution: '720p' })
    expect(meta).toMatchObject({ tenantId: 'dealer-1', jobId: 'job-1' })
    const res = await provider.poll(sub)
    expect(res).toMatchObject({ status: 'succeeded', outputUrl: 'https://cf/out.mp4', actualCostCents: null })
  })

  it('omits image for text-to-video and tolerates result.output / result.url / videos[0]', async () => {
    const run = vi.fn().mockResolvedValue({ result: { videos: ['https://cf/a.mp4'] } })
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ jobId: 'j', modelId: 'aigateway/veo-t2v-internal', mode: 'text-to-video', prompt: 'x', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null })
    expect(run.mock.calls[0][1].image).toBeUndefined()
    expect((await provider.poll(sub)).outputUrl).toBe('https://cf/a.mp4')
  })

  it('poll() reports failed when the model returns no video url', async () => {
    const run = vi.fn().mockResolvedValue({ result: {} })
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ jobId: 'j2', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video', prompt: 'x', sourceAssetUrls: ['https://r2/s.png'], durationSeconds: 5, aspectRatio: '9:16', resolution: null })
    expect(await provider.poll(sub)).toMatchObject({ status: 'failed', outputUrl: null })
  })

  it('submit() throws if the model has no cfModel mapping', async () => {
    const provider = makeAiGatewayProvider({ run: vi.fn() })
    await expect(provider.submit({ jobId: 'j', modelId: 'muapi/i2v-kling', mode: 'image-to-video', prompt: 'x', sourceAssetUrls: ['u'], durationSeconds: 5, aspectRatio: '9:16', resolution: null }))
      .rejects.toThrow(/no cfModel/)
  })
})
```

- [ ] **Step 2: Run, verify FAIL:** `npx vitest run test/video-generation/aiGatewayProvider.test.ts`

- [ ] **Step 3: Implement** `server/utils/video-generation/providers/aiGatewayProvider.ts`

```ts
import type {
  VideoGenerationProvider,
  VideoGenerationProviderRequest,
  VideoGenerationProviderResult,
  VideoGenerationProviderSubmission,
} from './types'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

export interface AiGatewayDeps {
  /** Wraps env.AI.run(model, inputs, gatewayOptions). meta is attached as AI Gateway
   *  per-request metadata (cf-aig-metadata) for per-tenant attribution. */
  run(model: string, inputs: Record<string, unknown>, meta: { tenantId?: string; jobId: string }): Promise<any>
}

function cfModelFor(modelId: string): string {
  const cf = getVideoGenerationModel(modelId)?.cfModel
  if (!cf) throw new Error(`no cfModel mapping for ${modelId}`)
  return cf
}

function extractVideoUrl(result: any): string | null {
  const r = result?.result ?? result
  return r?.video ?? r?.output ?? r?.url ?? r?.videos?.[0] ?? null
}

/** Synchronous CF provider: env.AI.run blocks to completion, so submit() does the work
 *  and caches the result; poll() returns it. The cache lives on the provider instance,
 *  which spans a single job's submit→poll in the worker. */
export function makeAiGatewayProvider(deps: AiGatewayDeps): VideoGenerationProvider {
  const results = new Map<string, VideoGenerationProviderResult>()
  return {
    async submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission> {
      const model = cfModelFor(request.modelId)
      const inputs: Record<string, unknown> = {
        prompt: request.prompt,
        duration: request.durationSeconds,
        aspect_ratio: request.aspectRatio,
      }
      if (request.resolution) inputs.resolution = request.resolution
      if (request.mode === 'image-to-video' && request.sourceAssetUrls[0]) {
        inputs.image = request.sourceAssetUrls[0]
      }
      const raw = await deps.run(model, inputs, { tenantId: request.tenantId, jobId: request.jobId })
      const outputUrl = extractVideoUrl(raw)
      // CF bills via unified billing (dashboard); no per-call cost is returned → null.
      results.set(request.jobId, outputUrl
        ? { status: 'succeeded', outputUrl, actualCostCents: null, errorMessage: null }
        : { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'model returned no video url' })
      return { providerRequestId: request.jobId, status: 'completed' }
    },

    async poll(submission: VideoGenerationProviderSubmission): Promise<VideoGenerationProviderResult> {
      return results.get(submission.providerRequestId)
        ?? { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'no cached result for submission' }
    },
  }
}
```

- [ ] **Step 4: Run, verify PASS:** `npx vitest run test/video-generation/aiGatewayProvider.test.ts` (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/utils/video-generation/providers/aiGatewayProvider.ts test/video-generation/aiGatewayProvider.test.ts
git commit -m "feat(video-gen): synchronous Cloudflare AI Gateway provider (env.AI.run)"
```

---

## Task 3: Worker — AI binding, provider map, in-worker download→R2

**Files:**
- Create: `workers/video-generation/src/downloadToR2.ts`
- Test: `test/video-generation/downloadToR2.test.ts`
- Modify: `workers/video-generation/wrangler.toml`
- Modify: `workers/video-generation/src/index.ts`
- Modify: `workers/video-generation/src/worker.ts`

- [ ] **Step 1: Write the failing test for the download helper**

```ts
// test/video-generation/downloadToR2.test.ts
import { describe, expect, it, vi } from 'vitest'
import { downloadToR2 } from '../../workers/video-generation/src/downloadToR2'

describe('downloadToR2', () => {
  it('fetches the url and puts the bytes into the bucket with a video content-type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer })
    const bucket = { put: vi.fn().mockResolvedValue(undefined) }
    await downloadToR2(bucket as any, fetchImpl as any, 'https://cf/out.mp4', 'video-generation/t/j/output.mp4')
    expect(fetchImpl).toHaveBeenCalledWith('https://cf/out.mp4')
    const [key, , opts] = bucket.put.mock.calls[0]
    expect(key).toBe('video-generation/t/j/output.mp4')
    expect(opts.httpMetadata.contentType).toBe('video/mp4')
  })

  it('throws on a non-ok download (so the job is marked failed)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 })
    const bucket = { put: vi.fn() }
    await expect(downloadToR2(bucket as any, fetchImpl as any, 'https://cf/out.mp4', 'k')).rejects.toThrow(/download failed: 502/)
    expect(bucket.put).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, verify FAIL:** `npx vitest run test/video-generation/downloadToR2.test.ts`

- [ ] **Step 3: Implement** `workers/video-generation/src/downloadToR2.ts`

```ts
interface R2Putable { put(key: string, value: ArrayBuffer | Uint8Array, options?: any): Promise<unknown> }

/** Fetch a generated-video URL and store the bytes in R2. Throws on a bad download
 *  so the caller can mark the job failed. */
export async function downloadToR2(bucket: R2Putable, fetchImpl: typeof fetch, url: string, r2Key: string): Promise<void> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`download failed: ${(res as any).status}`)
  const bytes = await res.arrayBuffer()
  await bucket.put(r2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
}
```

- [ ] **Step 4: Run, verify PASS:** `npx vitest run test/video-generation/downloadToR2.test.ts`

- [ ] **Step 5: Add the AI binding** to `workers/video-generation/wrangler.toml` (append at the end):

```toml
# Workers AI binding — env.AI.run("vendor/model", ...) routes third-party video models
# through Cloudflare AI Gateway (unified billing). Mirrors the audio-jobs worker.
[ai]
binding = "AI"
```

- [ ] **Step 6: Wire the worker.** In `workers/video-generation/src/index.ts`:

(a) Add the import at the top:
```ts
import { makeAiGatewayProvider } from '../../../server/utils/video-generation/providers/aiGatewayProvider'
import { downloadToR2 } from './downloadToR2'
```

(b) Extend `Env` with the AI binding and bucket (keep existing fields):
```ts
  AI: { run(model: string, inputs: Record<string, unknown>, options?: any): Promise<any> }
  AUDIO_BUCKET: { put(key: string, value: ArrayBuffer | Uint8Array, options?: any): Promise<unknown> }
```

(c) Replace `createOutputAsset` so it downloads the CF output into R2 before recording the asset:
```ts
async function createOutputAsset(job: VideoGenerationJob, result: VideoGenerationProviderResult, env: Env) {
  const r2Key = `video-generation/${job.tenantId}/${job.id}/output.mp4`
  if (result.outputUrl) {
    await downloadToR2(env.AUDIO_BUCKET, fetch, result.outputUrl, r2Key)
  }
  const asset = await dbCreateVideoAsset({
    clientId: job.tenantId === 'agency' ? null : job.tenantId,
    createdBy: job.createdBy,
    title: `Generated video ${job.id}`,
    sourceProjectId: job.projectId,
    sourceJobId: job.id,
    r2Key,
    format: job.aspectRatio,
    width: null,
    height: null,
    durationSec: job.durationSeconds,
  })
  return { id: asset.id, r2Key }
}
```

(d) In the `queue` handler, build the provider map per batch (env is in scope there) and pass an env-bound `createOutputAsset`. Replace the `providers: { mock, muapi: ... }` block with:
```ts
        providers: {
          mock: mockVideoGenerationProvider,
          aigateway: makeAiGatewayProvider({
            run: (model, inputs, meta) => env.AI.run(model, inputs, { gateway: { metadata: { tenantId: meta.tenantId ?? '', jobId: meta.jobId } } }),
          }),
        },
        createOutputAsset: (job, result) => createOutputAsset(job, result, env),
```
Remove the now-unused `makeMuapiProvider` import and the `MUAPI_*` provider registration (leave the `MUAPI_*` Env fields — harmless). Also remove the standalone `createOutputAsset(job, result)` two-arg references; it is now three-arg via the closure above.

> NOTE: the `env.AI.run` third-arg gateway/metadata option shape is **verify-live**; if CF rejects it, drop the 3rd arg — the provider still works without metadata.

- [ ] **Step 7: Pass tenantId into the provider request.** In `workers/video-generation/src/worker.ts`, in the `provider.submit({ ... })` call, add `tenantId: job.tenantId,` alongside the existing fields.

- [ ] **Step 8: Update worker test for the provider map + tenantId.** In `test/video-generation/worker.test.ts`, the `deps()` helper's `providers` map key `mock` is unchanged; add an assertion-safe case is not required, but update any test that referenced `muapi` provider registration (there are none in worker.test.ts — it injects its own `providers`). Add one case:
```ts
it('passes tenantId into the provider request', async () => {
  const d = deps(baseJob)
  await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
  expect(d.providers.mock.submit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }))
})
```
(`baseJob.tenantId` is `'tenant-1'`.)

- [ ] **Step 9: Run the worker + helper tests:** `npx vitest run test/video-generation/worker.test.ts test/video-generation/downloadToR2.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add workers/video-generation/wrangler.toml workers/video-generation/src/index.ts workers/video-generation/src/worker.ts workers/video-generation/src/downloadToR2.ts test/video-generation/downloadToR2.test.ts test/video-generation/worker.test.ts
git commit -m "feat(video-gen): worker AI binding + in-worker CF download->R2; drop muapi provider"
```

---

## Task 4: Fix the createVideoAsset auto-import collision

**Files:**
- Modify: `server/utils/video-generation/createAsset.ts`
- Modify: `server/utils/video-generation/finalize.ts`
- Test: `test/video-generation/finalize.test.ts` (update import)

Background: the Slice-1 deploy logged a Nuxt auto-import collision — `server/utils/video-generation/createAsset.ts` and the pre-existing `server/utils/video/assets.ts` BOTH export `createVideoAsset`. Rename ours to remove the ambiguity.

- [ ] **Step 1: Rename the export** in `server/utils/video-generation/createAsset.ts`: change `export async function createVideoAsset(` to `export async function createGeneratedVideoAsset(`. (Body unchanged.)

- [ ] **Step 2: Update the importer** in `server/utils/video-generation/finalize.ts`: change `import { createVideoAsset } from '~~/server/utils/video-generation/createAsset'` to `import { createGeneratedVideoAsset } from '~~/server/utils/video-generation/createAsset'`, and in `defaultDeps` change `createVideoAsset` to `createVideoAsset: createGeneratedVideoAsset` (the `FinalizeDeps` field name stays `createVideoAsset`; only the imported symbol changes). Verify the `FinalizeDeps` interface still types `createVideoAsset: typeof createGeneratedVideoAsset`.

- [ ] **Step 3: Update the test import** in `test/video-generation/finalize.test.ts`: it injects a `createVideoAsset` mock via deps (field name unchanged) — no change needed unless it imports the real symbol. Confirm it does not import `createVideoAsset` by name from createAsset.ts; if it does, update to `createGeneratedVideoAsset`.

- [ ] **Step 4: Run, verify PASS:** `npx vitest run test/video-generation/finalize.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/utils/video-generation/createAsset.ts server/utils/video-generation/finalize.ts test/video-generation/finalize.test.ts
git commit -m "fix(video-gen): rename createVideoAsset->createGeneratedVideoAsset (auto-import collision)"
```

---

## Final verification

- [ ] **Run the whole feature suite:** `npx vitest run test/video-generation test/app/videoGenerationForm.test.ts`
Expected: all PASS (the pre-existing `renderVariants.test.ts` `cloudflare:workers` failure is unrelated/environmental and not in this set).

- [ ] **Confirm dormancy unchanged:** flags still gate `jobs.post`/`jobs.get`/`webhook`/reconcile; the editor surfaces CF i2v models (not muapi) when enabled; no migration.

---

## Operator verify-live (NOT part of the build — before any flag-flip)

1. Add `[ai]` binding is deployed on the `video-generation` worker; `pnpm --dir workers/video-generation deploy`.
2. One real `env.AI.run('bytedance/seedance-2.0-fast', { prompt, image: <presigned R2 car image>, duration: 5, aspect_ratio: '9:16' })` — confirm it returns a video URL, the latency, and the real per-clip cost; correct `cfModel`/`input` field names + `estimatedCostCents` in the registry if they differ.
3. Confirm AI Gateway **spend-limit** (account-wide $ backstop) is set and that `cf-aig-metadata` tags appear per tenant.
4. THEN the Slice-2B governance hardening (i2v-only enforcement, approved-asset, pre-flight reserve) before exposing to tenants.
</content>
