import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'
import type { VideoGenerationProviderResult } from '~~/server/utils/video-generation/providers/types'
import { uploadFile } from '~~/server/utils/storage'
import { createVideoAsset } from '~~/server/utils/video-generation/createAsset'
import { markVideoGenerationJobSucceeded } from '~~/server/utils/video-generation/jobs'

export interface FinalizeDeps {
  fetchImpl: typeof fetch
  uploadFile: typeof uploadFile
  createVideoAsset: typeof createVideoAsset
  markSucceeded: typeof markVideoGenerationJobSucceeded
}

const defaultDeps: FinalizeDeps = { fetchImpl: fetch, uploadFile, createVideoAsset, markSucceeded: markVideoGenerationJobSucceeded }

/** Download the provider output, store it in R2, create a video_asset row, and mark the job succeeded.
 *  Throws on download failure so callers (webhook/reconcile) can mark the job failed. */
export async function finalizeVideoGenerationJob(
  job: VideoGenerationJob,
  result: VideoGenerationProviderResult,
  deps: FinalizeDeps = defaultDeps
): Promise<VideoGenerationJob> {
  if (!result.outputUrl) throw new Error('finalize called without an output url')
  const res = await deps.fetchImpl(result.outputUrl)
  if (!res.ok) throw new Error(`output download failed: ${res.status}`)
  // TODO(video-gen verify-live): this buffers the whole output in memory (Pages fn ≈128MB).
  // Fine for short gated-model clips; switch to a streamed R2 upload (or delegate to the
  // generation Worker) before enabling longer/high-res real models.
  const bytes = Buffer.from(await res.arrayBuffer())
  const r2Key = `video-generation/${job.tenantId}/${job.id}/output.mp4`
  await deps.uploadFile(bytes, r2Key, 'video/mp4', { projectId: job.projectId, jobId: job.id })
  const asset = await deps.createVideoAsset({
    clientId: job.tenantId === 'agency' ? null : job.tenantId,
    createdBy: job.createdBy,
    title: `Generated video ${job.id}`,
    sourceProjectId: job.projectId,
    sourceJobId: job.id,
    r2Key,
    format: job.aspectRatio,
    durationSec: job.durationSeconds,
  })
  return deps.markSucceeded({
    id: job.id,
    providerStatus: result.status,
    providerResultUrl: result.outputUrl,
    outputAssetId: asset.id,
    outputR2Key: asset.r2Key,
    actualCostCents: result.actualCostCents,
  })
}
