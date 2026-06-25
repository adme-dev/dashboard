import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

const mockGetSelectedTenant = vi.fn()
const mockCachedFetch = vi.fn()
const mockSearchSimilar = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockFetch = vi.fn()

vi.mock('h3', () => ({
  readBody: (event: TestEvent) => Promise.resolve(event.body ?? {}),
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (...args: unknown[]) => mockCachedFetch(...args),
}))

vi.mock('~~/server/utils/aiVectorize', () => ({
  searchSimilar: (...args: unknown[]) => mockSearchSimilar(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  $fetch: (...args: unknown[]) => Promise<unknown>
}

testGlobal.eventHandler = fn => fn
testGlobal.$fetch = (...args: unknown[]) => mockFetch(...args)

const { default: handler } = await import('../../../server/api/ai/action-plan.post')

describe('POST /api/ai/action-plan telemetry', () => {
  beforeEach(() => {
    mockGetSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mockCachedFetch.mockReset().mockImplementation(async (_event, _key, _ttl, factory) => factory())
    mockSearchSimilar.mockReset().mockResolvedValue([
      { id: 'knowledge-1', score: 0.8, metadata: { title: 'Agency cashflow playbook', type: 'guide' } },
    ])
    mockFetch.mockReset().mockResolvedValue({ total: 120000, rows: [] })
    mockGenerateGroqInsight.mockReset().mockResolvedValue(JSON.stringify({
      summary: 'Improve collections and update weekly cashflow controls.',
      actionSteps: [
        { action: 'Call overdue clients', detail: 'Prioritise the largest balances.', priority: 'immediate', owner: 'Finance' },
      ],
      regulatoryContext: 'No immediate regulatory blocker.',
      references: [],
      timeline: 'Start this week.',
      riskAssessment: 'Runway risk remains elevated.',
      estimatedImpact: 'Improved cash conversion.',
    }))
  })

  it('records Model Ops metadata for generated action plans', async () => {
    const body = {
      type: 'anomaly',
      title: 'Cash shortfall projected',
      description: 'The forecast shows a negative balance within 30 days.',
      severity: 'high',
      category: 'cashflow',
      metric: { label: 'Minimum balance', value: -12000 },
      recommendation: 'Accelerate collections.',
      actionSteps: ['Call top overdue clients'],
      tags: ['cashflow', 'collections'],
    }

    const result = await handler({ body, headers: { cookie: 'sid=1' } } satisfies TestEvent)

    expect(result).toMatchObject({
      summary: 'Improve collections and update weekly cashflow controls.',
      actionSteps: [
        {
          step: 1,
          action: 'Call overdue clients',
          priority: 'immediate',
          owner: 'Finance',
        },
      ],
      xeroDataUsed: ['Bank Monitoring', 'Cash Flow Forecast'],
      vectorizeContextUsed: true,
    })
    expect(mockCachedFetch).toHaveBeenCalledWith(
      expect.anything(),
      'ai:action-plan:tenant-1:Cash-shortfall-projected',
      1800,
      expect.any(Function),
    )
    expect(mockSearchSimilar).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Cash shortfall projected'),
      5,
    )
    expect(mockFetch).toHaveBeenCalledWith('/api/xero/bank-monitoring', {
      headers: { cookie: 'sid=1' },
      query: undefined,
    })
    expect(mockFetch).toHaveBeenCalledWith('/api/xero/reports/cash-flow-forecast', {
      headers: { cookie: 'sid=1' },
      query: undefined,
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Cash shortfall projected'), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'action_plan_generation',
      clientId: 'tenant-1',
      requestId: 'Cash-shortfall-projected',
      metadata: {
        route: '/api/ai/action-plan',
        tenantId: 'tenant-1',
        type: 'anomaly',
        category: 'cashflow',
        severity: 'high',
        titleChars: 24,
        descriptionChars: 53,
        hasMetric: true,
        hasRecommendation: true,
        actionStepCount: 1,
        tagCount: 2,
        xeroDataSourceCount: 2,
        vectorizeContextUsed: true,
        webResearchUsed: false,
      },
    }))
  })
})
