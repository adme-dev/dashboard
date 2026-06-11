import { describe, expect, it } from 'vitest'
import { createVideoSourceRegistry, mergeVideoSource, videoSourceRecord } from '~~/app/utils/video/videoSourceRegistry'

describe('videoSourceRegistry', () => {
  it('normalizes and exposes playable video sources by R2 key', () => {
    const registry = createVideoSourceRegistry()

    mergeVideoSource(registry, {
      r2Key: 'video-generation/agency/job/output.mp4',
      url: '/api/agency/video/assets/a1/stream',
      durationSec: null,
      assetId: 'a1',
      title: 'Generated spot',
      format: '9:16',
    })

    expect(registry.get('video-generation/agency/job/output.mp4')).toMatchObject({
      r2Key: 'video-generation/agency/job/output.mp4',
      url: '/api/agency/video/assets/a1/stream',
      durationSec: 5,
      assetId: 'a1',
      title: 'Generated spot',
      format: '9:16',
    })
    expect(videoSourceRecord(registry)).toEqual({
      'video-generation/agency/job/output.mp4': '/api/agency/video/assets/a1/stream',
    })
  })

  it('keeps the last registered URL while preserving a valid duration', () => {
    const registry = createVideoSourceRegistry()

    mergeVideoSource(registry, { r2Key: 'k.mp4', url: '/old.mp4', durationSec: 8 })
    mergeVideoSource(registry, { r2Key: 'k.mp4', url: '/new.mp4', durationSec: 0 })

    expect(registry.get('k.mp4')).toMatchObject({
      url: '/new.mp4',
      durationSec: 8,
    })
  })
})
