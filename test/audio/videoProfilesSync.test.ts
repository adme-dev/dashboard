// test/audio/videoProfilesSync.test.ts — parity guard between the TypeScript
// source-of-truth and the plain-JS .mjs mirror. Mirrors videoCompositeGraphSync.test.ts.
import { describe, it, expect } from 'vitest'
import { DEFAULT_VIDEO_FORMATS, videoFormatFor } from '~~/server/utils/audio/videoProfiles'
// @ts-expect-error — .mjs port, no types
import { DEFAULT_VIDEO_FORMATS as mjsFormats, videoFormatFor as mjsFormatFor } from '../../workers/audio-jobs/container/videoProfiles.mjs'

const KEYS = ['reels_9x16', 'square_1x1', 'youtube_16x9'] as const

describe('videoProfiles .ts ↔ .mjs parity', () => {
  it('DEFAULT_VIDEO_FORMATS are identical for all three keys', () => {
    for (const key of KEYS) {
      expect(mjsFormats[key]).toEqual(DEFAULT_VIDEO_FORMATS[key])
    }
  })

  it('videoFormatFor returns identical objects for all three keys', () => {
    for (const key of KEYS) {
      expect(mjsFormatFor(key)).toEqual(videoFormatFor(key))
    }
  })

  it('videoFormatFor returns null for an unknown key in both', () => {
    expect(videoFormatFor('unknown_bogus')).toBeNull()
    expect(mjsFormatFor('unknown_bogus')).toBeNull()
  })

  it('videoFormatFor applies overrides identically in both', () => {
    const tsResult = videoFormatFor('reels_9x16', { fps: 25 })
    const mjsResult = mjsFormatFor('reels_9x16', { fps: 25 })
    expect(mjsResult).toEqual(tsResult)
    expect(tsResult!.fps).toBe(25)
  })
})
