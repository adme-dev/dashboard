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
  | { skipped: true; reason: 'missing_job' | 'terminal_or_running' }
  | { skipped: false; status: 'succeeded' | 'failed' | 'running' }

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error || 'video generation failed')
}

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
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
  if (job.status === 'running' || job.status === 'succeeded' || job.status === 'failed' || job.status === 'blocked') {
    return { skipped: true, reason: 'terminal_or_running' }
  }

  try {
    const provider = deps.providers[job.provider]
    if (!provider) {
      await deps.markFailed(job.id, `no provider registered for '${job.provider}'`)
      await recordRuntime(job, deps, {
        status: 'error',
        errorCode: 'video_generation_provider_missing',
        latencyMs: Date.now() - startedAt,
        metadata: { outcome: 'failed_before_submit' },
      })
      return { skipped: false, status: 'failed' }
    }
    const submission = await provider.submit({
      jobId: job.id, tenantId: job.tenantId, projectId: job.projectId, userId: job.createdBy,
      modelId: job.modelId, mode: job.mode, prompt: job.prompt,
      sourceAssetUrls: message.sourceAssetUrls?.length ? message.sourceAssetUrls : job.sourceAssetIds, durationSeconds: job.durationSeconds,
      aspectRatio: job.aspectRatio, resolution: job.resolution,
    })
    await deps.markRunning(job.id, submission.providerRequestId)
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
    if (result.status !== 'succeeded' || !result.outputUrl) {
      await deps.markFailed(job.id, result.errorMessage || `provider returned ${result.status}`)
      await recordRuntime(job, deps, {
        status: 'error',
        errorCode: 'video_generation_provider_failed',
        latencyMs: Date.now() - startedAt,
        metadata: {
          outcome: 'provider_failed',
          providerStatus: result.status,
          errorMessage: result.errorMessage ?? null,
        },
      })
      return { skipped: false, status: 'failed' }
    }
    const asset = await deps.createOutputAsset(job, result)
    await deps.markSucceeded({
      id: job.id, providerStatus: result.status, providerResultUrl: result.outputUrl,
      outputAssetId: asset.id, outputR2Key: asset.r2Key, actualCostCents: result.actualCostCents,
    })
    await recordRuntime(job, deps, {
      latencyMs: Date.now() - startedAt,
      estimatedCostCents: result.actualCostCents ?? job.estimatedCostCents,
      metadata: {
        outcome: 'succeeded',
        providerStatus: result.status,
        outputAssetId: asset.id,
        outputR2Key: asset.r2Key,
      },
    })
    return { skipped: false, status: 'succeeded' }
  } catch (error) {
    await deps.markFailed(job.id, safeErrorMessage(error))
    await recordRuntime(job, deps, {
      status: 'error',
      errorCode: 'video_generation_worker_exception',
      latencyMs: Date.now() - startedAt,
      metadata: { outcome: 'exception', errorMessage: safeErrorMessage(error) },
    })
    return { skipped: false, status: 'failed' }
  }
}
