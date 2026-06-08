import { describe, it, expect } from 'vitest'
import { validateFileType, validateFileSize } from '~~/server/utils/storage'

describe('media upload categories', () => {
  it('accepts mp4/webm/quicktime for media-video up to 500MB', () => {
    expect(validateFileType('video/mp4', 'media-video')).toBe(true)
    expect(validateFileType('video/webm', 'media-video')).toBe(true)
    expect(validateFileType('video/quicktime', 'media-video')).toBe(true)
    expect(validateFileType('image/png', 'media-video')).toBe(false)
    expect(validateFileSize(500 * 1024 * 1024, 'media-video')).toBe(true)
    expect(validateFileSize(500 * 1024 * 1024 + 1, 'media-video')).toBe(false)
  })
  it('accepts jpeg/png/webp for media-image up to 50MB', () => {
    expect(validateFileType('image/jpeg', 'media-image')).toBe(true)
    expect(validateFileType('image/png', 'media-image')).toBe(true)
    expect(validateFileType('image/webp', 'media-image')).toBe(true)
    expect(validateFileType('video/mp4', 'media-image')).toBe(false)
    expect(validateFileSize(50 * 1024 * 1024, 'media-image')).toBe(true)
  })
})
