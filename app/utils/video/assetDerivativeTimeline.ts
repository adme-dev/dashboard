export interface AssetDerivativeTimelineInput {
  id: string
  sourceAssetId: string | null
  kind: string
  r2Key: string
  width?: number | null
  height?: number | null
  durationSec?: number | null
}

export interface AssetDerivativeTimelinePayload {
  assetId: string | null
  sourceAssetId: string | null
  r2Key: string
  streamUrl: string
  durationSec: number
  title: string
  format: string | null
  baseSource: 'uploaded_footage' | 'still_kenburns'
}

export function derivativeTimelinePayload(derivative: AssetDerivativeTimelineInput): AssetDerivativeTimelinePayload {
  return {
    assetId: null,
    sourceAssetId: derivative.sourceAssetId ?? null,
    r2Key: derivative.r2Key,
    streamUrl: `/api/agency/video/derivatives/${encodeURIComponent(derivative.id)}/stream`,
    durationSec: typeof derivative.durationSec === 'number' && Number.isFinite(derivative.durationSec) && derivative.durationSec > 0
      ? derivative.durationSec
      : 5,
    title: `${derivative.kind} derivative`,
    format: null,
    baseSource: /\.mp4$/i.test(derivative.r2Key) ? 'uploaded_footage' : 'still_kenburns',
  }
}
