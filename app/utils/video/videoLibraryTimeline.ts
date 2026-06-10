export interface VideoLibraryTimelineAsset {
  id: string
  r2Key: string
  durationSec: number | null
}

export interface VideoLibraryTimelinePayload {
  r2Key: string
  durationSec: number
  streamUrl: string
}

export function videoLibraryTimelinePayload(asset: VideoLibraryTimelineAsset): VideoLibraryTimelinePayload {
  return {
    r2Key: asset.r2Key,
    durationSec: asset.durationSec ?? 5,
    streamUrl: `/api/agency/video/assets/${encodeURIComponent(asset.id)}/stream`,
  }
}
