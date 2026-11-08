import { downloadGeneratedVideoOutput } from '~~/server/utils/video-generation/outputDownload'
import { generatedVideoOutputIdentity } from '~~/shared/video/generationOutput'
import {
  publicVideoGenerationProviderStatus,
  videoGenerationTransitionWasApplied,
  type VideoGenerationJob,
} from '~~/server/utils/video-generation/types'
import type { VideoGenerationProviderResult } from '~~/server/utils/video-generation/providers/types'
import { uploadFile } from '~~/server/utils/storage'
import { createGeneratedVideoAsset } from '~~/server/utils/video-generation/createAsset'
import { markVideoGenerationJobSucceeded } from '~~/server/utils/video-generation/jobs'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

/** Human title for a generated asset: the prompt's first clause, never a bare UUID. */
export function generatedVideoTitle(prompt: string | null | undefined, jobId: string): string {
  const clause = (prompt ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s|,\s/)[0] ?? ''
  const short = clause.length > 60 ? `${clause.slice(0, 57).trimEnd()}…` : clause
  return short ? `AI · ${short}` : `Generated video ${jobId.slice(0, 8)}`
}

export interface FinalizeDeps {
  fetchImpl: typeof fetch
  uploadFile: typeof uploadFile
  createVideoAsset: typeof createGeneratedVideoAsset
  markSucceeded: typeof markVideoGenerationJobSucceeded
}

const defaultDeps: FinalizeDeps = { fetchImpl: fetch, uploadFile, createVideoAsset: createGeneratedVideoAsset, markSucceeded: markVideoGenerationJobSucceeded }

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

/** Download the provider output, store it in R2, create a video_asset row, and mark the job succeeded.
 *  Throws on download failure so callers retain uncertain liability and reconcile without resubmission.
 *  Completion cost is recorded only when the compare-and-swap marker says this call changed the row. */
export async function finalizeVideoGenerationJob(
  job: VideoGenerationJob,
  result: VideoGenerationProviderResult,
  deps: FinalizeDeps = defaultDeps
): Promise<VideoGenerationJob> {
  const startedAt = Date.now()
  if (!result.outputUrl) throw new Error('finalize called without an output url')
  const bytes = Buffer.from(await downloadGeneratedVideoOutput(result.outputUrl, deps.fetchImpl))
  const { r2Key, sha256 } = generatedVideoOutputIdentity(bytes, `video-generation/${job.tenantId}/${job.id}/output.mp4`)
  await deps.uploadFile(bytes, r2Key, 'video/mp4', { projectId: job.projectId, jobId: job.id, sha256 })
  // Identical job/output hashes reuse the canonical asset through its unique index.
  const asset = await deps.createVideoAsset({
    clientId: job.tenantId === 'agency' ? null : job.tenantId,
    createdBy: job.createdBy,
    title: generatedVideoTitle(job.prompt, job.id),
    sourceProjectId: job.projectId,
    sourceJobId: job.id,
    r2Key,
    outputSha256: sha256,
    format: job.aspectRatio,
    durationSec: job.durationSeconds,
  })
  const completed = await deps.markSucceeded({
    id: job.id,
    providerStatus: result.status,
    providerResultUrl: result.outputUrl,
    outputAssetId: asset.id,
    outputR2Key: asset.r2Key,
    outputSha256: sha256,
    actualCostCents: result.actualCostCents,
  })
  if (videoGenerationTransitionWasApplied(completed) && completed.status === 'succeeded') {
    const costCents = typeof completed.actualCostCents === 'number' ? completed.actualCostCents : null
    await recordAiInvocation({
      featureKey: 'video_generation_completion',
      provider: job.provider,
      modelId: job.modelId,
      gatewayUsed: job.provider === 'aigateway',
      userId: job.createdBy,
      clientId: uuidOrNull(job.tenantId),
      requestId: job.id,
      estimatedCostUsd: costCents == null ? null : costCents / 100,
      status: 'success',
      latencyMs: Date.now() - startedAt,
      metadata: {
        tenantId: job.tenantId,
        projectId: job.projectId,
        jobId: job.id,
        providerRequestId: job.providerRequestId,
        providerStatus: publicVideoGenerationProviderStatus(completed.providerStatus),
        outputAssetId: completed.outputAssetId,
        outputR2Key: completed.outputR2Key,
        completionPath: 'finalize',
      },
    })
  }
  return completed
}
