import { describe, expect, it } from 'vitest'
import { videoStudioAssetGovernanceBadges } from '~~/app/utils/video/videoStudioAssetGovernance'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

function asset(overrides: Partial<VideoStudioAsset>): VideoStudioAsset {
  return {
    id: 'video:asset-1',
    rawId: 'asset-1',
    libraryAssetId: 'asset-1',
    type: 'video',
    source: 'library',
    title: 'Uploaded clip',
    subtitle: null,
    status: 'ready',
    modelId: null,
    bucketId: null,
    role: null,
    prompt: null,
    r2Key: 'uploads/clip.mp4',
    previewUrl: null,
    thumbnailUrl: null,
    captionVttKey: null,
    captionVttUrl: null,
    transcript: null,
    durationSec: 5,
    format: null,
    timelineReady: true,
    createdAt: null,
    ...overrides,
  }
}

describe('videoStudioAssetGovernanceBadges', () => {
  it('labels generated assets for AI provenance and rights review', () => {
    expect(videoStudioAssetGovernanceBadges(asset({ source: 'generation', modelId: 'aigateway/seedance-i2v' })).map(badge => badge.label))
      .toEqual(['Origin: AI', 'Rights: AI review'])
  })

  it('labels rendered and derivative assets as inherited output', () => {
    expect(videoStudioAssetGovernanceBadges(asset({ source: 'render' })).map(badge => badge.label))
      .toEqual(['Origin: Render', 'Rights: Inherits source'])
    expect(videoStudioAssetGovernanceBadges(asset({ type: 'derivative', source: 'derivative' })).map(badge => badge.label))
      .toEqual(['Origin: Derivative', 'Rights: Inherits source'])
  })

  it('labels uploaded, voice, music, and banner assets with operator review state', () => {
    expect(videoStudioAssetGovernanceBadges(asset({ source: 'library' })).map(badge => badge.label))
      .toEqual(['Origin: Upload', 'Rights: Review'])
    expect(videoStudioAssetGovernanceBadges(asset({ type: 'audio', source: 'audio', role: 'voiceover' })).map(badge => badge.label))
      .toEqual(['Origin: Voice', 'Rights: Script-owned'])
    expect(videoStudioAssetGovernanceBadges(asset({ type: 'audio', source: 'audio', role: 'music' })).map(badge => badge.label))
      .toEqual(['Origin: Music', 'Rights: Music review'])
    expect(videoStudioAssetGovernanceBadges(asset({ type: 'overlay', source: 'banner' })).map(badge => badge.label))
      .toEqual(['Origin: Banner', 'Rights: Brand-owned'])
  })
})
