import { describe, it, expect } from 'vitest'
import { normalizeRecommendations } from '~~/server/utils/googleRecommendations'

const DEEP = 'https://ads.google.com/aw/recommendations?ocid=123'

describe('normalizeRecommendations', () => {
  it('classifies a CAMPAIGN_BUDGET rec as budget_guardrailed and converts micros→major', () => {
    const rows = [{
      recommendation: {
        type: 'CAMPAIGN_BUDGET',
        campaigns: ['customers/999/campaigns/555'],
        resourceName: 'customers/999/recommendations/abc',
        campaignBudgetRecommendation: {
          currentBudgetAmountMicros: '20000000',
          recommendedBudgetAmountMicros: '24000000',
        },
        impact: { baseMetrics: { impressions: '1000' }, potentialMetrics: { impressions: '1250' } },
      },
    }]
    const r = normalizeRecommendations(rows, { optimizationScore: 0.82, deepLink: DEEP })
    expect(r.optimizationScore).toBe(0.82)
    expect(r.recommendations).toHaveLength(1)
    const rec = r.recommendations[0]
    expect(rec.type).toBe('CAMPAIGN_BUDGET')
    expect(rec.campaignId).toBe('555')
    expect(rec.currentDailyMajor).toBe(20)
    expect(rec.recommendedDailyMajor).toBe(24)
    expect(rec.applyability).toBe('budget_guardrailed')
    expect(rec.trackingHealth).toBe(false)
    expect(rec.impactSummary).toBe('+250 impressions')
    expect(rec.deepLink).toBe(DEEP)
  })

  it('treats FORECASTING_CAMPAIGN_BUDGET with a recommended amount as budget_guardrailed', () => {
    const rows = [{ recommendation: { type: 'FORECASTING_CAMPAIGN_BUDGET', resourceName: 'rn', forecastingCampaignBudgetRecommendation: { recommendedBudgetAmountMicros: '15000000' } } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].applyability).toBe('budget_guardrailed')
    expect(r.recommendations[0].recommendedDailyMajor).toBe(15)
  })

  it('classifies non-budget types as review_only', () => {
    const rows = [{ recommendation: { type: 'KEYWORD', resourceName: 'rn' } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].applyability).toBe('review_only')
    expect(r.recommendations[0].recommendedDailyMajor).toBeNull()
  })

  it('flags IMPROVE_GOOGLE_TAG_COVERAGE as trackingHealth + review_only', () => {
    const rows = [{ recommendation: { type: 'IMPROVE_GOOGLE_TAG_COVERAGE', resourceName: 'rn' } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].trackingHealth).toBe(true)
    expect(r.recommendations[0].applyability).toBe('review_only')
  })

  it('downgrades a budget type with non-numeric micros to review_only with null amounts', () => {
    const rows = [{ recommendation: { type: 'CAMPAIGN_BUDGET', resourceName: 'rn', campaignBudgetRecommendation: { recommendedBudgetAmountMicros: 'xx' } } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].applyability).toBe('review_only')
    expect(r.recommendations[0].recommendedDailyMajor).toBeNull()
  })

  it('returns an empty list for no rows', () => {
    const r = normalizeRecommendations([], { optimizationScore: 0.5, deepLink: DEEP })
    expect(r.recommendations).toEqual([])
    expect(r.optimizationScore).toBe(0.5)
  })
})
