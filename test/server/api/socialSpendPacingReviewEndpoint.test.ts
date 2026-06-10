import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: { LLAMA_8B: 'llama-3.1-8b-instant' },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getQuery = (event: any) => event.query || {}

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
        conversions: '4',
        period: '2026-06',
        synced_at: '2026-06-12T00:00:00.000Z',
        end_date: null,
      },
    ])
    mockGenerateGroqInsight.mockRejectedValue(new Error('no model'))
  })

  it('requires auth and returns deterministic review items when AI summary fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T10:00:00+10:00'))
    const handler = (await import('~~/server/api/agency/social/spend/pacing-review.get')).default

    const result = await handler({ query: { month: 6, year: 2026 } } as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(result.aiSummary).toBeNull()
    expect(result.items[0]).toMatchObject({
      mediaSpendId: 'spend-1',
      issueType: 'overpacing',
      platform: 'meta',
      canApplyAutomatically: false,
    })
    vi.useRealTimers()
  })

  it('normalizes the google platform filter to google_ads in SQL parameters', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/pacing-review.get')).default

    await handler({ query: { month: 6, year: 2026, platform: 'google', ai: '0' } } as any)

    expect(mockQueryRows.mock.calls[0][1]).toEqual(['2026-06', 'google_ads'])
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })
})
