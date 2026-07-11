import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const middleware = readFileSync('server/middleware/hr-privacy.ts', 'utf8')

describe('HR privacy response headers middleware', () => {
  it('covers every agency HR API route and only that route boundary', () => {
    expect(middleware).toContain("pathname.startsWith('/api/agency/hr')")
    expect(middleware).toContain("pathname !== '/api/agency/hr'")
  })

  it('prevents shared caching, browser persistence, and indexing', () => {
    expect(middleware).toContain("'Cache-Control', 'private, no-store, max-age=0'")
    expect(middleware).toContain("'Pragma', 'no-cache'")
    expect(middleware).toContain("'Expires', '0'")
    expect(middleware).toContain("'X-Robots-Tag', 'noindex, nofollow, noarchive'")
  })
})
