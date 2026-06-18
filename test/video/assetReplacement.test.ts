import { describe, expect, it } from 'vitest'
import { canReplaceVideoStudioClip } from '~~/app/utils/video/assetReplacement'
import type { VideoStudioClipInspectorSummary } from '~~/app/utils/video/clipInspector'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

function clip(kind: VideoStudioClipInspectorSummary['kind']): VideoStudioClipInspectorSummary {
  return {
    clipId: `${kind}-1`,
    kind,
    trackId: kind,
    trackName: kind,
    trackKind: kind,
    label: `${kind} clip`,
    sourceLabel: 'source',
    startSec: 0,
    durationSec: 5,
    endSec: 5,
    details: [],
  }
}

function asset(overrides: Partial<VideoStudioAsset> = {}): VideoStudioAsset {
  return {
    id: 'video:asset-1',
    rawId: 'asset-1',
    libraryAssetId: 'asset-1',
    type: 'video',
    source: 'library',
    title: 'Replacement asset',
    subtitle: null,
    status: 'ready',
    modelId: null,
    bucketId: null,
    role: null,
    prompt: null,
    r2Key: 'media/replacement.mp4',
    previewUrl: '/api/agency/video/assets/asset-1/stream',
    thumbnailUrl: null,
    captionVttKey: null,
    captionVttUrl: null,
    transcript: null,
    durationSec: 5,
    format: '9:16',
    timelineReady: true,
    createdAt: null,
    ...overrides,
  }
}

describe('canReplaceVideoStudioClip', () => {
  it('allows compatible video, audio, overlay, and caption replacements', () => {
    expect(canReplaceVideoStudioClip({ clip: clip('video'), asset: asset() })).toBe(true)
    expect(canReplaceVideoStudioClip({
      clip: clip('audio'),
      asset: asset({ type: 'audio', source: 'audio', libraryAssetId: null, r2Key: 'audio/vo.mp3', role: 'voiceover' }),
    })).toBe(true)
    expect(canReplaceVideoStudioClip({
      clip: clip('overlay'),
      asset: asset({ type: 'overlay', source: 'banner', libraryAssetId: null, r2Key: null, rawId: 'banner-1:story', format: 'story' }),
    })).toBe(true)
    expect(canReplaceVideoStudioClip({
      clip: clip('caption'),
      asset: asset({ captionVttUrl: '/captions.vtt', transcript: 'Caption text' }),
    })).toBe(true)
  })

  it('blocks unavailable or incompatible replacements', () => {
    expect(canReplaceVideoStudioClip({ clip: null, asset: asset() })).toBe(false)
    expect(canReplaceVideoStudioClip({ clip: clip('video'), asset: asset({ timelineReady: false }) })).toBe(false)
    expect(canReplaceVideoStudioClip({ clip: clip('audio'), asset: asset() })).toBe(false)
    expect(canReplaceVideoStudioClip({ clip: clip('caption'), asset: asset({ captionVttUrl: '/captions.vtt', transcript: '' }) })).toBe(false)
  })
})
