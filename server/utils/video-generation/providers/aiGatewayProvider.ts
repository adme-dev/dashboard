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
      const cached = results.get(submission.providerRequestId)
      results.delete(submission.providerRequestId)
      return cached
        ?? { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'no cached result for submission' }
    },
  }
}
