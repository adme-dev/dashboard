import type { VideoGenerationMessage } from '../../../server/utils/video-generation/enqueue'
import type { VideoGenerationProvider, VideoGenerationProviderResult } from '../../../server/utils/video-generation/providers/types'
import {
  publicVideoGenerationProviderStatus,
  videoGenerationTransitionWasApplied,
  type VideoGenerationJob,
} from '../../../server/utils/video-generation/types'

export interface VideoGenerationOutputAsset {
  id: string
  r2Key: string
  sha256?: string
}

export interface ProcessVideoGenerationDeps {
  getJob(id: string): Promise<VideoGenerationJob | null>
  /** Required. Losers must not call the provider. */
  claimSubmission(id: string): Promise<VideoGenerationJob | null>
  markRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob>
  markUnknown(id: string, errorMessage: string, providerRequestId?: string | null): Promise<VideoGenerationJob>
  markFailed(id: string, errorMessage: string, actualCostCents?: number | null): Promise<VideoGenerationJob>
  markSucceeded(input: {
    id: string
    providerStatus: string
    providerResultUrl: string
    outputAssetId: string | null
    outputR2Key: string | null
    outputSha256?: string | null
    actualCostCents: number | null
  }): Promise<VideoGenerationJob>
  createOutputAsset(job: VideoGenerationJob, result: VideoGenerationProviderResult): Promise<VideoGenerationOutputAsset>
  providers: Record<string, VideoGenerationProvider>
  recordInvocation?: (input: {
    featureKey: string
    provider: string
    modelId: string
    gatewayUsed?: boolean
    userId?: string | null
    clientId?: string | null
    requestId?: string | null
    estimatedCostUsd?: number | null
    status?: 'success' | 'error'
    errorCode?: string | null
    latencyMs?: number | null
    metadata?: Record<string, unknown> | null
  }) => Promise<void>
}

export type ProcessVideoGenerationResult =
  | { skipped: true; reason: 'missing_job' | 'terminal_or_running' | 'not_dispatch_eligible' | 'claim_already_held' | 'claim_lost' }
  | { skipped: false; status: 'succeeded' | 'failed' | 'running' | 'unknown' }

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function canonicalObservedStatus(status: VideoGenerationJob['status']): 'succeeded' | 'failed' | 'running' | 'unknown' {
  if (status === 'succeeded' || status === 'failed' || status === 'running' || status === 'unknown') return status
  return 'unknown'
}

/** Ambiguous outcome after submit. Keeps the provider id and does not invite another submit. */
async function settleUnknown(
  job: VideoGenerationJob,
  deps: ProcessVideoGenerationDeps,
  startedAt: number,
  providerRequestId: string | null,
): Promise<ProcessVideoGenerationResult> {
  const unknown = providerRequestId
    ? await deps.markUnknown(job.id, 'video_generation_unknown_outcome', providerRequestId)
    : await deps.markUnknown(job.id, 'video_generation_unknown_outcome')
  if (!videoGenerationTransitionWasApplied(unknown) || unknown.status !== 'unknown') {
    return { skipped: false, status: canonicalObservedStatus(unknown.status) }
  }
  await recordRuntime(job, deps, {
    status: 'error',
    errorCode: 'video_generation_unknown_outcome',
    latencyMs: Date.now() - startedAt,
    metadata: { outcome: 'unknown' },
  })
  return { skipped: false, status: 'unknown' }
}

async function recordRuntime(
  job: VideoGenerationJob,
  deps: ProcessVideoGenerationDeps,
  input: {
    status?: 'success' | 'error'
    errorCode?: string | null
    latencyMs?: number | null
    estimatedCostCents?: number | null
    metadata?: Record<string, unknown>
  }
) {
  if (!deps.recordInvocation) return
  await deps.recordInvocation({
    featureKey: 'video_generation_worker_runtime',
    provider: job.provider,
    modelId: job.modelId,
    gatewayUsed: job.provider === 'aigateway',
    userId: job.createdBy,
    clientId: uuidOrNull(job.tenantId),
    requestId: job.id,
    estimatedCostUsd: input.estimatedCostCents == null ? null : input.estimatedCostCents / 100,
    status: input.status ?? 'success',
    errorCode: input.errorCode ?? null,
    latencyMs: input.latencyMs ?? null,
    metadata: {
      tenantId: job.tenantId,
      projectId: job.projectId,
      jobId: job.id,
      mode: job.mode,
      providerRequestId: job.providerRequestId,
      ...(input.metadata ?? {}),
    },
  })
}

