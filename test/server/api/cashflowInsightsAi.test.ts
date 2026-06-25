import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  body?: Record<string, unknown>
}

const mockGenerateGroqInsight = vi.fn()

vi.mock('h3', () => ({
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_8B: 'llama-3.1-8b-instant',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
}

testGlobal.eventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}

const { default: handler } = await import('../../../server/api/ai/cashflow-insights.post')

describe('POST /api/ai/cashflow-insights telemetry', () => {
  beforeEach(() => {
    mockGenerateGroqInsight.mockReset().mockResolvedValue(JSON.stringify({
      healthAssessment: {
        status: 'concerning',
        summary: 'Cash runway needs attention.',
        score: 58,
      },
      priorityActions: [],
      risks: [],
      opportunities: [],
    }))
  })

  it('records Model Ops metadata for AI cashflow insight generation', async () => {
    const body = {
      currentCash: 50000,
      projectedEndBalance: 12000,
      minProjectedBalance: -5000,
      maxProjectedBalance: 70000,
      burnRate: 1800,
      runway: 28,
      shortfallCount: 2,
      outstandingReceivables: 45000,
      overdueReceivables: 15000,
      outstandingCount: 8,
      overdueCount: 3,
      forecastPeriod: 90,
      scenarios: {
        best: { endBalance: 80000 },
        likely: { endBalance: 12000 },
        worst: { endBalance: -10000 },
      },
    }

    const result = await handler({ body } satisfies TestEvent)

    expect(result.healthAssessment).toMatchObject({
      status: 'concerning',
      score: 58,
    })
    expect(result.metadata).toMatchObject({
      model: 'llama-3.1-8b-instant',
      dataPoints: {
        currentCash: 50000,
        projectedEndBalance: 12000,
        runway: 28,
        shortfallCount: 2,
      },
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('CURRENT FINANCIAL POSITION'), expect.objectContaining({
      model: 'llama-3.1-8b-instant',
      featureKey: 'cashflow_insights',
      requestId: 'forecast-90',
      metadata: {
        route: '/api/ai/cashflow-insights',
        forecastPeriod: 90,
        runwayDays: 28,
        shortfallCount: 2,
        outstandingCount: 8,
        overdueCount: 3,
        hasScenarios: true,
        currentCash: 50000,
        projectedEndBalance: 12000,
        minProjectedBalance: -5000,
        maxProjectedBalance: 70000,
        burnRate: 1800,
        outstandingReceivables: 45000,
        overdueReceivables: 15000,
      },
    }))
  })
})
