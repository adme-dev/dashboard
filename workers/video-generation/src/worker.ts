import type { VideoGenerationMessage } from '../../../server/utils/video-generation/enqueue'
import type { VideoGenerationProvider, VideoGenerationProviderResult } from '../../../server/utils/video-generation/providers/types'
import type { VideoGenerationJob } from '../../../server/utils/video-generation/types'

export interface VideoGenerationOutputAsset {
  id: string
  r2Key: string
}

export interface ProcessVideoGenerationDeps {
  getJob(id: string): Promise<VideoGenerationJob | null>
  markRunning(id: string): Promise<VideoGenerationJob>
  markFailed(id: string, errorMessage: string): Promise<VideoGenerationJob>
  markSucceeded(input: {
    id: string
    providerStatus: string
    providerResultUrl: string
    outputAssetId: string | null
    outputR2Key: string | null
    actualCostCents: number | null
  }): Promise<VideoGenerationJob>
  createOutputAsset(job: VideoGenerationJob, result: VideoGenerationProviderResult): Promise<VideoGenerationOutputAsset>
  provider: VideoGenerationProvider
}

export type ProcessVideoGenerationResult =
  | { skipped: true; reason: 'missing_job' | 'terminal_or_running' }
  | { skipped: false; status: 'succeeded' | 'failed' }

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error || 'video generation failed')
}

export async function processVideoGenerationJob(
  message: VideoGenerationMessage,
  deps: ProcessVideoGenerationDeps
): Promise<ProcessVideoGenerationResult> {
  const job = await deps.getJob(message.jobId)
  if (!job) return { skipped: true, reason: 'missing_job' }
  if (job.status === 'running' || job.status === 'succeeded' || job.status === 'failed' || job.status === 'blocked') {
    return { skipped: true, reason: 'terminal_or_running' }
  }

  try {
    await deps.markRunning(job.id)
    const submission = await deps.provider.submit({
      jobId: job.id,
      modelId: job.modelId,
      mode: job.mode,
      prompt: job.prompt,
      sourceAssetUrls: job.sourceAssetIds,
      durationSeconds: job.durationSeconds,
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
    })
    const result = await deps.provider.poll(submission)
    if (result.status !== 'succeeded' || !result.outputUrl) {
      const message = result.errorMessage || `provider returned ${result.status}`
      await deps.markFailed(job.id, message)
      return { skipped: false, status: 'failed' }
    }
    const asset = await deps.createOutputAsset(job, result)
    await deps.markSucceeded({
      id: job.id,
      providerStatus: result.status,
      providerResultUrl: result.outputUrl,
      outputAssetId: asset.id,
      outputR2Key: asset.r2Key,
      actualCostCents: result.actualCostCents,
    })
    return { skipped: false, status: 'succeeded' }
  } catch (error) {
    await deps.markFailed(job.id, safeErrorMessage(error))
    return { skipped: false, status: 'failed' }
  }
}
