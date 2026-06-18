import type { VideoStudioClipInspectorSummary } from '~~/app/utils/video/clipInspector'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

export function canReplaceVideoStudioClip(input: {
  clip: VideoStudioClipInspectorSummary | null | undefined
  asset: VideoStudioAsset | null | undefined
}): boolean {
  const { clip, asset } = input
  if (!clip || !asset?.timelineReady) return false

  if (clip.kind === 'video') {
    return Boolean(asset.r2Key && (asset.type === 'video' || asset.type === 'job' || asset.type === 'derivative'))
  }

  if (clip.kind === 'audio') {
    return Boolean(asset.r2Key && asset.type === 'audio')
  }

  if (clip.kind === 'overlay') {
    return Boolean(asset.format && asset.type === 'overlay')
  }

  if (clip.kind === 'caption') {
    return Boolean(asset.captionVttUrl && asset.transcript?.trim())
  }

  return false
}
