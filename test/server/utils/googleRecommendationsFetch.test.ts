import { describe, it, expect, vi, beforeEach } from 'vitest'
const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))
import { fetchGoogleRecommendations } from '~~/server/utils/googleRecommendations'

beforeEach(() => ofetchMock.mockReset())

describe('fetchGoogleRecommendations', () => {
  it('queries recommendations + optimization score and returns a normalized result', async () => {
    ofetchMock
      // recommendations searchStream
      .mockResolvedValueOnce([{ results: [
        { recommendation: { type: 'CAMPAIGN_BUDGET', resourceName: 'rn1', campaigns: ['customers/9/campaigns/55'], campaignBudgetRecommendation: { recommendedBudgetAmountMicros: '24000000', currentBudgetAmountMicros: '20000000' } } },
      ] }])
      // optimization score searchStream
      .mockResolvedValueOnce([{ results: [{ customer: { optimizationScore: 0.77, optimizationScoreUrl: 'https://ads.google.com/x' } }] }])
    const r = await fetchGoogleRecommendations('9', 'tok', 'dev', '5250473322')
    expect(r.optimizationScore).toBe(0.77)
    expect(r.recommendations[0].recommendedDailyMajor).toBe(24)
    expect(r.recommendations[0].deepLink).toBe('https://ads.google.com/x')
    expect(ofetchMock.mock.calls[0][1].body.query).toContain('recommendation.campaign_budget_recommendation')
    expect(ofetchMock.mock.calls[0][1].body.query).toContain('recommendation.campaigns')
    expect(ofetchMock.mock.calls[0][1].body.query).not.toContain('recommendation.campaign_budget_recommendation.current_budget_amount_micros')
    expect(ofetchMock.mock.calls[0][1].body.query).not.toContain('recommendation.campaign,')
  })

  it('fails safe to an empty result with an error flag when the API throws', async () => {
    // Only the recommendations query runs before the outer catch fires, so one
    // rejection is enough — and Once avoids a lingering default rejected promise
    // that vitest would flag as an unhandled rejection.
    ofetchMock.mockRejectedValueOnce(new Error('boom'))
    const r = await fetchGoogleRecommendations('9', 'tok', 'dev', undefined)
    expect(r.recommendations).toEqual([])
    expect(r.optimizationScore).toBeNull()
    expect(r.error).toBeTruthy()
  })
})
