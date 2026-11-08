import {
  publicVideoGenerationProviderStatus,
  videoGenerationTransitionWasApplied,
  type VideoGenerationJob,
} from '~~/server/utils/video-generation/types'
import type { VideoGenerationProvider } from '~~/server/utils/video-generation/providers/types'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import { markVideoGenerationJobFailed, markVideoGenerationJobUnknown } from '~~/server/utils/video-generation/jobs'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

export interface ReconcileDeps {
  providers: Record<string, VideoGenerationProvider>
  finalize: typeof finalizeVideoGenerationJob
  markFailed: typeof markVideoGenerationJobFailed
}

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function canonicalReconcileStatus(
  status: VideoGenerationJob['status'] | undefined,
): 'succeeded' | 'failed' | 'running' | 'unknown' | 'skipped' {
  if (status === 'succeeded' || status === 'failed' || status === 'running' || status === 'unknown') return status
  return 'skipped'
}

export async function reconcileRunningJob(
  job: VideoGenerationJob,
  deps: ReconcileDeps,
): Promise<'succeeded' | 'failed' | 'running' | 'unknown' | 'skipped'> {
  const startedAt = Date.now()
  const provider = deps.providers[job.provider]
  if (!provider || !job.providerRequestId) return 'skipped'
  const result = await provider.poll({ providerRequestId: job.providerRequestId, status: job.providerStatus ?? 'running', modelId: job.modelId })
  if (result.status === 'running') return 'running'
  if (result.status === 'failed') {
    const failed = await deps.markFailed(job.id, 'provider_failed', result.actualCostCents)
    if (!videoGenerationTransitionWasApplied(failed) || failed.status !== 'failed') {
      return canonicalReconcileStatus(failed?.status)
    }
    await recordAiInvocation({
      featureKey: 'video_generation_completion',
      provider: job.provider,
      modelId: job.modelId,
      gatewayUsed: job.provider === 'aigateway',
      userId: job.createdBy,
      clientId: uuidOrNull(job.tenantId),
      requestId: job.id,
      status: 'error',
      errorCode: 'video_generation_reconcile_failed',
      latencyMs: Date.now() - startedAt,
      metadata: {
        tenantId: job.tenantId,
        projectId: job.projectId,
        jobId: job.id,
        providerRequestId: job.providerRequestId,
        providerStatus: publicVideoGenerationProviderStatus(result.status),
        outcome: 'provider_failed',
        completionPath: 'reconcile',
      },
    })
    return 'failed'
  }
  if (result.status === 'succeeded' && result.outputUrl) {
    const finalized = await deps.finalize(job, result)
    return canonicalReconcileStatus(finalized?.status)
  }
  // Missing output or an unrecognized runtime status is not a provider failure.
  // The canonical unknown row keeps uncertain liability and the provider request id.
  const unknown = await markVideoGenerationJobUnknown(job.id, 'video_generation_unknown_outcome', job.providerRequestId)
  if (!videoGenerationTransitionWasApplied(unknown) || unknown.status !== 'unknown') {
    return canonicalReconcileStatus(unknown?.status)
  }
  return 'unknown'
}
