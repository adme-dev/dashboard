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

export interface AudioStudioTimelineSource {
  id: string
  r2KeyMaster: string | null
  title?: string | null
  kind: 'voiceover' | 'music'
  status: string
  streamUrl?: string | null
}

export interface AudioStudioTimelinePayload {
  id: string
  r2_key_master: string
  title: string | null
  kind: 'voiceover' | 'music'
  streamUrl?: string
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

export function audioStudioTimelinePayload(asset: AudioStudioTimelineSource): AudioStudioTimelinePayload | null {
  if (!asset.r2KeyMaster) return null
  if (asset.status !== 'ready' && asset.status !== 'done') return null

  return {
    id: asset.id,
    r2_key_master: asset.r2KeyMaster,
    title: asset.title ?? null,
    kind: asset.kind,
    streamUrl: asset.streamUrl ?? undefined,
  }
}
