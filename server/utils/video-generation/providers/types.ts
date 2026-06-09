import type { VideoGenerationMode } from '~~/server/utils/video-generation/types'

export interface VideoGenerationProviderRequest {
  jobId: string
  modelId: string
  mode: VideoGenerationMode
  prompt: string
  sourceAssetUrls: string[]
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  /** Tenant id, for AI Gateway per-tenant metadata tagging. Optional (mock/muapi ignore it). */
  tenantId?: string
}

export interface VideoGenerationProviderSubmission {
  providerRequestId: string
  status: string
}

export interface VideoGenerationProviderResult {
  status: 'succeeded' | 'failed' | 'running'
  outputUrl: string | null
  actualCostCents: number | null
  errorMessage?: string | null
}

export interface VideoGenerationProvider {
  submit(request: VideoGenerationProviderRequest): Promise<VideoGenerationProviderSubmission>
  poll(submission: VideoGenerationProviderSubmission): Promise<VideoGenerationProviderResult>
}
