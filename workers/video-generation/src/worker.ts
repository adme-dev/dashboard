import type { VideoGenerationMessage } from '../../../server/utils/video-generation/enqueue'
import type { VideoGenerationProvider, VideoGenerationProviderResult } from '../../../server/utils/video-generation/providers/types'
import type { VideoGenerationJob } from '../../../server/utils/video-generation/types'

export interface VideoGenerationOutputAsset {
  id: string
  r2Key: string
}

export interface ProcessVideoGenerationDeps {
  getJob(id: string): Promise<VideoGenerationJob | null>
  markRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob>
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
  providers: Record<string, VideoGenerationProvider>
}

export type ProcessVideoGenerationResult =
  | { skipped: true; reason: 'missing_job' | 'terminal_or_running' }
  | { skipped: false; status: 'succeeded' | 'failed' | 'running' }

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
    const provider = deps.providers[job.provider]
    if (!provider) {
      await deps.markFailed(job.id, `no provider registered for '${job.provider}'`)
      return { skipped: false, status: 'failed' }
    }
    const submission = await provider.submit({
      jobId: job.id, tenantId: job.tenantId, modelId: job.modelId, mode: job.mode, prompt: job.prompt,
      sourceAssetUrls: job.sourceAssetIds, durationSeconds: job.durationSeconds,
      aspectRatio: job.aspectRatio, resolution: job.resolution,
    })
    await deps.markRunning(job.id, submission.providerRequestId)
    const result = await provider.poll(submission)
    if (result.status === 'running') {
      // Async provider: leave the job 'running'; the webhook (Task 5) or reconcile cron
      // (Task 7) finalizes it. Nothing else finalizes here.
      return { skipped: false, status: 'running' }
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
}
