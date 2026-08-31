import { describe, expect, it } from 'vitest'
import { getGoogleAuthUrl, GOOGLE_ADS_OAUTH_SCOPES } from '~~/server/utils/googleAdsClient'

describe('googleAdsClient OAuth', () => {
  it('requests Ads and Merchant Center Content scopes for new connections', () => {
    const url = new URL(getGoogleAuthUrl(
      'client-id',
      'https://example.com/api/agency/social/google/callback',
      'state-token'
    ))

    expect(url.searchParams.get('scope')).toBe(GOOGLE_ADS_OAUTH_SCOPES.join(' '))
    expect(GOOGLE_ADS_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/adwords')
    expect(GOOGLE_ADS_OAUTH_SCOPES).toContain('https://www.googleapis.com/auth/content')
    expect(GOOGLE_ADS_OAUTH_SCOPES).toContain('openid')
    expect(GOOGLE_ADS_OAUTH_SCOPES).toContain('email')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('include_granted_scopes')).toBe('true')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('can pin the account chooser to an operator-selected Google identity', () => {
    const url = new URL(getGoogleAuthUrl(
      'client-id',
      'https://example.com/api/agency/social/google/callback',
      'state-token',
      { loginHint: 'advertising@adme.net.au' },
    ))

    expect(url.searchParams.get('login_hint')).toBe('advertising@adme.net.au')
  })
})
