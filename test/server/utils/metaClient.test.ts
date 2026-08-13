import { describe, expect, it } from 'vitest'
import { getMetaAuthUrl, META_MARKETING_OAUTH_SCOPES } from '~~/server/utils/metaClient'

describe('metaClient OAuth', () => {
  it('requests catalog permissions required for product set catalog audits', () => {
    const url = new URL(getMetaAuthUrl(
      'meta-app-id',
      'https://example.com/api/agency/social/meta/callback',
      'state-token',
    ))

    expect(url.searchParams.get('scope')).toBe(META_MARKETING_OAUTH_SCOPES.join(','))
    expect(META_MARKETING_OAUTH_SCOPES).toContain('ads_management')
    expect(META_MARKETING_OAUTH_SCOPES).toContain('ads_read')
    expect(META_MARKETING_OAUTH_SCOPES).toContain('business_management')
    expect(META_MARKETING_OAUTH_SCOPES).toContain('catalog_management')
  })

  it('uses Meta rerequest for the one-time catalogue permission upgrade', () => {
    const url = new URL(getMetaAuthUrl(
      'meta-app-id',
      'https://example.com/api/agency/social/meta/callback',
      'state-token',
      { intent: 'catalog_management' },
    ))

    expect(url.searchParams.get('auth_type')).toBe('rerequest')
    expect(url.searchParams.get('scope')).toContain('catalog_management')
  })
})
