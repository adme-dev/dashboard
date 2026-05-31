import { describe, it, expect } from 'vitest'
import { isOriginAllowed, _cacheIsFresh } from '../../../../server/utils/tracking/site-config'

describe('isOriginAllowed', () => {
  const site = { allowedOrigins: ['https://www.kia.gws.com.au'] } as any
  it('matches an allowed origin', () => {
    expect(isOriginAllowed(site, 'https://www.kia.gws.com.au')).toBe(true)
  })
  it('rejects a foreign origin', () => {
    expect(isOriginAllowed(site, 'https://evil.example.com')).toBe(false)
  })
  it('treats empty allowlist as allow-all (Slice 1 soft mode)', () => {
    expect(isOriginAllowed({ allowedOrigins: [] } as any, 'https://anything')).toBe(true)
  })
})

describe('_cacheIsFresh', () => {
  it('fresh within TTL', () => {
    expect(_cacheIsFresh(1000, 1000 + 60_000, 300_000)).toBe(true)
  })
  it('stale past TTL', () => {
    expect(_cacheIsFresh(1000, 1000 + 400_000, 300_000)).toBe(false)
  })
})
