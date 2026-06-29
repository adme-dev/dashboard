import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockGenerateGroqInsight = vi.fn()

interface TestEvent {
  query?: Record<string, string | number>
}

interface PacingReviewEndpointResult {
  aiSummary: string | null
  items: Array<{
    issueType?: string
    socialFeedback?: {
      totalCount: number
      negativeCount: number
    }
  }>
}

type TestHandler = (event: TestEvent) => Promise<PacingReviewEndpointResult>

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: { LLAMA_8B: 'llama-3.1-8b-instant' },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args)
}))

const h3Global = globalThis as typeof globalThis & {
  eventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => T
  getQuery: (event: TestEvent) => TestEvent['query']
}
h3Global.eventHandler = fn => fn
h3Global.getQuery = event => event.query || {}

describe('GET /api/agency/social/spend/pacing-review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([
      {
        media_spend_id: 'spend-1',
        client_name: 'Acme',
        platform: 'meta',
        campaign_id: 'camp-1',
        campaign_name: 'Lead Gen',
        campaign_status: 'ACTIVE',
        budget_allocated: '3000',
        actual_spend: '1800',
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
        end_date: null
      }
    ])
    mockGenerateGroqInsight.mockRejectedValue(new Error('no model'))
  })

  it('requires auth and returns deterministic review items when AI summary fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T10:00:00+10:00'))
    const handler = (await import('~~/server/api/agency/social/spend/pacing-review.get')).default as unknown as TestHandler

    const result = await handler({ query: { month: 6, year: 2026 } })

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(result.aiSummary).toBeNull()
    expect(result.items[0]).toMatchObject({
      mediaSpendId: 'spend-1',
      issueType: 'overpacing',
      platform: 'meta',
      canApplyAutomatically: false,
      performance: {
        impressions: 10000,
        clicks: 500,
        conversions: 4,
        ctr: 5,
        cpc: 3.6,
        costPerConversion: 450,
        conversionRate: 0.8,
        reach: 7500,
        frequency: 1.33,
        bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
        budgetType: 'daily'
      }
    })
    vi.useRealTimers()
  })

  it('normalizes the google platform filter to google_ads in SQL parameters', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/pacing-review.get')).default as unknown as TestHandler

    await handler({ query: { month: 6, year: 2026, platform: 'google', ai: '0' } })

    expect(mockQueryRows.mock.calls[0][1]).toEqual(['2026-06', 'google_ads'])
    expect(mockQueryRows.mock.calls[0][0]).toContain('ms.lost_impression_share_budget')
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })

  it('returns campaign social feedback warnings from the joined inbox aggregate', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        media_spend_id: 'spend-social',
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
        social_feedback_count: 2,
        social_negative_feedback_count: 1,
        social_feedback_latest_at: '2026-06-11T00:00:00.000Z',
        social_feedback_examples: [
          {
            conversationId: 'conv-1',
            channelType: 'comment',
            preview: 'This offer is misleading',
            sentiment: -0.7,
            lastMessageAt: '2026-06-11T00:00:00.000Z'
          }
        ]
      }
    ])
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T10:00:00+10:00'))
    const handler = (await import('~~/server/api/agency/social/spend/pacing-review.get')).default as unknown as TestHandler

    const result = await handler({ query: { month: 6, year: 2026, ai: '0' } })

    expect(mockQueryRows.mock.calls[0][0]).toContain('social_campaign_feedback')
    expect(mockQueryRows.mock.calls[0][0]).toContain('social_conversations')
    expect(result.items[0]).toMatchObject({
      issueType: 'negative_social_feedback',
      socialFeedback: {
        totalCount: 2,
        negativeCount: 1
      }
    })
    vi.useRealTimers()
  })
})
