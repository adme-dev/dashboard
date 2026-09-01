import { describe, expect, it } from 'vitest'
import {
  GOOGLE_ADS_API_VERSION,
  googleAdsApiUrl,
} from '~~/server/utils/googleAds/version'

describe('Google Ads API version', () => {
  it('builds Google Ads REST URLs on v25', () => {
    expect(GOOGLE_ADS_API_VERSION).toBe('v25')
    expect(googleAdsApiUrl('/customers:listAccessibleCustomers'))
      .toBe('https://googleads.googleapis.com/v25/customers:listAccessibleCustomers')
  })

  it.each([
    'customers:listAccessibleCustomers',
    '//customers:listAccessibleCustomers',
    'https://example.com/customers:listAccessibleCustomers',
  ])('rejects an unsafe API path: %s', (path) => {
    expect(() => googleAdsApiUrl(path)).toThrow('Google Ads API path must start with one slash')
  })
})