export async function processVideoGenerationJob(
  message: VideoGenerationMessage,
  deps: ProcessVideoGenerationDeps
): Promise<ProcessVideoGenerationResult> {
  const startedAt = Date.now()
  const job = await deps.getJob(message.jobId)
  if (!job) return { skipped: true, reason: 'missing_job' }
  if (job.dispatchEligible === false) return { skipped: true, reason: 'not_dispatch_eligible' }
  if (job.status !== 'queued') return { skipped: true, reason: 'terminal_or_running' }
  if (job.submissionAttemptedAt) return { skipped: true, reason: 'claim_already_held' }
  if (typeof deps.claimSubmission !== 'function') {
    throw new Error('video generation submission claim is required')
  }

  const provider = deps.providers[job.provider]
  if (!provider) {
    const missing = await deps.markFailed(job.id, 'provider_missing')
    if (videoGenerationTransitionWasApplied(missing) && missing.status === 'failed') {
      await recordRuntime(job, deps, {
        status: 'error',
        errorCode: 'video_generation_provider_missing',
        latencyMs: Date.now() - startedAt,
        metadata: { outcome: 'provider_missing' },
      })
    }
    return { skipped: false, status: canonicalObservedStatus(missing.status) }
  }

  const claimed = await deps.claimSubmission(job.id)
  if (!claimed) return { skipped: true, reason: 'claim_lost' }

  let providerRequestId: string | null = null
  try {
    const submission = await provider.submit({
      jobId: job.id, tenantId: job.tenantId, projectId: job.projectId, userId: job.createdBy,
      modelId: job.modelId, mode: job.mode, prompt: job.prompt,
      sourceAssetUrls: message.sourceAssetUrls?.length ? message.sourceAssetUrls : job.sourceAssetIds, durationSeconds: job.durationSeconds,
      aspectRatio: job.aspectRatio, resolution: job.resolution,
    })
    providerRequestId = submission.providerRequestId ?? null
    const running = await deps.markRunning(job.id, submission.providerRequestId)
    if (!videoGenerationTransitionWasApplied(running) || running.status === 'succeeded' || running.status === 'failed') {
      return { skipped: false, status: canonicalObservedStatus(running.status) }
    }
    if (submission.status === 'queued') {
      // Async provider (Cloudflare batch API): the job is queued on the provider and the
      // result is minutes away. Don't poll here — an immediate poll races the just-created
      // request_id, and a transient error would wrongly fail the job. The reconcile cron
      // polls it to completion. Leave it 'running'.
      await recordRuntime(job, deps, {
        latencyMs: Date.now() - startedAt,
        metadata: { outcome: 'submitted_async', providerRequestId: submission.providerRequestId },
      })
      return { skipped: false, status: 'running' }
    }
    const result = await provider.poll(submission)
    if (result.status === 'running') {
      // Async provider still working: leave the job 'running'; the reconcile cron finalizes it.
      await recordRuntime(job, deps, {
        latencyMs: Date.now() - startedAt,
        metadata: { outcome: 'poll_running', providerRequestId: submission.providerRequestId },
      })
      return { skipped: false, status: 'running' }
    }
    if (result.status === 'failed') {
      const failed = await deps.markFailed(job.id, 'provider_failed', result.actualCostCents)
      if (!videoGenerationTransitionWasApplied(failed) || failed.status !== 'failed') {
        return { skipped: false, status: canonicalObservedStatus(failed.status) }
      }
      await recordRuntime(job, deps, {
        status: 'error',
        errorCode: 'video_generation_provider_failed',
        latencyMs: Date.now() - startedAt,
        estimatedCostCents: typeof failed.actualCostCents === 'number' ? failed.actualCostCents : null,
        metadata: {
          outcome: 'provider_failed',
          providerStatus: publicVideoGenerationProviderStatus(result.status),
        },
      })
      return { skipped: false, status: 'failed' }
    }
    // Succeeded without an output, or any other runtime status, is not a terminal failure.
    if (result.status !== 'succeeded' || !result.outputUrl) {
      return settleUnknown(job, deps, startedAt, providerRequestId)
    }
    const asset = await deps.createOutputAsset(job, result)
    const succeeded = await deps.markSucceeded({
      id: job.id, providerStatus: result.status, providerResultUrl: result.outputUrl,
      outputAssetId: asset.id, outputR2Key: asset.r2Key, outputSha256: asset.sha256 ?? null, actualCostCents: result.actualCostCents,
    })
    if (videoGenerationTransitionWasApplied(succeeded) && succeeded.status === 'succeeded') {
      await recordRuntime(job, deps, {
        latencyMs: Date.now() - startedAt,
        estimatedCostCents: typeof succeeded.actualCostCents === 'number' ? succeeded.actualCostCents : null,
        metadata: {
          outcome: 'succeeded',
          providerStatus: publicVideoGenerationProviderStatus(succeeded.providerStatus),
          outputAssetId: succeeded.outputAssetId,
          outputR2Key: succeeded.outputR2Key,
        },
      })
      return { skipped: false, status: 'succeeded' }
    }
    return { skipped: false, status: canonicalObservedStatus(succeeded.status) }
  } catch {
    return settleUnknown(job, deps, startedAt, providerRequestId)
  }
}
