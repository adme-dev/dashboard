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
