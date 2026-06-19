import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

export interface VideoStudioAssetGovernanceBadge {
  label: string
  color: 'primary' | 'success' | 'error' | 'warning' | 'neutral'
}

export function videoStudioAssetGovernanceBadges(asset: VideoStudioAsset): VideoStudioAssetGovernanceBadge[] {
  return [
    { label: provenanceLabel(asset), color: 'neutral' },
    { label: rightsLabel(asset), color: rightsColor(asset) },
  ]
}

function provenanceLabel(asset: VideoStudioAsset) {
  if (asset.type === 'job' || asset.source === 'generation') return 'Origin: AI'
  if (asset.source === 'render') return 'Origin: Render'
  if (asset.type === 'derivative' || asset.source === 'derivative') return 'Origin: Derivative'
  if (asset.source === 'audio') return asset.role === 'music' ? 'Origin: Music' : 'Origin: Voice'
  if (asset.source === 'banner') return 'Origin: Banner'
  if (asset.source === 'bucket') return 'Origin: Brief'
  return 'Origin: Upload'
}

function rightsLabel(asset: VideoStudioAsset) {
  if (asset.type === 'job' || asset.source === 'generation') return 'Rights: AI review'
  if (asset.source === 'render' || asset.source === 'derivative') return 'Rights: Inherits source'
  if (asset.source === 'audio') return asset.role === 'music' ? 'Rights: Music review' : 'Rights: Script-owned'
  if (asset.source === 'banner') return 'Rights: Brand-owned'
  return 'Rights: Review'
}

function rightsColor(asset: VideoStudioAsset): VideoStudioAssetGovernanceBadge['color'] {
  if (asset.type === 'job' || asset.source === 'generation' || asset.role === 'music') return 'warning'
  if (asset.source === 'render' || asset.source === 'derivative' || asset.source === 'audio' || asset.source === 'banner') return 'success'
  return 'neutral'
}
