import { describe, expect, it } from 'vitest'
import {
  buildPacingReview,
  summarizePacingReview,
  type PacingReviewRow
} from '~~/server/utils/socialSpendPacingReview'

const now = new Date('2026-06-12T10:00:00+10:00')

function row(overrides: Partial<PacingReviewRow> = {}): PacingReviewRow {
  return {
    media_spend_id: 'spend-1',
    client_name: 'Acme',
    platform: 'meta',
    campaign_id: 'camp-1',
    campaign_name: 'Lead Gen',
    campaign_status: 'ACTIVE',
    budget_allocated: '3000',
    actual_spend: '1200',
    impressions: '10000',
    clicks: '500',
    conversions: '4',
    reach: '7500',
    frequency: '1.33',
    impression_share: null,
    lost_impression_share_budget: null,
    lost_impression_share_rank: null,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    budget_type: 'daily',
    period: '2026-06',
    synced_at: '2026-06-12T00:00:00.000Z',
    end_date: null,
    ...overrides
  }
}

describe('buildPacingReview', () => {
  it('emits overpacing and underpacing recommendations with daily budget guidance', () => {
    const review = buildPacingReview([
      row({ media_spend_id: 'over', actual_spend: '1800' }),
      row({ media_spend_id: 'under', actual_spend: '500', platform: 'google_ads' })
    ], { now, period: '2026-06' })

    expect(review.items.map(i => i.issueType)).toEqual(['overpacing', 'underpacing'])
    expect(review.items[0]).toMatchObject({
      mediaSpendId: 'over',
      platform: 'meta',
      severity: 'critical',
      recommendedDailyBudget: 66.67
    })
    expect(review.items[1]).toMatchObject({
      mediaSpendId: 'under',
      platform: 'google',
      severity: 'warning'
    })
    expect(review.items[1].recommendedAction).toContain('increase delivery')
  })

  it('includes performance metrics that explain pacing pressure', () => {
    const review = buildPacingReview([
      row({
        media_spend_id: 'google',
        platform: 'google_ads',
        actual_spend: '1800',
        impressions: '12000',
        clicks: '600',
        conversions: '12',
        impression_share: '72.5',
        lost_impression_share_budget: '18.25',
        lost_impression_share_rank: '9.5',
        bid_strategy: 'MAXIMIZE_CONVERSIONS',
        budget_type: 'daily'
      })
    ], { now, period: '2026-06' })

    expect(review.items[0].performance).toEqual({
      impressions: 12000,
      clicks: 600,
      conversions: 12,
      ctr: 5,
      cpc: 3,
      costPerConversion: 150,
      conversionRate: 2,
      reach: 7500,
      frequency: 1.33,
      impressionShare: 72.5,
      lostImpressionShareBudget: 18.25,
      lostImpressionShareRank: 9.5,
      bidStrategy: 'MAXIMIZE_CONVERSIONS',
      budgetType: 'daily'
    })
  })

  it('flags stale sync and paused-with-budget campaigns without platform writes', () => {
    const review = buildPacingReview([
      row({ media_spend_id: 'stale', synced_at: '2026-06-08T00:00:00.000Z' }),
      row({ media_spend_id: 'paused', campaign_status: 'CAMPAIGN_PAUSED', actual_spend: '400' })
    ], { now, period: '2026-06' })

    expect(review.items.map(i => i.issueType)).toContain('stale_sync')
    expect(review.items.map(i => i.issueType)).toContain('paused_with_budget')
    expect(review.items.every(i => i.canApplyAutomatically)).toBe(false)
  })

  it('flags budgeted spend with zero conversions after enough spend has accrued', () => {
    const review = buildPacingReview([
      row({ media_spend_id: 'zero', actual_spend: '900', conversions: '0' })
    ], { now, period: '2026-06' })

    expect(review.items.some(i => i.issueType === 'zero_conversion')).toBe(true)
  })

  it('flags active campaigns with linked negative social feedback', () => {
    const review = buildPacingReview([
      row({
        media_spend_id: 'social-negative',
        social_feedback_count: '3',
        social_negative_feedback_count: '2',
        social_feedback_latest_at: '2026-06-11T00:00:00.000Z',
        social_feedback_examples: [
          {
            conversationId: 'conv-1',
            channelType: 'comment',
            preview: 'This offer is misleading',
            sentiment: -0.8,
            lastMessageAt: '2026-06-11T00:00:00.000Z'
          }
        ]
      })
    ], { now, period: '2026-06' })

    expect(review.items).toHaveLength(1)
    expect(review.items[0]).toMatchObject({
      issueType: 'negative_social_feedback',
      severity: 'warning',
      socialFeedback: {
        totalCount: 3,
        negativeCount: 2,
        latestAt: '2026-06-11T00:00:00.000Z'
      }
    })
    expect(review.items[0].recommendedAction).toMatch(/social comments/i)
  })

  it('summarizes counts and projected variance across review items', () => {
    const review = buildPacingReview([
      row({ media_spend_id: 'over', actual_spend: '1800' }),
      row({ media_spend_id: 'under', actual_spend: '500' }),
      row({ media_spend_id: 'stale', synced_at: '2026-06-08T00:00:00.000Z' })
    ], { now, period: '2026-06' })
    const summary = summarizePacingReview(review.items)

    expect(summary.criticalCount).toBeGreaterThan(0)
    expect(summary.warningCount).toBeGreaterThan(0)
    expect(summary.staleCount).toBe(1)
    expect(summary.projectedOverspend).toBeGreaterThan(0)
    expect(summary.projectedUnderspend).toBeGreaterThan(0)
  })
})
