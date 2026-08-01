import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  headers?: Record<string, string>
  $fetch: (...args: unknown[]) => Promise<unknown>
}

const mockGetSelectedTenant = vi.fn()
const mockCachedFetch = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockFetch = vi.fn()

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (...args: unknown[]) => mockCachedFetch(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_8B: 'llama-3.1-8b-instant',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  $fetch: (...args: unknown[]) => Promise<unknown>
}

testGlobal.eventHandler = fn => fn
testGlobal.$fetch = (...args: unknown[]) => mockFetch(...args)

const { default: handler } = await import('../../../server/api/ai/insights.get')

describe('GET /api/ai/insights telemetry', () => {
  beforeEach(() => {
    mockGetSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mockCachedFetch.mockReset().mockImplementation(async (_event, _key, _ttl, factory) => factory())
    mockGenerateGroqInsight.mockReset()
      .mockResolvedValueOnce('Margins are under pressure while cash needs monitoring.')
      .mockResolvedValueOnce(JSON.stringify([
        {
          title: 'Tighten weekly cash reviews',
          description: 'Review aged receivables and discretionary spend each week.',
          impact: 'high',
          category: 'Cash Flow',
        },
      ]))
    mockFetch.mockReset().mockImplementation(async (url: string) => {
      const responses: Record<string, unknown> = {
        '/api/xero/reports/pnl': {
          profitMargin: 0.04,
          netProfit: 8000,
          revenueTotal: 200000,
          expensesTotal: 192000,
          periods: [
            { revenue: 180000, netProfit: 18000 },
            { revenue: 200000, netProfit: 8000 },
          ],
        },
        '/api/xero/expenses': {
          total: 192000,
          categories: [{ name: 'Software', amount: 40000 }],
        },
        '/api/xero/invoices': {
          invoices: [],
        },
        '/api/xero/bank-monitoring': {
          portfolio: {
            totalBalance: 30000,
          },
        },
        '/api/xero/reports/cash-flow-forecast': {
          runwayDays: 25,
          minBalance: -5000,
        },
        '/api/xero/reports/aging': {
          totalOutstanding: 70000,
          criticalAmount: 18000,
        },
        '/api/xero/reports/budget-variance': {
          summary: {
            totalVariancePercent: 35,
            overBudgetCount: 3,
          },
        },
        '/api/cashflow': {
          healthAssessment: { status: 'concerning' },
        },
      }
      return responses[url] ?? null
    })
  })

  it('records Model Ops metadata for headline and recommendation generation', async () => {
    const result = await handler({
      headers: { cookie: 'sid=1' },
      $fetch: (...args: unknown[]) => mockFetch(...args),
    } satisfies TestEvent)

    expect(result.executiveSummary.headline).toBe('Margins are under pressure while cash needs monitoring.')
    expect(result.recommendations.some((item: any) => item.title === 'Tighten weekly cash reviews')).toBe(true)
    expect(mockCachedFetch).toHaveBeenCalledWith(
      expect.anything(),
      'ai:insights:tenant-1',
      3600,
      expect.any(Function),
    )
    expect(mockGenerateGroqInsight).toHaveBeenCalledTimes(2)
    expect(mockGenerateGroqInsight).toHaveBeenNthCalledWith(1, expect.stringContaining('single-sentence executive headline'), expect.objectContaining({
      model: 'llama-3.1-8b-instant',
      featureKey: 'financial_insights_headline',
      clientId: 'tenant-1',
      requestId: 'ai:insights:tenant-1',
      metadata: expect.objectContaining({
        route: '/api/ai/insights',
        tenantId: 'tenant-1',
        hasPnl: true,
        hasBankMonitoring: true,
        hasAging: true,
        hasBudgetVariance: true,
        recommendationCount: expect.any(Number),
      }),
    }))
    expect(mockGenerateGroqInsight).toHaveBeenNthCalledWith(2, expect.stringContaining('Existing recommendations:'), expect.objectContaining({
      model: 'llama-3.1-8b-instant',
      featureKey: 'financial_insights_recommendations',
      clientId: 'tenant-1',
      requestId: 'ai:insights:tenant-1',
      metadata: expect.objectContaining({
        route: '/api/ai/insights',
        tenantId: 'tenant-1',
        existingRecommendationCount: expect.any(Number),
        hasPnl: true,
        hasExpenses: true,
        hasInvoices: true,
        hasCashForecast: true,
        hasCashFlowInsights: true,
      }),
    }))
  })
})
