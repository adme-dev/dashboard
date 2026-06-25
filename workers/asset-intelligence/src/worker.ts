import type { AssetDerivativeOutput, AssetIntelligenceProviderResult, AssetIntelligenceWorkerJob } from './providers'

export interface AssetIntelligenceMessage {
  jobId: string
  projectId: string
  sourceAssetId: string
}

export interface AssetIntelligenceClaim {
  id: string
  status: string
}

export interface CreateDerivativeInput extends AssetDerivativeOutput {
  sourceAssetId: string
  projectId: string
}

export interface ProcessDeps {
  getJob(id: string): Promise<AssetIntelligenceWorkerJob | null>
  markRunning(id: string): Promise<AssetIntelligenceClaim>
  markFailed(id: string, errorMessage: string): Promise<AssetIntelligenceClaim>
  markSucceeded(input: { id: string; outputDerivativeIds: string[] }): Promise<AssetIntelligenceClaim>
  createDerivative(input: CreateDerivativeInput): Promise<{ id: string }>
  runProvider(job: AssetIntelligenceWorkerJob): Promise<AssetIntelligenceProviderResult>
  recordInvocation?: (input: {
    featureKey: string
    provider: string
    modelId: string
    gatewayUsed?: boolean
    userId?: string | null
    clientId?: string | null
    requestId?: string | null
    status?: 'success' | 'error'
    errorCode?: string | null
    latencyMs?: number | null
    metadata?: Record<string, unknown> | null
  }) => Promise<void>
}

export type ProcessAssetIntelligenceResult =
  | { skipped: true; reason: 'malformed_message' | 'missing_job' | 'terminal' | 'not_claimed' }
  | { skipped: false; status: 'succeeded' | 'failed' }

function isValidMessage(message: unknown): message is AssetIntelligenceMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as Partial<AssetIntelligenceMessage>
  if (typeof candidate.jobId !== 'string') return false
  const jobId = candidate.jobId.trim()
  if (candidate.jobId !== jobId) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)
}

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'blocked'
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error || 'asset intelligence failed')
}

function withContentMetadata(derivative: AssetDerivativeOutput): AssetDerivativeOutput {
  const metadata = { ...derivative.metadata }
  if (derivative.contentType) metadata.contentType = derivative.contentType
  if (typeof derivative.size === 'number') metadata.size = derivative.size
  return { ...derivative, metadata }
}

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

async function recordRuntime(
  job: AssetIntelligenceWorkerJob,
  deps: ProcessDeps,
  input: {
    status?: 'success' | 'error'
    errorCode?: string | null
    latencyMs?: number | null
    metadata?: Record<string, unknown>
  }
) {
  if (!deps.recordInvocation) return
  await deps.recordInvocation({
    featureKey: 'video_asset_intelligence_worker_runtime',
    provider: job.provider,
    modelId: job.modelId,
    gatewayUsed: job.provider === 'workers-ai',
    clientId: uuidOrNull(job.tenantId),
    requestId: job.id,
    status: input.status ?? 'success',
    errorCode: input.errorCode ?? null,
    latencyMs: input.latencyMs ?? null,
    metadata: {
      tenantId: job.tenantId,
      projectId: job.projectId,
      sourceAssetId: job.sourceAssetId,
      jobId: job.id,
      action: job.action,
      ...(input.metadata ?? {}),
    },
  })
}

export async function processAssetIntelligenceJob(
  message: unknown,
  deps: ProcessDeps
): Promise<ProcessAssetIntelligenceResult> {
  const startedAt = Date.now()
  if (!isValidMessage(message)) return { skipped: true, reason: 'malformed_message' }

  const job = await deps.getJob(message.jobId)
  if (!job) return { skipped: true, reason: 'missing_job' }
  if (isTerminalStatus(job.status)) return { skipped: true, reason: 'terminal' }

  const claimed = await deps.markRunning(job.id)
  if (claimed.status !== 'running') return { skipped: true, reason: 'not_claimed' }

  try {
    const result = await deps.runProvider(job)
    const outputDerivativeIds: string[] = []
    const sourceAssetId = job.sourceAssetId ?? message.sourceAssetId
    for (const derivative of result.derivatives) {
      const persisted = await deps.createDerivative({
        ...withContentMetadata(derivative),
        sourceAssetId,
        projectId: job.projectId,
      })
      outputDerivativeIds.push(persisted.id)
    }
    const completed = await deps.markSucceeded({ id: job.id, outputDerivativeIds })
    if (completed.status !== 'succeeded') return { skipped: true, reason: 'not_claimed' }
    await recordRuntime(job, deps, {
      latencyMs: Date.now() - startedAt,
      metadata: {
        outcome: 'succeeded',
        derivativeCount: outputDerivativeIds.length,
        outputDerivativeIds,
      },
    })
    return { skipped: false, status: 'succeeded' }
  } catch (error) {
    await deps.markFailed(job.id, safeErrorMessage(error))
    await recordRuntime(job, deps, {
      status: 'error',
      errorCode: 'asset_intelligence_worker_failed',
      latencyMs: Date.now() - startedAt,
      metadata: { outcome: 'failed', errorMessage: safeErrorMessage(error) },
    })
    return { skipped: false, status: 'failed' }
  }
}
