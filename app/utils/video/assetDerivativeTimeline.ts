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
  r2Key: string
  durationSec: number
  title: string
  format: string | null
  baseSource: 'uploaded_footage' | 'still_kenburns'
}

export function derivativeTimelinePayload(derivative: AssetDerivativeTimelineInput): AssetDerivativeTimelinePayload {
  return {
    assetId: derivative.sourceAssetId ?? null,
    r2Key: derivative.r2Key,
    durationSec: typeof derivative.durationSec === 'number' && Number.isFinite(derivative.durationSec) && derivative.durationSec > 0
      ? derivative.durationSec
      : 5,
    title: `${derivative.kind} derivative`,
    format: null,
    baseSource: /\.mp4$/i.test(derivative.r2Key) ? 'uploaded_footage' : 'still_kenburns',
  }
}
