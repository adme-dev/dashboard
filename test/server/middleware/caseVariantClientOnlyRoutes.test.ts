import { describe, expect, it, vi } from 'vitest'

vi.mock('nitropack/runtime', () => ({ getRouteRules: vi.fn() }))

const { shouldServeCaseVariantAsSpa } = await import('../../../server/middleware/06-case-variant-client-only-routes')

const rules: Record<string, { ssr?: boolean }> = {
  '/agency': { ssr: false },
  '/agency/boards': { ssr: false },
  '/office': { ssr: false }
}
const rulesFor = (path: string) => rules[path] ?? {}

describe('shouldServeCaseVariantAsSpa', () => {
  it('serves a case variant of a client-only route as the SPA shell', () => {
    expect(shouldServeCaseVariantAsSpa('GET', '/AGENCY', rulesFor)).toBe(true)
    expect(shouldServeCaseVariantAsSpa('HEAD', '/Agency/Boards', rulesFor)).toBe(true)
  })
  it('leaves canonical, SSR and non-page requests untouched', () => {
    expect(shouldServeCaseVariantAsSpa('GET', '/agency', rulesFor)).toBe(false)
    expect(shouldServeCaseVariantAsSpa('GET', '/Pricing', rulesFor)).toBe(false)
    expect(shouldServeCaseVariantAsSpa('GET', '/Features/Boards', rulesFor)).toBe(false)
    expect(shouldServeCaseVariantAsSpa('POST', '/AGENCY', rulesFor)).toBe(false)
    expect(shouldServeCaseVariantAsSpa('GET', '/api/Agency', rulesFor)).toBe(false)
    expect(shouldServeCaseVariantAsSpa('GET', '/_nuxt/Entry.js', rulesFor)).toBe(false)
  })
  it('does not override a case variant whose own rules already decide SSR', () => {
    const own = (path: string) => (path === '/OFFICE' ? { ssr: false } : rulesFor(path))
    expect(shouldServeCaseVariantAsSpa('GET', '/OFFICE', own)).toBe(false)
  })
})
