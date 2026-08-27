import { describe, expect, it } from 'vitest'
import * as metaClient from '~~/server/utils/metaClient'

const { getMetaAuthUrl, META_MARKETING_OAUTH_SCOPES } = metaClient

describe('metaClient OAuth', () => {
  it('keeps routine consent minimal and adds catalog access only for catalog intent', () => {
    const baselineUrl = new URL(getMetaAuthUrl(
      'meta-app-id',
      'https://example.com/api/agency/social/meta/callback',
      'state-token',
    ))
    const catalogUrl = new URL(getMetaAuthUrl(
      'meta-app-id',
      'https://example.com/api/agency/social/meta/callback',
      'state-token',
      'catalog',
      'business-login-config-id',
    ))

    expect(baselineUrl.searchParams.get('scope')).toBe(META_MARKETING_OAUTH_SCOPES.join(','))
    expect(META_MARKETING_OAUTH_SCOPES).toContain('ads_management')
    expect(META_MARKETING_OAUTH_SCOPES).toContain('business_management')
    expect(META_MARKETING_OAUTH_SCOPES).not.toContain('ads_read')
    expect(META_MARKETING_OAUTH_SCOPES).not.toContain('catalog_management')
    expect(catalogUrl.searchParams.get('config_id')).toBe('business-login-config-id')
    expect(catalogUrl.searchParams.has('scope')).toBe(false)
  })
})
