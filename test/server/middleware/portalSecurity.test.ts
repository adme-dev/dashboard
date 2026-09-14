import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  path: string
}

let editorUrl: unknown = ''

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRequestURL: (event: TestEvent) => URL
  setHeader: (event: TestEvent, name: string, value: string) => void
  removeResponseHeader: (event: TestEvent, name: string) => void
  useRuntimeConfig: (event: TestEvent) => { public: { pageStudioEditorUrl: unknown } }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRequestURL = event => new URL(event.path, 'https://app.xeroflow.io')
testGlobal.setHeader = vi.fn()
testGlobal.removeResponseHeader = vi.fn()
testGlobal.useRuntimeConfig = () => ({ public: { pageStudioEditorUrl: editorUrl } })

const { default: portalSecurityMiddleware } = await import(
  '../../../server/middleware/05-portal-security'
)

describe('portal response security middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    editorUrl = ''
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

  it('also protects client-portal APIs used by analytics and CRM pages', () => {
    const event = { path: '/api/client-portal/analytics/personas' }
    portalSecurityMiddleware(event as never)

    expect(testGlobal.setHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'private, no-store, max-age=0'
    )
    expect(testGlobal.setHeader).toHaveBeenCalledWith(event, 'X-Frame-Options', 'DENY')
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

  it('permits the Cloudflare Web Analytics beacon on portal documents', () => {
    const event = { path: '/portal' }
    portalSecurityMiddleware(event as never)

    const csp = vi.mocked(testGlobal.setHeader).mock.calls
      .find(([, name]) => name === 'Content-Security-Policy')?.[2]
    const scriptSources = csp
      ?.split('; ')
      .find(directive => directive.startsWith('script-src '))
      ?.split(' ')
      .slice(1)

    expect(scriptSources).toEqual([
      `'self'`,
      `'unsafe-inline'`,
      'https://static.cloudflareinsights.com'
    ])
  })

  it('does not apply portal cache policy to unrelated API routes', () => {
    portalSecurityMiddleware({ path: '/api/projects' } as never)
    expect(testGlobal.setHeader).not.toHaveBeenCalled()
  })

  it.each(['/portal/page-studio', '/portal', '/portal/login', '/portal/projects'])(
    'permits editor launch after client-side navigation from %s', (path) => {
      editorUrl = 'https://studio-staging.xeroflow.io/editor?view=canvas'
      const event = { path }
      portalSecurityMiddleware(event as never)
      const csp = vi.mocked(testGlobal.setHeader).mock.calls
        .find(([, name]) => name === 'Content-Security-Policy')?.[2]
      expect(csp?.split('; ').find(value => value.startsWith('form-action ')))
        .toBe('form-action \'self\' https://studio-staging.xeroflow.io')
      expect(csp).toContain('frame-ancestors \'none\'')
    }
  )

  it.each([
    '', undefined, 'invalid', 'http://studio-staging.xeroflow.io',
    'https://user:password@studio-staging.xeroflow.io',
    'https://*.xeroflow.io', 'https://studio.xeroflow.io;form-action',
    'https://studio.xeroflow.io\n;form-action *',
    null, 123, {}, '//studio.xeroflow.io', 'https:studio.xeroflow.io',
    'javascript:alert(1)', 'https://studio.xeroflow.io\\@untrusted.example',
    'https://studio.xeroflow.io https://untrusted.example',
    'https://%2A.xeroflow.io', 'https://studio.xeroflow.io:invalid'
  ])('keeps form destinations restricted for invalid configuration %s', (value) => {
    editorUrl = value
    portalSecurityMiddleware({ path: '/portal/page-studio' } as never)
    const csp = vi.mocked(testGlobal.setHeader).mock.calls
      .find(([, name]) => name === 'Content-Security-Policy')?.[2]
    expect(csp?.split('; ').find(directive => directive.startsWith('form-action ')))
      .toBe('form-action \'self\'')
  })

  it('normalizes a configured URL to exactly one HTTPS origin, preserving an explicit port', () => {
    editorUrl = 'https://STUDIO.xeroflow.io:8443/editor?next=https://untrusted.example#section'
    portalSecurityMiddleware({ path: '/portal/login' } as never)
    const csp = vi.mocked(testGlobal.setHeader).mock.calls
      .find(([, name]) => name === 'Content-Security-Policy')?.[2]
    expect(csp?.split('; ').find(directive => directive.startsWith('form-action ')))
      .toBe('form-action \'self\' https://studio.xeroflow.io:8443')
  })

  it('changes only the form destination and leaves every other security header intact', () => {
    const event = { path: '/portal/login' }
    portalSecurityMiddleware(event as never)
    const original = Object.fromEntries(vi.mocked(testGlobal.setHeader).mock.calls
      .map(([, name, value]) => [name, value]))
    vi.clearAllMocks()
    editorUrl = 'https://studio.xeroflow.io'
    portalSecurityMiddleware(event as never)
    const configured = Object.fromEntries(vi.mocked(testGlobal.setHeader).mock.calls
      .map(([, name, value]) => [name, value]))
    expect(configured).toEqual({
      ...original,
      'Content-Security-Policy': original['Content-Security-Policy']
        .replace('form-action \'self\'', 'form-action \'self\' https://studio.xeroflow.io')
    })
  })

  it.each(['/api/portal/dashboard', '/api/client-portal/analytics/personas'])(
    'does not add editor form destinations to %s', (path) => {
      editorUrl = 'https://studio-staging.xeroflow.io'
      portalSecurityMiddleware({ path } as never)
      const csp = vi.mocked(testGlobal.setHeader).mock.calls
        .find(([, name]) => name === 'Content-Security-Policy')?.[2]
      expect(csp?.split('; ').find(directive => directive.startsWith('form-action ')))
        .toBe('form-action \'self\'')
    }
  )
})
