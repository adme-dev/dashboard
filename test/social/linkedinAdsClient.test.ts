import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getLinkedInAuthUrl, getLinkedInAdAccounts,
  getLinkedInCampaignInsights, getLinkedInCampaignDailyInsights,
  exchangeLinkedInToken, refreshLinkedInToken
} from '../../server/utils/linkedinClient'

const { http } = vi.hoisted(() => ({ http: vi.fn() }))
// Exercise real ofetch URL handling, replacing only the network transport.
vi.mock('ofetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ofetch')>()
  return { ...actual, ofetch: actual.ofetch.create({}, { fetch: http }) }
})

function respond(body: unknown) {
  http.mockResolvedValueOnce(new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' }
  }))
}

const analytics = {
  pivotValues: ['urn:li:sponsoredCampaign:456'], costInLocalCurrency: '12.50',
  impressions: 100, clicks: 8, externalWebsiteConversions: 2,
  dateRange: { start: { year: 2024, month: 2, day: 9 }, end: { year: 2024, month: 2, day: 9 } }
}

describe('LinkedIn Ads wire contract', () => {
  beforeEach(() => http.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('requests space-delimited OAuth scopes', () => {
    const url = new URL(getLinkedInAuthUrl('app', 'https://example.test/callback', 'csrf'))
    expect(url.searchParams.get('scope')).toBe('r_ads r_ads_reporting')
    expect(url.searchParams.get('state')).toBe('csrf')
  })

  it.each([
    ['MONTHLY', getLinkedInCampaignInsights, '2024-02-01'],
    ['DAILY', getLinkedInCampaignDailyInsights, '2024-02-09']
  ] as const)('sends exact %s Rest.li analytics and account-scoped campaign URLs', async (granularity, getInsights, date) => {
    respond({ elements: [analytics] })
    respond({ elements: [{ id: 456, name: 'February campaign' }] })
    const result = await getInsights('123', 'access', 2, 2024)
    expect(http.mock.calls[0][0]).toBe(
      'https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=' + granularity
      + '&dateRange=(start:(year:2024,month:2,day:1),end:(year:2024,month:2,day:29))'
      + '&accounts=List(urn%3Ali%3AsponsoredAccount%3A123)'
      + '&fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions,pivotValues,dateRange'
    )
    expect(http.mock.calls[1][0]).toBe(
      'https://api.linkedin.com/rest/adAccounts/123/adCampaigns?q=search'
      + '&search=(id:(values:List(urn%3Ali%3AsponsoredCampaign%3A456)))&pageSize=100'
    )
    for (const [, options] of http.mock.calls) {
      expect(Object.fromEntries(new Headers(options.headers))).toMatchObject({
        'authorization': 'Bearer access', 'linkedin-version': '202610', 'x-restli-protocol-version': '2.0.0'
      })
    }
    expect(result).toEqual([{
      campaign_id: '456', campaign_name: 'February campaign', spend: '12.50',
      impressions: '100', clicks: '8', conversions: '2', date
    }])
  })

  it('uses the Rest.li account finder and follows encoded cursor tokens', async () => {
    respond({ elements: [{ id: 123, name: 'First', currency: 'AUD', status: 'ACTIVE' }], metadata: { nextPageToken: 'next+/=:' } })
    respond({ elements: [{ id: 789, name: 'Second', currency: 'NZD', status: 'DRAFT' }] })
    expect(await getLinkedInAdAccounts('access')).toEqual([
      { id: '123', name: 'First', currency: 'AUD', status: 'ACTIVE' },
      { id: '789', name: 'Second', currency: 'NZD', status: 'DRAFT' }
    ])
    expect(http.mock.calls.map(call => call[0])).toEqual([
      'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE,DRAFT)))&pageSize=100',
      'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE,DRAFT)))&pageSize=100&pageToken=next%2B%2F%3D%3A'
    ])
  })

  it('stops paging when LinkedIn repeats a cursor token', async () => {
    respond({ elements: [{ id: 1, name: 'A', currency: 'AUD', status: 'ACTIVE' }], metadata: { nextPageToken: 'same' } })
    respond({ elements: [{ id: 2, name: 'B', currency: 'AUD', status: 'ACTIVE' }], metadata: { nextPageToken: 'same' } })
    respond({ elements: [{ id: 3, name: 'C', currency: 'AUD', status: 'ACTIVE' }], metadata: { nextPageToken: 'same' } })
    expect((await getLinkedInAdAccounts('access')).map(account => account.id)).toEqual(['1', '2'])
    expect(http).toHaveBeenCalledTimes(2)
  })

  it('retries LinkedIn 503 maintenance responses', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0 }) as never)
    http.mockResolvedValueOnce(new Response('{"message":"UNDER_MAINTENANCE"}', { status: 503 }))
    respond({ elements: [{ id: 9, name: 'Recovered', currency: 'AUD', status: 'ACTIVE' }] })
    expect((await getLinkedInAdAccounts('access')).map(account => account.id)).toEqual(['9'])
    expect(http).toHaveBeenCalledTimes(2)
  })

  it('deduplicates campaign URNs and follows campaign finder pagination', async () => {
    respond({ elements: [analytics, analytics, { ...analytics, pivotValues: ['urn:li:sponsoredCampaign:789'] }] })
    respond({ elements: [{ id: 456, name: 'First' }], metadata: { nextPageToken: 'next:2' } })
    respond({ elements: [{ id: 789, name: 'Second' }] })
    const result = await getLinkedInCampaignDailyInsights('123', 'access', 2, 2024)
    const url = 'https://api.linkedin.com/rest/adAccounts/123/adCampaigns?q=search'
      + '&search=(id:(values:List(urn%3Ali%3AsponsoredCampaign%3A456,urn%3Ali%3AsponsoredCampaign%3A789)))&pageSize=100'
    expect(http.mock.calls.slice(1).map(call => call[0])).toEqual([url, url + '&pageToken=next%3A2'])
    expect(result.map(row => row.campaign_name)).toEqual(['First', 'First', 'Second'])
  })

  it('retains spend when optional campaign-name lookup fails', async () => {
    respond({ elements: [analytics] })
    http.mockResolvedValueOnce(new Response('{"message":"Forbidden"}', { status: 403 }))
    expect(await getLinkedInCampaignInsights('123', 'access', 2, 2024)).toMatchObject([
      { campaign_id: '456', campaign_name: 'Campaign 456', spend: '12.50' }
    ])
  })

  it('skips name lookup for empty analytics', async () => {
    respond({ elements: [] })
    expect(await getLinkedInCampaignInsights('123', 'access', 2, 2024)).toEqual([])
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('posts form-encoded authorization and refresh grants', async () => {
    respond({ access_token: 'first', expires_in: 3600, refresh_token: 'refresh' })
    await exchangeLinkedInToken('code+&', 'app', 'secret&', 'https://example.test/callback')
    respond({ access_token: 'next', expires_in: 3600 })
    expect(await refreshLinkedInToken('refresh+&', 'app', 'secret&')).toMatchObject({
      access_token: 'next', refresh_token: 'refresh+&'
    })
    expect(http.mock.calls.map(call => call[0])).toEqual([
      'https://www.linkedin.com/oauth/v2/accessToken', 'https://www.linkedin.com/oauth/v2/accessToken'
    ])
    expect(http.mock.calls[0][1].body).toBe('grant_type=authorization_code&code=code%2B%26&client_id=app&client_secret=secret%26&redirect_uri=https%3A%2F%2Fexample.test%2Fcallback')
    expect(http.mock.calls[1][1].body).toBe('grant_type=refresh_token&refresh_token=refresh%2B%26&client_id=app&client_secret=secret%26')
    expect(new Headers(http.mock.calls[1][1].headers).get('content-type')).toBe('application/x-www-form-urlencoded')
  })
})
