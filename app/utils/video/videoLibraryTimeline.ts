export interface VideoLibraryTimelineAsset {
  id: string
  r2Key: string
  durationSec: number | null
  title?: string | null
  format?: string | null
}

export interface VideoLibraryTimelinePayload {
  assetId: string
  r2Key: string
  durationSec: number
  streamUrl: string
  title: string | null
  format: string | null
}

export interface VideoGenerationJobTimelineSource {
  outputAssetId: string | null
  outputR2Key: string | null
  durationSeconds?: number | null
  aspectRatio?: string | null
  prompt?: string | null
}

export function videoLibraryTimelinePayload(asset: VideoLibraryTimelineAsset): VideoLibraryTimelinePayload {
  return {
    assetId: asset.id,
    r2Key: asset.r2Key,
    durationSec: asset.durationSec ?? 5,
    streamUrl: `/api/agency/video/assets/${encodeURIComponent(asset.id)}/stream`,
    title: asset.title ?? null,
    format: asset.format ?? null,
  }
}

export function videoGenerationJobTimelinePayload(job: VideoGenerationJobTimelineSource): VideoLibraryTimelinePayload | null {
  if (!job.outputAssetId || !job.outputR2Key) return null
  return {
    assetId: job.outputAssetId,
    r2Key: job.outputR2Key,
    durationSec: job.durationSeconds ?? 5,
    streamUrl: `/api/agency/video/assets/${encodeURIComponent(job.outputAssetId)}/stream`,
    title: job.prompt?.trim() ? job.prompt.trim() : null,
    format: job.aspectRatio ?? null,
  }
}
