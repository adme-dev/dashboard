import { describe, expect, it } from 'vitest'
import { isVideoMediaUrl } from '../../app/utils/social/videoMedia'

describe('social video URL detection', () => {
  it('recognises signed assets and renders without extensions', () => {
    expect(isVideoMediaUrl('https://app.xeroflow.io/api/public/video-assets/token.signature')).toBe(true)
    expect(isVideoMediaUrl('/api/public/renders/token.signature')).toBe(true)
  })
  it('recognises file URLs with query parameters', () => {
    expect(isVideoMediaUrl('https://example.com/clip.MP4?signature=abc')).toBe(true)
    expect(isVideoMediaUrl('https://example.com/clip.webm')).toBe(true)
  })
  it('keeps images and missing media out of the video branch', () => {
    expect(isVideoMediaUrl('https://example.com/artwork.jpg')).toBe(false)
    expect(isVideoMediaUrl('https://example.com/image.png?label=clip.mp4')).toBe(false)
    expect(isVideoMediaUrl(null)).toBe(false)
  })
})
