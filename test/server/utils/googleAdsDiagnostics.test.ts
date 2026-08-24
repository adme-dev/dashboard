import { beforeEach, describe, expect, it, vi } from 'vitest'

const ofetchMock = vi.hoisted(() => vi.fn())
vi.mock('ofetch', () => ({ ofetch: (...args: unknown[]) => ofetchMock(...args) }))

import {
  getGoogleCampaignAdPerformance,
  getGoogleCampaignDiagnostics,
  getGoogleCampaignSearchTerms,
} from '~~/server/utils/googleAdsClient'

const batch = (results: any[]) => [{ results }]

describe('Google Ads delivery diagnostics', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
  })

  it('keeps provider serving codes and collects Search impression-share ratios independently', async () => {
    ofetchMock.mockImplementation(async (_url: string, options: any) => {
      const query = String(options?.body?.query || '')
      if (query.includes('campaign.primary_status')) return batch([{
        campaign: {
          id: '123', advertisingChannelType: 'SEARCH', primaryStatus: 'LIMITED',
          primaryStatusReasons: ['BUDGET_CONSTRAINED', 'BIDDING_STRATEGY_CONSTRAINED'],
        },
      }])
      if (query.includes('metrics.search_impression_share')) return batch([{
        campaign: { id: '123', advertisingChannelType: 'SEARCH' },
        metrics: {
          searchImpressionShare: 0.42,
          searchBudgetLostImpressionShare: 0.18,
          searchRankLostImpressionShare: 0.40,
        },
      }])
      throw new Error(`Unexpected query: ${query}`)
    })

    await expect(getGoogleCampaignDiagnostics('1', 'token', 'dev', '2026-08-01', '2026-08-24')).resolves.toEqual([
      expect.objectContaining({
        campaignId: '123',
        servingStatus: 'LIMITED',
        servingStatusReasons: ['LIMITED_BY_BUDGET', 'BIDDING_LIMITED'],
        providerServingStatusReasons: ['BUDGET_CONSTRAINED', 'BIDDING_STRATEGY_CONSTRAINED'],
        impressionShare: 0.42,
        lostImpressionShareBudget: 0.18,
        lostImpressionShareRank: 0.40,
        servingUnavailableReason: null,
        impressionShareUnavailableReason: null,
      }),
    ])
  })

  it('returns zero-delivery policy ads and human-readable policy topics', async () => {
    ofetchMock.mockImplementation(async (_url: string, options: any) => {
      const query = String(options?.body?.query || '')
      if (query.includes('policy_summary')) return batch([{
        adGroupAd: {
          ad: { id: 'ad-1', name: 'Offer ad' },
          policySummary: {
            approvalStatus: 'DISAPPROVED',
            reviewStatus: 'REVIEWED',
            policyTopicEntries: [{ topic: 'VEHICLE_PRICING', type: 'PROHIBITED' }],
          },
        },
      }])
      return batch([])
    })

    const rows = await getGoogleCampaignAdPerformance('1', 'token', 'dev', '123', '2026-08-01', '2026-08-24')
    expect(rows).toEqual([expect.objectContaining({
      adId: 'ad-1',
      spend: 0,
      approvalStatus: 'DISAPPROVED',
      providerApprovalStatus: 'DISAPPROVED',
      approvalReviewStatus: 'REVIEWED',
      policyIssues: [expect.objectContaining({ topic: 'VEHICLE_PRICING', summary: 'VEHICLE_PRICING' })],
      approvalUnavailableReason: null,
    })])
  })

  it('aggregates duplicate searchStream terms without a silent GAQL limit', async () => {
    ofetchMock.mockResolvedValue(batch([
      { campaignSearchTermView: { searchTerm: 'new suv', status: 'ADDED' }, segments: { searchTermMatchType: 'BROAD' }, metrics: { costMicros: '4000000', impressions: '100', clicks: '2' } },
      { campaignSearchTermView: { searchTerm: 'new suv', status: 'ADDED' }, segments: { searchTermMatchType: 'BROAD' }, metrics: { costMicros: '2000000', impressions: '50', clicks: '1' } },
      { campaignSearchTermView: { searchTerm: 'brand dealer', status: 'NONE' }, segments: { searchTermMatchType: 'EXACT' }, metrics: { costMicros: '1000000', impressions: '25', clicks: '1' } },
    ]))

    expect(await getGoogleCampaignSearchTerms('1', 'token', 'dev', '123', '2026-08-01', '2026-08-24')).toEqual([
      expect.objectContaining({ searchTerm: 'new suv', targetingStatus: null, cost: 6, impressions: 150, clicks: 3 }),
      expect.objectContaining({ searchTerm: 'brand dealer', targetingStatus: null, cost: 1, clicks: 1 }),
    ])
    const query = String(ofetchMock.mock.calls[0]?.[1]?.body?.query)
    expect(query).not.toMatch(/LIMIT\s+5/i)
    expect(query).not.toContain('campaign_search_term_view.status')
  })
})
