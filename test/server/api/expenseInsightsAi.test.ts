import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  headers?: Record<string, string>
}

const mockGetActiveTokenForSession = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockCachedFetch = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockFetch = vi.fn()

vi.mock('h3', () => ({
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/tokenStore', () => ({
  getActiveTokenForSession: (...args: unknown[]) => mockGetActiveTokenForSession(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (...args: unknown[]) => mockCachedFetch(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

vi.mock('~~/server/utils/ai/modelAssignments', () => ({
  resolveAiModelAssignment: vi.fn(async () => ({
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    fallbackModelId: null,
    source: 'default',
    ignoredReason: null,
    modelSpec: 'groq/llama-3.3-70b-versatile',
    fallbackModelSpec: null,
  })),
  groqModelIdFromAssignment: (modelId: string) => modelId.replace(/^groq\//, ''),
}))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  $fetch: (...args: unknown[]) => Promise<unknown>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.$fetch = (...args: unknown[]) => mockFetch(...args)

const { default: handler } = await import('../../../server/api/ai/expense-insights.get')

describe('GET /api/ai/expense-insights telemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T05:00:00.000Z'))

    mockGetActiveTokenForSession.mockReset().mockResolvedValue({ access_token: 'token-1' })
    mockGetSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mockCachedFetch.mockReset().mockImplementation(async (_event, _key, _ttl, factory) => factory())
    mockGenerateGroqInsight.mockReset().mockResolvedValue(JSON.stringify({
      insights: {
        insights: ['Software spend increased.'],
        trends: ['Subscriptions are rising.'],
        alerts: [],
        summary: 'Expense profile is stable.',
      },
      anomalies: {
        anomalies: [],
        summary: 'No major anomalies.',
      },
      optimization: {
        recommendations: [],
        summary: 'Review subscriptions.',
      },
    }))
    mockFetch.mockReset().mockResolvedValue({
      categories: [
        { name: 'Software', amount: 12000 },
        { name: 'Media', amount: 8000 },
      ],
      vendors: [
        { name: 'Adobe', amount: 7000 },
        { name: 'Google', amount: 6000 },
        { name: 'Figma', amount: 5000 },
      ],
      transactions: [{ id: 'txn-1' }, { id: 'txn-2' }],
      monthOverMonth: {
        change: 12.5,
        changeAmount: 2500,
        previous: { total: 17500, from: '2026-05-01', to: '2026-05-31' },
      },
      fixedVsVariable: {
        fixed: { total: 9000 },
        variable: { total: 11000 },
      },
      taxSummary: {
        totalTax: 1800,
        totalNet: 18200,
      },
      subscriptions: {
        total: 3000,
        items: [
          { vendor: 'Adobe', amount: 1200, frequency: 'monthly' },
          { vendor: 'Figma', amount: 800, frequency: 'monthly' },
        ],
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records Model Ops metadata for AI expense insight generation', async () => {
    const result = await handler({ headers: { cookie: 'sid=1' } } satisfies TestEvent)

    expect(result.success).toBe(true)
    expect(result.data.model).toBe('llama-3.3-70b-versatile')
    expect(mockFetch).toHaveBeenCalledWith('/api/xero/expenses', {
      headers: { cookie: 'sid=1' },
      query: { from: '2026-06-01', to: '2026-06-30' },
    })
    expect(mockCachedFetch).toHaveBeenCalledWith(
      expect.anything(),
      'ai:expense-insights:tenant-1:2026-06-01',
      3600,
      expect.any(Function),
    )
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Top categories:'), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'expense_insights',
      clientId: 'tenant-1',
      requestId: '2026-06-01',
      metadata: {
        route: '/api/ai/expense-insights',
        tenantId: 'tenant-1',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        categoryCount: 2,
        vendorCount: 3,
        transactionCount: 2,
        totalSpend: 20000,
        hasMonthOverMonth: true,
        hasFixedVariable: true,
        hasTaxSummary: true,
        subscriptionCount: 2,
        subscriptionTotal: 3000,
        modelAssignmentSource: 'default',
        modelAssignmentIgnoredReason: null,
      },
    }))
  })
})
