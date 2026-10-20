import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  path: string
}

let editorUrl: unknown = ''
const production = (parse(readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8')) as unknown as {
  env: { production: { vars: Record<string, string>, services: { binding: string }[], r2_buckets: { binding: string }[] } }
}).env.production
const nativeOrigin = 'https://studio-customer-preview.xeroflow.io'
const nativeBindings = (): Record<string, unknown> => ({
  ...production.vars,
  ...Object.fromEntries(production.services.map(({ binding }) => [binding, {
    createProvisioning: vi.fn(), readProvisioning: vi.fn(), readManagedCmsTarget: vi.fn()
  }])),
  ...Object.fromEntries(production.r2_buckets.map(({ binding }) => [binding, { get: vi.fn() }]))
})
function documentPolicy(env: Record<string, unknown>, path = '/studio/dashboard') {
  vi.clearAllMocks()
  portalSecurityMiddleware({ path, context: { cloudflare: { env } } } as never)
  return Object.fromEntries(vi.mocked(testGlobal.setHeader).mock.calls.map(([, name, value]) => [name, value]))
}

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
    for (const key of ['ACTIVATION', 'BROWSER_ENABLED', 'EDITOR_ENABLED', 'PREVIEW_ENABLED', 'PREVIEW_APPROVALS', 'CMS_SETUP_ENABLED', 'PRODUCTION_EDITOR_ENABLED']) vi.stubEnv(`PAGE_STUDIO_CUSTOMER_${key}`, undefined)
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['/studio/signup', '/studio/dashboard', '/portal/login'])('permits only the configured native editor after navigation from %s', (path) => {
    const env = { PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'true',
      PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
      PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://customers.example.test', PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN: 'https://native-editor.example.test' }
    const policy = () => {
      vi.clearAllMocks()
      portalSecurityMiddleware({ path, context: { cloudflare: { env } } } as never)
      return vi.mocked(testGlobal.setHeader).mock.calls.find(([, name]) => name === 'Content-Security-Policy')?.[2]
    }
    expect(policy()).toContain('form-action \'self\' https://native-editor.example.test;')
    expect(testGlobal.setHeader).toHaveBeenCalledWith(expect.anything(), 'Referrer-Policy', 'origin')
    env.PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED = 'false'
    expect(policy()).not.toContain('native-editor')
    env.PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED = 'true'
    env.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN += '/path'
    expect(policy()).not.toContain('native-editor')
    env.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN = 'https://native-editor.example.test'
    env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    expect(policy()).not.toContain('native-editor')
  })

  it.each(['/studio', '/studio/signup', '/studio/dashboard', '/portal', '/portal/login', '/portal/projects'])(
    'allows the checked-in production native launch after navigation from %s without production editor opt-in', (path) => {
      const env = nativeBindings()
      editorUrl = production.vars.NUXT_PUBLIC_PAGE_STUDIO_EDITOR_URL
      expect(env.PAGE_STUDIO_CONTENT_ENVIRONMENT).toBe('production')
      expect(env.PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED).toBeUndefined()
      const headers = documentPolicy(env, path)
      expect(headers['Content-Security-Policy'].split('; ').find(value => value.startsWith('form-action ')))
        .toBe(`form-action 'self' https://studio.xeroflow.io ${nativeOrigin}`)
      expect(headers['Referrer-Policy']).toBe('origin')
      for (const binding of [...production.services, ...production.r2_buckets]) {
        for (const method of Object.values(env[binding.binding] as Record<string, ReturnType<typeof vi.fn>>)) {
          expect(method).not.toHaveBeenCalled()
        }
      }
    }
  )

  it.each([
    { PAGE_STUDIO_CUSTOMER_ACTIVATION: '{}' },
    { PAGE_STUDIO_CUSTOMER_ACTIVATION: undefined },
    ...['browserEnabled', 'editorEnabled'].map(key => ({ PAGE_STUDIO_CUSTOMER_ACTIVATION:
      JSON.stringify({ ...JSON.parse(production.vars.PAGE_STUDIO_CUSTOMER_ACTIVATION), [key]: false }) })),
    { PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'true' },
    { PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' },
    { PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: undefined },
    { PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: {} },
    { PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning: vi.fn() } },
    { PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: {} },
    { PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: {} },
    ...['http://studio-customer-preview.xeroflow.io', `${nativeOrigin}/path`, `${nativeOrigin}?q=1`,
      'https://*.xeroflow.io', `${nativeOrigin}; form-action *`, 'https://user:pass@studio-customer-preview.xeroflow.io']
      .map(value => ({ PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: value }))
  ])('keeps native document admission closed for invalid or disabled configuration %#', (change) => {
    editorUrl = production.vars.NUXT_PUBLIC_PAGE_STUDIO_EDITOR_URL
    const headers = documentPolicy({ ...nativeBindings(), ...change })
    expect(headers['Content-Security-Policy'].split('; ').find(value => value.startsWith('form-action ')))
      .toBe('form-action \'self\' https://studio.xeroflow.io')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
  })

  it('gates the production editor independently while retaining the enabled native source', () => {
    const env = { ...nativeBindings(), PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN: 'https://production-editor.example.test' }
    expect(documentPolicy(env)['Content-Security-Policy']).not.toContain('production-editor.example.test')
    const enabled = { ...env, PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED: 'true' }
    expect(documentPolicy(enabled)['Content-Security-Policy']).toContain(
      `form-action 'self' https://production-editor.example.test ${nativeOrigin};`)
    const productionOnly = documentPolicy({ ...enabled, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' })
    expect(productionOnly['Content-Security-Policy']).toContain('form-action \'self\' https://production-editor.example.test;')
    expect(productionOnly['Content-Security-Policy']).not.toContain(nativeOrigin)
    expect(productionOnly['Referrer-Policy']).toBe('origin')
  })

  it.each(['/api/portal/dashboard', '/api/client-portal/analytics/personas'])(
    'keeps production native destinations out of API document policy at %s', (path) => {
      const headers = documentPolicy(nativeBindings(), path)
      expect(headers['Content-Security-Policy']).toContain('form-action \'self\';')
      expect(headers['Content-Security-Policy']).not.toContain(nativeOrigin)
      expect(headers['Referrer-Policy']).toBe('no-referrer')
    }
  )

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

  it.each(['/portal/page-studio', '/portal', '/portal/login', '/portal/projects', '/studio', '/studio/sites', '/studio/verify'])(
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
