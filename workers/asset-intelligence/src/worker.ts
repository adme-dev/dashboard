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
}

export type ProcessAssetIntelligenceResult =
  | { skipped: true; reason: 'missing_job' | 'terminal' | 'not_claimed' }
  | { skipped: false; status: 'succeeded' | 'failed' }

function isTerminalStatus(status: string | undefined): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'blocked'
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error || 'asset intelligence failed')
}

export async function processAssetIntelligenceJob(
  message: AssetIntelligenceMessage,
  deps: ProcessDeps
): Promise<ProcessAssetIntelligenceResult> {
  const job = await deps.getJob(message.jobId)
  if (!job) throw new Error(`asset intelligence job ${message.jobId} not found`)
  if (isTerminalStatus(job.status)) return { skipped: true, reason: 'terminal' }

  const claimed = await deps.markRunning(job.id)
  if (claimed.status !== 'running') return { skipped: true, reason: 'not_claimed' }

  try {
    const result = await deps.runProvider(job)
    const outputDerivativeIds: string[] = []
    const sourceAssetId = job.sourceAssetId ?? message.sourceAssetId
    for (const derivative of result.derivatives) {
      const persisted = await deps.createDerivative({
        ...derivative,
        sourceAssetId,
        projectId: job.projectId,
      })
      outputDerivativeIds.push(persisted.id)
    }
    await deps.markSucceeded({ id: job.id, outputDerivativeIds })
    return { skipped: false, status: 'succeeded' }
  } catch (error) {
    await deps.markFailed(job.id, safeErrorMessage(error))
    return { skipped: false, status: 'failed' }
  }
}
