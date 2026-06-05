import { describe, expect, it } from 'vitest'
import {
  EMAIL_IMAGE_ASSET_ACCEPT,
  EMAIL_IMAGE_ASSET_MAX_BYTES,
  emailImageAssetStorageName,
  formatEmailImageAssetSize,
  isAllowedEmailImageMime,
  isWithinEmailImageAssetLimit,
  normaliseEmailImageAssetUrl
} from '~~/app/utils/edmImageAssets'

describe('edmImageAssets', () => {
  it('allows email-safe raster image MIME types only', () => {
    expect(isAllowedEmailImageMime('image/jpeg')).toBe(true)
    expect(isAllowedEmailImageMime('image/png')).toBe(true)
    expect(isAllowedEmailImageMime('image/gif')).toBe(true)
    expect(isAllowedEmailImageMime('image/webp')).toBe(true)
    expect(isAllowedEmailImageMime('image/svg+xml')).toBe(false)
    expect(isAllowedEmailImageMime('application/pdf')).toBe(false)
    expect(EMAIL_IMAGE_ASSET_ACCEPT).toContain('image/png')
  })

  it('uses a 200 MB default upload cap for email image assets', () => {
    expect(EMAIL_IMAGE_ASSET_MAX_BYTES).toBe(200 * 1024 * 1024)
    expect(isWithinEmailImageAssetLimit(EMAIL_IMAGE_ASSET_MAX_BYTES)).toBe(true)
    expect(isWithinEmailImageAssetLimit(EMAIL_IMAGE_ASSET_MAX_BYTES + 1)).toBe(false)
  })

  it('formats asset sizes for the picker UI', () => {
    expect(formatEmailImageAssetSize(512)).toBe('512 B')
    expect(formatEmailImageAssetSize(1536)).toBe('1.5 KB')
    expect(formatEmailImageAssetSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('sanitizes storage names while preserving useful extensions', () => {
    expect(emailImageAssetStorageName('Hero Car #1.png')).toBe('Hero-Car-1.png')
    expect(emailImageAssetStorageName('')).toBe('email-image')
  })

  it('normalizes asset URLs so imported HTML image sanitization can accept local uploads', () => {
    expect(normaliseEmailImageAssetUrl('/api/_uploads/banner-assets/user/Hero car #1.png'))
      .toBe('/api/_uploads/banner-assets/user/Hero%20car%20%231.png')
  })
})
