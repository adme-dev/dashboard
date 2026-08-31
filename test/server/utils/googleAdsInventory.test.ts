import { describe, expect, it, vi } from 'vitest'
import { listGoogleAdsInventory } from '~~/server/utils/googleAds/inventory'

const auth = { accessToken: 'access', developerToken: 'developer', loginCustomerId: '9999999999' }
const customerId = '1234567890'

describe('Google Ads typed inventory reads', () => {
  it.each([
    ['campaign', 'campaign', { campaign: {
      resourceName: `customers/${customerId}/campaigns/60`, id: '60', name: 'Northern GAC',
      status: 'ENABLED', advertisingChannelType: 'SEARCH', campaignBudget: `customers/${customerId}/campaignBudgets/70`
    } }, 'Northern GAC'],
    ['ad_group', 'ad_group', {
      campaign: { resourceName: `customers/${customerId}/campaigns/60`, name: 'Northern GAC' },
      adGroup: { resourceName: `customers/${customerId}/adGroups/80`, id: '80', name: 'Models', status: 'PAUSED', type: 'SEARCH_STANDARD' }
    }, 'Models'],
    ['ad', 'ad_group_ad', {
      campaign: { resourceName: `customers/${customerId}/campaigns/60`, name: 'Northern GAC' },
      adGroup: { resourceName: `customers/${customerId}/adGroups/80`, name: 'Models' },
      adGroupAd: {
        resourceName: `customers/${customerId}/adGroupAds/80~90`, status: 'ENABLED', primaryStatus: 'ELIGIBLE',
        policySummary: { approvalStatus: 'APPROVED', reviewStatus: 'REVIEWED' },
        ad: { resourceName: `customers/${customerId}/ads/90`, id: '90', type: 'RESPONSIVE_SEARCH_AD', finalUrls: ['https://example.com/gac'] }
      }
    }, 'RESPONSIVE_SEARCH_AD'],
    ['keyword', 'ad_group_criterion', {
      campaign: { resourceName: `customers/${customerId}/campaigns/60`, name: 'Northern GAC' },
      adGroup: { resourceName: `customers/${customerId}/adGroups/80`, name: 'Models' },
      adGroupCriterion: {
        resourceName: `customers/${customerId}/adGroupCriteria/80~100`, status: 'ENABLED', negative: false,
        keyword: { text: 'gac suv', matchType: 'PHRASE' }, qualityInfo: { qualityScore: 8 }
      }
    }, 'gac suv'],
    ['asset', 'asset', { asset: {
      resourceName: `customers/${customerId}/assets/110`, id: '110', name: 'Call Northern GAC', type: 'CALL', source: 'ADVERTISER'
    } }, 'CALL'],
    ['conversion_action', 'conversion_action', { conversionAction: {
      resourceName: `customers/${customerId}/conversionActions/120`, id: '120', name: 'Test Drive', status: 'ENABLED',
      type: 'WEBPAGE', category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', primaryForGoal: false,
      ownerCustomer: `customers/${customerId}`
    } }, 'Test Drive']
  ] as const)('returns bounded normalized %s inventory', async (kind, from, row, expectedValue) => {
    const query = vi.fn().mockResolvedValue({ rows: [row], more: 1, requestId: 'read-1' })

    const result = await listGoogleAdsInventory({
      kind,
      customerId,
      auth,
      maxResults: 25,
      ...(kind === 'asset' ? {} : { status: 'ALL' as const })
    }, { query })

    expect(result).toMatchObject({ customerId, kind, truncated: true, requestId: 'read-1' })
    expect(JSON.stringify(result.items)).toContain(expectedValue)
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ customerId, auth, maxRows: 25 }))
    expect(query.mock.calls[0]?.[0].query).toContain(`FROM ${from}`)
  })

  it('lists campaign and ad-group targeting as two typed bounded inventories', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaignCriterion: {
        resourceName: `customers/${customerId}/campaignCriteria/60~200`,
        campaign: `customers/${customerId}/campaigns/60`, type: 'LOCATION', negative: false,
        location: { geoTargetConstant: 'geoTargetConstants/2036' }
      } }], more: 0, requestId: 'campaign-targeting' })
      .mockResolvedValueOnce({ rows: [{ adGroupCriterion: {
        resourceName: `customers/${customerId}/adGroupCriteria/80~201`,
        adGroup: `customers/${customerId}/adGroups/80`, type: 'AGE_RANGE', negative: true,
        ageRange: { type: 'AGE_RANGE_18_24' }
      } }], more: 0, requestId: 'ad-group-targeting' })

    await expect(listGoogleAdsInventory({
      kind: 'targeting', customerId, auth, maxResults: 25, scope: 'BOTH'
    }, { query })).resolves.toMatchObject({
      customerId,
      kind: 'targeting',
      campaignCriteria: [{ type: 'LOCATION' }],
      adGroupCriteria: [{ type: 'AGE_RANGE' }],
      requestIds: ['campaign-targeting', 'ad-group-targeting']
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('derives parent filters only from validated resource names', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    await listGoogleAdsInventory({
      kind: 'keyword', customerId, auth, maxResults: 10, status: 'ENABLED',
      campaignResourceName: `customers/${customerId}/campaigns/60`,
      adGroupResourceName: `customers/${customerId}/adGroups/80`,
      includeNegative: false
    }, { query })
    const gaql = query.mock.calls[0]?.[0].query as string
    expect(gaql).toContain('campaign.id = 60')
    expect(gaql).toContain('ad_group.id = 80')
    expect(gaql).toContain('ad_group_criterion.status = \'ENABLED\'')
    expect(gaql).toContain('ad_group_criterion.negative = FALSE')

    await expect(listGoogleAdsInventory({
      kind: 'keyword', customerId, auth, maxResults: 10, status: 'ALL',
      campaignResourceName: `customers/9999999999/campaigns/60`
    }, { query })).rejects.toThrow('selected Google Ads customer')
  })

  it('rejects a cross-customer provider row', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaign: {
        resourceName: 'customers/9999999999/campaigns/60', id: '60', name: 'Other tenant',
        status: 'ENABLED', advertisingChannelType: 'SEARCH'
      } }],
      more: 0
    })
    await expect(listGoogleAdsInventory({
      kind: 'campaign', customerId, auth, maxResults: 10, status: 'ALL'
    }, { query })).rejects.toThrow('cross-customer')
  })
})
