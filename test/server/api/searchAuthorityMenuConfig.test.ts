import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  menuAgentConfigInput,
  normalizeMenuAgentConfig
} from '~~/server/utils/searchAuthority/menuAgent'

const contentHostname = 'learn.knoxgwmhaval.com.au'

describe('Search Authority Menu Agent configuration', () => {
  it('accepts a bounded configuration for the configured content hostname', () => {
    const parsed = menuAgentConfigInput.parse({
      enabled: true,
      label: 'Buying Guides',
      href: 'https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide',
      desktopSelector: 'nav.main-menu > ul',
      mobileSelector: '[data-testid="mobile-nav"] ul',
      insertion: 'before-last'
    })

    expect(normalizeMenuAgentConfig(parsed, contentHostname)).toEqual(parsed)
  })

  it.each([
    ['off-host link', { href: 'https://attacker.example/guides/test' }],
    ['script-like label', { label: '<img src=x onerror=alert(1)>' }],
    ['unbounded selector', { desktopSelector: 'nav:has(a), body *' }]
  ])('rejects %s', (_name, override) => {
    const candidate = {
      enabled: true,
      label: 'Buying Guides',
      href: 'https://learn.knoxgwmhaval.com.au/',
      desktopSelector: 'nav.main-menu > ul',
      mobileSelector: '.mobile-menu ul',
      insertion: 'append',
      ...override
    }
    const parsed = menuAgentConfigInput.safeParse(candidate)
    if (!parsed.success) return
    expect(() => normalizeMenuAgentConfig(parsed.data, contentHostname)).toThrow()
  })

  it('keeps agency mutations tenant-scoped and exposes only public configuration by installation id', () => {
    const getRoute = readFileSync('server/api/agency/search-authority/menu/config.get.ts', 'utf8')
    const putRoute = readFileSync('server/api/agency/search-authority/menu/config.put.ts', 'utf8')
    const publicRoute = readFileSync('server/api/public/search-authority/menu/[publicId].get.ts', 'utf8')

    expect(getRoute).toContain('requireAgencySearchAuthorityAccess')
    expect(putRoute).toContain('requireAgencySearchAuthorityAccess')
    expect(putRoute).toContain('search_authority_site_audit_events')
    expect(publicRoute).toContain('public_id = $1')
    expect(publicRoute).not.toMatch(/access_token|refresh_token|google_credential/i)
  })
})
