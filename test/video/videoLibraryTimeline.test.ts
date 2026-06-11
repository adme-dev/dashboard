import { describe, expect, it } from 'vitest'
import { videoLibraryTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'

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
})
