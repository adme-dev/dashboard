import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  path: string
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRequestURL: (event: TestEvent) => URL
  setHeader: (event: TestEvent, name: string, value: string) => void
  removeResponseHeader: (event: TestEvent, name: string) => void
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRequestURL = event => new URL(event.path, 'https://app.xeroflow.io')
testGlobal.setHeader = vi.fn()
testGlobal.removeResponseHeader = vi.fn()

const { default: portalSecurityMiddleware } = await import(
  '../../../server/middleware/05-portal-security'
)

describe('portal response security middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents storage and reuse of every portal API response', () => {
    const event = { path: '/api/portal/dashboard' }
    portalSecurityMiddleware(event as never)

    expect(testGlobal.setHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'private, no-store, max-age=0'
    )
    expect(testGlobal.setHeader).toHaveBeenCalledWith(event, 'Pragma', 'no-cache')
    expect(testGlobal.setHeader).toHaveBeenCalledWith(event, 'Expires', '0')
  })

  it('adds browser hardening headers to portal documents and API responses', () => {
    const event = { path: '/portal/projects' }
    portalSecurityMiddleware(event as never)

    expect(testGlobal.setHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'private, no-store, max-age=0'
    )
    expect(testGlobal.setHeader).toHaveBeenCalledWith(event, 'X-Frame-Options', 'DENY')
    expect(testGlobal.setHeader).toHaveBeenCalledWith(event, 'X-Content-Type-Options', 'nosniff')
    expect(testGlobal.setHeader).toHaveBeenCalledWith(event, 'Referrer-Policy', 'no-referrer')
    expect(testGlobal.removeResponseHeader).toHaveBeenCalledWith(event, 'X-Powered-By')
    expect(testGlobal.setHeader).toHaveBeenCalledWith(
      event,
      'Content-Security-Policy',
      expect.stringContaining(`frame-ancestors 'none'`)
    )
  })

  it('does not apply portal cache policy to unrelated API routes', () => {
    portalSecurityMiddleware({ path: '/api/projects' } as never)
    expect(testGlobal.setHeader).not.toHaveBeenCalled()
  })
})
