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
  const result = await provider.poll({ providerRequestId: job.providerRequestId, status: job.providerStatus ?? 'running', modelId: job.modelId })
  if (result.status === 'running') return 'running'
  if (result.status !== 'succeeded' || !result.outputUrl) {
    await deps.markFailed(job.id, result.errorMessage || `reconcile: provider ${result.status}`)
    return 'failed'
  }
  await deps.finalize(job, result)
  return 'succeeded'
}
