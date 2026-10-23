import { describe, expect, it, vi } from 'vitest'

import { uploadBannerMp4 } from '~~/workers/audio-jobs/src/bannerRenderContainer'

describe('uploadBannerMp4', () => {
  it('returns the private same-origin job download route after storing the MP4', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const result = await uploadBannerMp4(
      { AUDIO_BUCKET: { put } } as Parameters<typeof uploadBannerMp4>[0],
      '22222222-2222-4222-8222-222222222222',
      'leaderboard',
      new Uint8Array([1, 2, 3]),
      '11111111-1111-4111-8111-111111111111'
    )

    expect(result).toEqual({
      r2Key: 'banner-videos/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111.mp4',
      url: '/api/agency/banner-studio/export-video/jobs/11111111-1111-4111-8111-111111111111/download',
      size: 3
    })
  })

  it('isolates attempt objects while retaining the stable job download URL', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const env = { AUDIO_BUCKET: { put } } as Parameters<typeof uploadBannerMp4>[0]
    const first = await uploadBannerMp4(env, 'project', 'format', new Uint8Array([1]), 'job', 'first-attempt')
    const second = await uploadBannerMp4(env, 'project', 'format', new Uint8Array([2]), 'job', 'second-attempt')
    expect(first.r2Key).not.toBe(second.r2Key)
    expect(first.url).toBe(second.url)
    expect(second.url).toBe('/api/agency/banner-studio/export-video/jobs/job/download')
  })

  it('does not embed an unsafe format key in the R2 object path', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const result = await uploadBannerMp4(
      { AUDIO_BUCKET: { put } } as Parameters<typeof uploadBannerMp4>[0],
      '22222222-2222-4222-8222-222222222222',
      '../日本語 / takeover',
      new Uint8Array([1]),
      '11111111-1111-4111-8111-111111111111'
    )

    expect(result.r2Key).toBe('banner-videos/22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111.mp4')
  })
})
