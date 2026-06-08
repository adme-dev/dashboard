import { describe, it, expect } from 'vitest'
import { videoFormatFor, DEFAULT_VIDEO_FORMATS } from '~~/server/utils/audio/videoProfiles'

describe('videoFormatFor', () => {
  it('returns the reels 9:16 profile', () => {
    const f = videoFormatFor('reels_9x16')!
    expect(f.width).toBe(1080); expect(f.height).toBe(1920); expect(f.fps).toBe(30); expect(f.codec).toBe('h264')
  })
  it('returns square and youtube profiles', () => {
    expect(videoFormatFor('square_1x1')!.width).toBe(1080)
    expect(videoFormatFor('square_1x1')!.height).toBe(1080)
    expect(videoFormatFor('youtube_16x9')!.width).toBe(1920)
    expect(videoFormatFor('youtube_16x9')!.height).toBe(1080)
  })
  it('returns null for unknown and applies overrides', () => {
    expect(videoFormatFor('nope')).toBeNull()
    expect(videoFormatFor('reels_9x16', { fps: 25 })!.fps).toBe(25)
  })
  it('has three default formats', () => {
    expect(Object.keys(DEFAULT_VIDEO_FORMATS)).toHaveLength(3)
  })
})
