import { describe, expect, it } from 'vitest'
import { imageContentTypeForR2Key } from '~~/server/utils/video-generation/sourceContentTypes'

describe('imageContentTypeForR2Key', () => {
  it('maps supported image extensions case-insensitively', () => {
    expect(imageContentTypeForR2Key('media/p/car.JPG')).toBe('image/jpeg')
    expect(imageContentTypeForR2Key('media/p/car.jpeg')).toBe('image/jpeg')
    expect(imageContentTypeForR2Key('media/p/car.png')).toBe('image/png')
    expect(imageContentTypeForR2Key('media/p/car.webp')).toBe('image/webp')
    expect(imageContentTypeForR2Key('media/p/car.gif')).toBe('image/gif')
  })

  it('returns null for unsupported or missing extensions', () => {
    expect(imageContentTypeForR2Key('media/p/clip.mp4')).toBeNull()
    expect(imageContentTypeForR2Key('media/p/no-extension')).toBeNull()
    expect(imageContentTypeForR2Key('')).toBeNull()
  })
})
