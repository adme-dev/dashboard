import { describe, expect, it } from 'vitest'
import { videoGenerationJobTimelinePayload, videoLibraryTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'

describe('videoLibraryTimelinePayload', () => {
  it('includes the stable stream URL needed by the editor preview source map', () => {
    expect(videoLibraryTimelinePayload({
      id: 'asset-1',
      r2Key: 'video-generation/agency/job-1/output.mp4',
      durationSec: null,
      title: 'Generated spot',
      format: '9:16',
    })).toEqual({
      assetId: 'asset-1',
      r2Key: 'video-generation/agency/job-1/output.mp4',
      durationSec: 5,
      streamUrl: '/api/agency/video/assets/asset-1/stream',
      title: 'Generated spot',
      format: '9:16',
    })
  })

  it('builds the same timeline payload from a succeeded generation job', () => {
    expect(videoGenerationJobTimelinePayload({
      outputAssetId: 'asset generated/1',
      outputR2Key: 'video-generation/agency/job-2/output.mp4',
      durationSeconds: 8,
      aspectRatio: '9:16',
      prompt: '  showroom walkaround  ',
    })).toEqual({
      assetId: 'asset generated/1',
      r2Key: 'video-generation/agency/job-2/output.mp4',
      durationSec: 8,
      streamUrl: '/api/agency/video/assets/asset%20generated%2F1/stream',
      title: 'showroom walkaround',
      format: '9:16',
    })
  })

  it('does not build a timeline payload for unfinished generation jobs', () => {
    expect(videoGenerationJobTimelinePayload({
      outputAssetId: null,
      outputR2Key: 'video-generation/agency/job-3/output.mp4',
    })).toBeNull()
    expect(videoGenerationJobTimelinePayload({
      outputAssetId: 'asset-3',
      outputR2Key: null,
    })).toBeNull()
  })
})
