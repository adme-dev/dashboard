import { describe, expect, it } from 'vitest'
import { derivativeTimelinePayload } from '~~/app/utils/video/assetDerivativeTimeline'

describe('derivativeTimelinePayload', () => {
  it('turns an edited-image derivative into a still timeline payload with a playable stream URL', () => {
    expect(derivativeTimelinePayload({
      id: 'derivative-1',
      sourceAssetId: 'asset-1',
      kind: 'edited-image',
      r2Key: 'video-asset-derivatives/project-1/derivative-1.png',
      width: 1080,
      height: 1920,
    })).toEqual({
      assetId: null,
      sourceAssetId: 'asset-1',
      r2Key: 'video-asset-derivatives/project-1/derivative-1.png',
      streamUrl: '/api/agency/video/derivatives/derivative-1/stream',
      durationSec: 5,
      title: 'edited-image derivative',
      format: null,
      baseSource: 'still_kenburns',
    })
  })

  it('turns an mp4 derivative into an uploaded footage timeline payload', () => {
    expect(derivativeTimelinePayload({
      id: 'derivative-2',
      sourceAssetId: 'asset-2',
      kind: 'motion-fill',
      r2Key: 'video-asset-derivatives/project-1/derivative-2.MP4',
      width: 1080,
      height: 1920,
    })).toEqual({
      assetId: null,
      sourceAssetId: 'asset-2',
      r2Key: 'video-asset-derivatives/project-1/derivative-2.MP4',
      streamUrl: '/api/agency/video/derivatives/derivative-2/stream',
      durationSec: 5,
      title: 'motion-fill derivative',
      format: null,
      baseSource: 'uploaded_footage',
    })
  })
})
