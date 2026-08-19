import type {
  VideoGenerationProvider,
  VideoGenerationProviderRequest,
  VideoGenerationProviderResult,
  VideoGenerationProviderSubmission,
} from './types'
// Relative (not ~~/) so the generation Worker bundles this file — wrangler's esbuild
// doesn't honor tsconfig paths for runtime resolution. Matches ./types above.
import { getVideoGenerationModel } from '../modelRegistry'
import { buildCfVideoInputs, imageInputEncoding } from '../cfInputs'

export interface AiGatewayDeps {
  /** Faithful env.AI.run(model, inputs, options?) passthrough. Partner video models
   *  (bytedance/seedance, google/veo, …) take FLAT inputs and run SYNCHRONOUSLY —
   *  the call blocks for the full generation (minutes) and resolves with
   *  { state, result: { video: url } }. The batch API's { requests: [...] } +
   *  queueRequest envelope is NOT supported by these models (verified live
   *  2026-06-10: it is rejected immediately with `7003: User Input Error`). */
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>
}

function cfModelFor(modelId: string): string {
  const cf = getVideoGenerationModel(modelId)?.cfModel
  if (!cf) throw new Error(`no cfModel mapping for ${modelId}`)
  return cf
}

/** Fetch a source image and inline it as a base64 data URI — required by models
 *  (pixverse, veo) whose image_input accepts only base64. */
async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`source image fetch failed: ${res.status}`)
  const contentType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${contentType};base64,${btoa(binary)}`
}

async function buildInputs(cfModel: string, request: VideoGenerationProviderRequest): Promise<Record<string, unknown>> {
  const sourceUrl = request.mode === 'image-to-video' ? request.sourceAssetUrls[0] ?? null : null
  const endSourceUrl = request.mode === 'image-to-video' ? request.sourceAssetUrls[1] ?? null : null
  const image = sourceUrl && imageInputEncoding(cfModel) === 'base64'
    ? await fetchAsDataUri(sourceUrl)
    : sourceUrl
  const endImage = endSourceUrl && imageInputEncoding(cfModel) === 'base64'
    ? await fetchAsDataUri(endSourceUrl)
    : endSourceUrl
  return buildCfVideoInputs(cfModel, {
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    image,
    endImage,
  })
}

function extractState(raw: any): string | null {
  const s = raw?.state ?? raw?.result?.state ?? raw?.status
  return typeof s === 'string' ? s : null
}

/** Pull the output video url. Verified live 2026-06-10 (seedance-2.0-fast): the REST API
 *  returns { result: { state, result: { video } }, success }, the binding returns the
 *  inner { state, result: { video } } — handle both, plus tolerant fallbacks. */
function extractVideoUrl(raw: any): string | null {
  const r = raw?.result?.result ?? raw?.result ?? raw?.responses?.[0]?.result ?? raw
  const url = r?.video ?? r?.output_url ?? r?.outputUrl ?? r?.output ?? r?.url ?? r?.videos?.[0] ?? null
  return typeof url === 'string' ? url : null
}

function extractProviderError(raw: any): string | null {
  const candidates = [
    raw?.error,
    raw?.result?.error,
    raw?.result?.result?.error,
    raw?.errors?.[0],
    raw?.result?.errors?.[0],
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    if (typeof candidate === 'string') return candidate
    if (typeof candidate.message === 'string') return candidate.message
    if (typeof candidate.code !== 'undefined') return `Cloudflare error ${candidate.code}`
  }
  return null
}

/** Completed generations, keyed by jobId, handed from submit() to the immediate poll()
 *  in the same Worker invocation. A cross-process poll (the reconcile cron) misses this
 *  cache by design — it reports 'running' and the reconcile timeout-reaper backstops
 *  invocations that died mid-generation. */
const completedResults = new Map<string, VideoGenerationProviderResult>()

/** Synchronous Cloudflare AI Gateway provider. submit() blocks on env.AI.run for the
 *  full generation, stashes the result, and poll() (called immediately by the worker,
 *  since submit's status is not 'queued') returns it for finalization in-invocation. */
export function makeAiGatewayProvider(deps: AiGatewayDeps): VideoGenerationProvider {
  return {
    async submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission> {
      const model = cfModelFor(request.modelId)
      const raw = await deps.run(
        model,
        await buildInputs(model, request),
        {
          gateway: {
            metadata: {
              tenantId: request.tenantId ?? '',
              projectId: request.projectId ?? '',
              userId: request.userId ?? '',
              jobId: request.jobId,
              modelId: request.modelId,
            },
          },
        }
      )
      const outputUrl = extractVideoUrl(raw)
      const providerError = extractProviderError(raw)
      // CF bills via unified billing (dashboard); no per-call cost is returned → null.
      completedResults.set(request.jobId, outputUrl
        ? { status: 'succeeded', outputUrl, actualCostCents: null, errorMessage: null }
        : { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: providerError || `model returned no video url (state=${extractState(raw) ?? 'unknown'})` })
      return { providerRequestId: request.jobId, status: 'completed', modelId: request.modelId }
    },

    async poll(submission: VideoGenerationProviderSubmission): Promise<VideoGenerationProviderResult> {
      const cached = completedResults.get(submission.providerRequestId)
      if (cached) {
        completedResults.delete(submission.providerRequestId)
        return cached
      }
      // No cached result: this is a cross-process poll (reconcile cron) for a job whose
      // generating invocation is gone. Report 'running' and let the timeout-reaper decide.
      return { status: 'running', outputUrl: null, actualCostCents: null }
    },
  }
}
