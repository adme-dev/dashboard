import { describe, it, expect, vi, beforeEach } from 'vitest'

// registry.getProviderOrThrow uses the global createError (Nitro auto-import)
;(globalThis as any).createError = (opts: { statusCode: number; message?: string; statusMessage?: string }) => {
  const e = new Error(opts.message ?? opts.statusMessage ?? 'error') as any
  e.statusCode = opts.statusCode
  return e
}

import { getSupportedPlatforms, getProviderOrThrow, getProvider, PLATFORM_LIMITS } from '../../server/utils/social-providers/registry'
import { facebookProvider } from '../../server/utils/social-providers/facebook'

describe('provider registry', () => {
  it('registers the 6 v1 platforms', () => {
    expect(getSupportedPlatforms().sort()).toEqual(
      ['facebook', 'google-business', 'instagram', 'linkedin', 'tiktok', 'youtube'],
    )
  })
  it('resolves a known platform', () => {
    expect(getProvider('facebook')).toBe(facebookProvider)
    expect(getProviderOrThrow('instagram').identifier).toBe('instagram')
  })
  it('throws on an unknown platform', () => {
    expect(() => getProviderOrThrow('myspace')).toThrow()
  })
  it('exposes platform limits for every registered platform', () => {
    for (const p of getSupportedPlatforms()) {
      expect(PLATFORM_LIMITS[p]).toBeTruthy()
      expect(PLATFORM_LIMITS[p].maxTextLength).toBeGreaterThan(0)
    }
  })
})

describe('facebookProvider.post', () => {
  beforeEach(() => {
    vi.stubGlobal('$fetch', vi.fn(async () => ({ id: '123_456' })))
  })
  it('returns platformPostId + url on a text-only post', async () => {
    const r = await facebookProvider.post({
      accountId: 'PAGE1', accessToken: 'tok', content: 'hello world', media: [],
    })
    expect(r.status).toBe('success')
    expect(r.platformPostId).toBe('123_456')
    expect(r.url).toBe('https://www.facebook.com/123/posts/456')
  })
})
