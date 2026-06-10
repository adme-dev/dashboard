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
  /** Faithful env.AI.run(model, inputs, options?) passthrough. Async video models run on
   *  Cloudflare's batch API: submit with { queueRequest: true } to get a request_id, then
   *  poll env.AI.run(model, { request_id }) until it completes. */
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

function extractRequestId(raw: any): string | null {
  return raw?.request_id ?? raw?.result?.request_id ?? null
}

/** A pending poll returns { status: 'queued' | 'running' }; a completed poll returns
 *  { responses: [...] } with no status field. */
function extractStatus(raw: any): string | null {
  return typeof raw?.status === 'string' ? raw.status : null
}

/** Pull the output video url from either the batch envelope (responses[0].result) or a
 *  flat result shape. Field name (video/output/url/videos[0]) is verify-live per model. */
function extractVideoUrl(raw: any): string | null {
  const r = raw?.responses?.[0]?.result ?? raw?.result ?? raw
  return r?.video ?? r?.output ?? r?.url ?? r?.videos?.[0] ?? null
}

/** Asynchronous Cloudflare AI Gateway provider. submit() queues the job and returns the CF
 *  request_id (status 'queued'); the worker leaves the job running and the reconcile cron
 *  poll()s by request_id until the model finishes (~up to 5 min). Stateless across processes. */
export function makeAiGatewayProvider(deps: AiGatewayDeps): VideoGenerationProvider {
  return {
    async submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission> {
      const model = cfModelFor(request.modelId)
      const raw = await deps.run(
        model,
        { requests: [buildInputs(request)] },
        { queueRequest: true, gateway: { metadata: { tenantId: request.tenantId ?? '', jobId: request.jobId } } }
      )
      const requestId = extractRequestId(raw)
      if (!requestId) throw new Error('AI Gateway returned no request_id for queued video job')
      return { providerRequestId: requestId, status: extractStatus(raw) ?? 'queued', modelId: request.modelId }
    },

    async poll(submission: VideoGenerationProviderSubmission): Promise<VideoGenerationProviderResult> {
      if (!submission.modelId) {
        return { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'poll submission missing modelId' }
      }
      const model = cfModelFor(submission.modelId)
      const raw = await deps.run(model, { request_id: submission.providerRequestId })

      const status = extractStatus(raw)
      if (status === 'queued' || status === 'running') {
        return { status: 'running', outputUrl: null, actualCostCents: null }
      }

      const batch = raw?.responses?.[0]
      if (batch && batch.success === false) {
        return { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: batch.error || 'provider reported failure' }
      }
      const outputUrl = extractVideoUrl(raw)
      // CF bills via unified billing (dashboard); no per-call cost is returned → null.
      return outputUrl
        ? { status: 'succeeded', outputUrl, actualCostCents: null, errorMessage: null }
        : { status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'model returned no video url' }
    },
  }
}
