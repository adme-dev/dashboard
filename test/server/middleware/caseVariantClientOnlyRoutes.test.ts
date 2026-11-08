import { createRouter as createRadixRouter, toRouteMatcher } from 'radix3'
import defu from 'defu'
import { describe, expect, it, vi } from 'vitest'

// Same matching Nitro uses at runtime (getRouteRulesForPath: radix3 matchAll + defu).
const rules: Record<string, Record<string, unknown>> = {
  '/pricing': { prerender: true },
  '/agency': { ssr: false },
  '/agency/**': { ssr: false },
  '/office': { ssr: false },
  '/OFFICE': { ssr: true },
  '/portal/**': { ssr: false }
}
const matcher = toRouteMatcher(createRadixRouter({ routes: rules }))
const rulesForPath = (path: string) => defu({}, ...matcher.matchAll(path).reverse()) as { ssr?: unknown }

vi.mock('nitropack/runtime', () => ({
  getRouteRules: (event: { path: string }) => rulesForPath(event.path.split('?')[0]!)
}))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

const { default: handler, shouldServeCaseVariantAsSpa, requestPagePath } = await import('../../../server/middleware/06-case-variant-client-only-routes')

function run(method: string, path: string) {
  const event = { method, path, context: {} as { nuxt?: { noSSR?: boolean } } }
  ;(handler as unknown as (e: typeof event) => void)(event)
  return event.context.nuxt?.noSSR === true
}

describe('case-variant client-only middleware (handler with Nitro matching)', () => {
  it('serves case variants of ssr:false routes as the SPA shell', () => {
    expect(run('GET', '/AGENCY')).toBe(true)
    expect(run('GET', '/Agency/Boards/123')).toBe(true)
    expect(run('HEAD', '/PORTAL/invoices')).toBe(true)
    expect(run('GET', '/AGENCY?tab=1')).toBe(true)
    expect(run('GET', '/Agency/')).toBe(true)
  })
  it('uses the decoded request path (h3 decodes event.path), so encoded variants are covered', () => {
    // h3 has already turned /%41GENCY into /AGENCY by the time middleware runs.
    expect(requestPagePath({ path: '/AGENCY?x=%41' })).toBe('/AGENCY')
    expect(run('GET', decodeURI('/%41GENCY'))).toBe(true)
  })
  it('lets an explicit own rule win, including ssr:true', () => {
    expect(run('GET', '/OFFICE')).toBe(false)
  })
  it('leaves canonical, SSR/public, API, asset, island and non-GET requests untouched', () => {
    expect(run('GET', '/agency')).toBe(false)
    expect(run('GET', '/Pricing')).toBe(false)
    expect(run('GET', '/Features/Boards')).toBe(false)
    expect(run('POST', '/AGENCY')).toBe(false)
    expect(run('GET', '/api/Agency')).toBe(false)
    expect(run('GET', '/_nuxt/Entry.js')).toBe(false)
    expect(run('GET', '/__nuxt_island/Comp')).toBe(false)
  })
  it('keeps the pure predicate consistent', () => {
    expect(shouldServeCaseVariantAsSpa('GET', '/AGENCY', rulesForPath)).toBe(true)
    expect(shouldServeCaseVariantAsSpa('GET', '/OFFICE', rulesForPath)).toBe(false)
  })
})
