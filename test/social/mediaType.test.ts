import { describe, it, expect } from 'vitest'
import { mediaTypeForUrl } from '~~/server/utils/socialPublishing'

describe('mediaTypeForUrl', () => {
  it('classifies common video URLs as video', () => {
    expect(mediaTypeForUrl('https://x/y.mp4')).toBe('video')
    expect(mediaTypeForUrl('https://x/y.mov')).toBe('video')
    expect(mediaTypeForUrl('https://x/api/public/renders/abc.def')).toBe('video')
  })
  it('classifies images as image', () => {
    expect(mediaTypeForUrl('https://x/y.jpg')).toBe('image')
    expect(mediaTypeForUrl('https://x/y.png')).toBe('image')
  })
})
