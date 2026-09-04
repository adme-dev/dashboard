import { describe, expect, it } from 'vitest'

import { isSupportedPageStudioImage } from '~~/server/utils/pageStudio/siteOperations'

describe('Page Studio site operations', () => {
  it('accepts only image bytes that match the declared safe media type', () => {
    expect(isSupportedPageStudioImage(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true)
    expect(isSupportedPageStudioImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png')).toBe(true)
    expect(isSupportedPageStudioImage(new TextEncoder().encode('GIF89a'), 'image/gif')).toBe(true)
    expect(isSupportedPageStudioImage(new TextEncoder().encode('RIFFxxxxWEBP'), 'image/webp')).toBe(true)
    expect(isSupportedPageStudioImage(new TextEncoder().encode('<svg><script>'), 'image/svg+xml')).toBe(false)
    expect(isSupportedPageStudioImage(new TextEncoder().encode('not an image'), 'image/png')).toBe(false)
  })
})
