import type {
  VideoGenerationProvider,
  VideoGenerationProviderRequest,
  VideoGenerationProviderResult,
  VideoGenerationProviderSubmission,
} from './types'
// Relative (not ~~/) so the generation Worker bundles this file — wrangler's esbuild
// doesn't honor tsconfig paths for runtime resolution. Matches ./types above.
import { getVideoGenerationModel } from '../modelRegistry'

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

function buildInputs(request: VideoGenerationProviderRequest): Record<string, unknown> {
  const inputs: Record<string, unknown> = {
    prompt: request.prompt,
    duration: request.durationSeconds,
    aspect_ratio: request.aspectRatio,
  }
  if (request.resolution) inputs.resolution = request.resolution
  if (request.mode === 'image-to-video' && request.sourceAssetUrls[0]) {
    inputs.image = request.sourceAssetUrls[0]
  }
  return inputs
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
  const url = r?.video ?? r?.output ?? r?.url ?? r?.videos?.[0] ?? null
  return typeof url === 'string' ? url : null
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
        buildInputs(request),
        { gateway: { metadata: { tenantId: request.tenantId ?? '', jobId: request.jobId } } }
      )
      const outputUrl = extractVideoUrl(raw)
      // CF bills via unified billing (dashboard); no per-call cost is returned → null.
      completedResults.set(request.jobId, outputUrl
        ? { status: 'succeeded', outputUrl, actualCostCents: null, errorMessage: null }
        : { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: `model returned no video url (state=${extractState(raw) ?? 'unknown'})` })
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
