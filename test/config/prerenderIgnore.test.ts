import { describe, expect, it } from 'vitest'

import { NUXT_PAYLOAD_EXTRACTION, shouldIgnorePrerenderRoute } from '../../lib/prerender-ignore'

describe('shouldIgnorePrerenderRoute', () => {
  it('keeps Nuxt payload extraction disabled for static marketing routes', () => {
    expect(NUXT_PAYLOAD_EXTRACTION).toBe(false)
  })

  it('ignores only the host-aware root route, not every public route', () => {
    expect(shouldIgnorePrerenderRoute('/')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/pricing')).toBe(false)
    expect(shouldIgnorePrerenderRoute('/resources/client-portal-admin')).toBe(false)
    expect(shouldIgnorePrerenderRoute('/platform/ai')).toBe(false)
    expect(shouldIgnorePrerenderRoute('/features/dedicated-login')).toBe(false)
    expect(shouldIgnorePrerenderRoute('/banner-studio/dynamic-ads')).toBe(false)
  })

  it('ignores auth-gated route roots and their descendants', () => {
    expect(shouldIgnorePrerenderRoute('/agency')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/agency/hr')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/portal')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/portal/login')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/api')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/api/auth/session')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/auth/login')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/office')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/l/client-share')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/dev-login')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/design-system')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/style-guide')).toBe(true)
  })

  it('ignores unrelated routes that are not explicitly public marketing surfaces', () => {
    expect(shouldIgnorePrerenderRoute('/agency-partners')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/portal-solutions')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/apiary')).toBe(true)
    expect(shouldIgnorePrerenderRoute('/features-preview')).toBe(true)
  })
})
