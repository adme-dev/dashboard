import { describe, expect, it, vi } from 'vitest'
import { listGoogleAdsRecommendations } from '~~/server/utils/googleAds/recommendations'

const auth = { accessToken: 'access', developerToken: 'developer', loginCustomerId: '9999999999' }

describe('Google Ads recommendation reads', () => {
  it('returns a bounded normalized inventory with optimization score', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ recommendation: {
          resourceName: 'customers/1234567890/recommendations/abc-1',
          type: 'CAMPAIGN_BUDGET',
          dismissed: false,
          campaigns: ['customers/1234567890/campaigns/60'],
          campaignBudget: 'customers/1234567890/campaignBudgets/70',
          campaignBudgetRecommendation: { recommendedBudgetAmountMicros: '24000000' },
          impact: {
            baseMetrics: { impressions: '1000', costMicros: '20000000' },
            potentialMetrics: { impressions: '1200', costMicros: '24000000' }
          }
        } }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [{ customer: {
          optimizationScore: 0.82,
          optimizationScoreUrl: 'https://ads.google.com/aw/recommendations?ocid=123'
        } }],
        more: 0
      })

    await expect(listGoogleAdsRecommendations({
      customerId: '1234567890', auth, maxResults: 25,
      types: ['CAMPAIGN_BUDGET'], includeDismissed: false
    }, { query })).resolves.toEqual({
      customerId: '1234567890',
      optimizationScore: 0.82,
      optimizationScoreUrl: 'https://ads.google.com/aw/recommendations?ocid=123',
      recommendations: [{
        resourceName: 'customers/1234567890/recommendations/abc-1',
        type: 'CAMPAIGN_BUDGET',
        dismissed: false,
        campaigns: ['customers/1234567890/campaigns/60'],
        campaignBudget: 'customers/1234567890/campaignBudgets/70',
        recommendedBudgetAmountMicros: '24000000',
        impact: {
          baseMetrics: { impressions: '1000', costMicros: '20000000' },
          potentialMetrics: { impressions: '1200', costMicros: '24000000' }
        }
      }]
    })
    expect(query.mock.calls[0]?.[0]).toMatchObject({ customerId: '1234567890', auth, maxRows: 25 })
    expect(query.mock.calls[0]?.[0].query).toContain('recommendation.type IN (CAMPAIGN_BUDGET)')
    expect(query.mock.calls[0]?.[0].query).toContain('recommendation.dismissed = FALSE')
  })

  it('rejects unsafe type filters before querying Google', async () => {
    const query = vi.fn()
    await expect(listGoogleAdsRecommendations({
      customerId: '1234567890', auth, maxResults: 25,
      types: ['CAMPAIGN_BUDGET) OR TRUE'], includeDismissed: false
    }, { query })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
})
