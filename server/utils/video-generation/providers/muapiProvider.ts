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
        headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' },
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
      const errorMessage = json.error == null ? null : (typeof json.error === 'string' ? json.error : (json.error.message ?? String(json.error)))
      return { status, outputUrl, actualCostCents, errorMessage }
    },
  }
}
