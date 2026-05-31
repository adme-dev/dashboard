import { describe, it, expect } from 'vitest'
import { isOriginAllowed, _cacheIsFresh, shouldBlockOrigin } from '../../../../server/utils/tracking/site-config'

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

describe('shouldBlockOrigin', () => {
  const enforcing = { allowedOrigins: ['https://www.kia.gws.com.au'], enforceOrigin: true } as any
  it('blocks a foreign origin when enforcing with a populated allowlist', () => {
    expect(shouldBlockOrigin(enforcing, 'https://evil.example.com', undefined)).toBe(true)
  })
  it('allows a listed origin when enforcing', () => {
    expect(shouldBlockOrigin(enforcing, 'https://www.kia.gws.com.au', undefined)).toBe(false)
  })
  it('never blocks when enforce_origin is false (per-site soft default)', () => {
    expect(shouldBlockOrigin({ allowedOrigins: ['https://x.com'], enforceOrigin: false } as any, 'https://evil.com', undefined)).toBe(false)
  })
  it('never blocks an empty allowlist even when enforcing (allow-all)', () => {
    expect(shouldBlockOrigin({ allowedOrigins: [], enforceOrigin: true } as any, 'https://anything', undefined)).toBe(false)
  })
  it('global TRACKING_ORIGIN_MODE=soft override never blocks', () => {
    expect(shouldBlockOrigin(enforcing, 'https://evil.example.com', 'soft')).toBe(false)
  })
})
