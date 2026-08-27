import { describe, expect, it, vi } from 'vitest'
import { extractConversions, getAdAccounts, getMetaAuthUrl, META_MARKETING_OAUTH_SCOPES } from '~~/server/utils/metaClient'

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

describe('Meta ad-account pagination', () => {
  it('keeps tokens in authorization headers and rejects untrusted paging hosts', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        data: [{ account_id: '1', id: 'act_1', name: 'One', currency: 'AUD', account_status: 1 }],
        paging: { next: 'https://graph.facebook.com/v25.0/me/adaccounts?after=next&access_token=secret-token' },
      })
      .mockResolvedValueOnce({ data: [] })

    await expect(getAdAccounts('secret-token', fetchImpl)).resolves.toHaveLength(1)

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://graph.facebook.com/v25.0/me/adaccounts?after=next')
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer secret-token' },
    })
    await expect(getAdAccounts('secret-token', vi.fn().mockResolvedValue({
      data: [],
      paging: { next: 'https://attacker.example/steal?access_token=secret-token' },
    }))).rejects.toThrow('invalid pagination URL')
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
