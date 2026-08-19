import { describe, expect, it } from 'vitest'
import { extractConversions, getMetaAuthUrl, META_MARKETING_OAUTH_SCOPES } from '~~/server/utils/metaClient'

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

describe('Meta conversion semantics', () => {
  it('uses one non-overlapping lead or purchase outcome instead of summing aggregate action families', () => {
    expect(extractConversions([
      { action_type: 'lead', value: '9' },
      { action_type: 'offsite_conversion.fb_pixel_lead', value: '9' },
      { action_type: 'onsite_conversion.lead_grouped', value: '9' },
      { action_type: 'offsite_conversion', value: '50' },
      { action_type: 'landing_page_view', value: '100' },
    ])).toBe(9)
  })

  it('falls back to a non-overlapping purchase outcome and ignores broad conversion aggregates', () => {
    expect(extractConversions([
      { action_type: 'omni_purchase', value: '4' },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' },
      { action_type: 'offsite_conversion', value: '30' },
    ])).toBe(4)
  })
})
