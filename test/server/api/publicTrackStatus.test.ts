import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers: Record<string, string>
  status?: number
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  setResponseHeaders: (event: TestEvent, headers: Record<string, string>) => void
  setResponseStatus: (event: TestEvent, status: number) => void
  getQuery: ReturnType<typeof vi.fn>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.setResponseHeaders = (event, headers) => {
  event.headers = headers
}
testGlobal.setResponseStatus = (event, status) => {
  event.status = status
}
testGlobal.getQuery = vi.fn()

const { default: statusHandler } = await import('../../../../server/api/public/track.get')

describe('GET /api/public/track', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a safe human-readable endpoint disclosure without inspecting the write key', () => {
    const event: TestEvent = { headers: {} }

    const html = statusHandler(event)

    expect(event.status).toBe(200)
    expect(event.headers).toMatchObject({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    })
    expect(html).toContain('Zero Flow Tracking Endpoint')
    expect(html).toContain('receives website interaction events')
    expect(html).toContain('Privacy Policy')
    expect(html).not.toContain('xf_')
    expect(testGlobal.getQuery).not.toHaveBeenCalled()
  })
})
