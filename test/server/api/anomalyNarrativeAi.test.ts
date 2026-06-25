import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  params?: Record<string, string>
}

const mockRequireRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getRouterParam: (event: TestEvent, key: string) => event.params?.[key],
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('~~/server/utils/permissions', () => ({
  PERMISSIONS: { FINANCE: 'finance' },
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../../server/api/ai/anomalies/[id]/narrative.get')

describe('GET /api/ai/anomalies/:id/narrative telemetry', () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mockQueryOne.mockReset().mockResolvedValue({
      id: 'anomaly-1',
      tenant_id: 'tenant-1',
      type: 'cashflow',
      severity: 'high',
      status: 'open',
      title: 'Projected shortfall',
      description: 'Cash is projected to go negative.',
      metric: { label: 'Minimum balance', value: -12000, format: 'currency' },
      comparison: { label: 'Runway', value: 21, format: 'number' },
      context: { period: 'June 2026' },
      recommendation: 'Accelerate collections.',
      tags: ['cashflow', 'runway'],
      driver_narrative: null,
      driver_narrative_at: null,
    })
    mockExecute.mockReset().mockResolvedValue({ rowCount: 1 })
    mockGenerateGroqInsight.mockReset().mockResolvedValue('Cash shortfall is being driven by late receivables.')
  })

  it('records Model Ops metadata when generating an uncached anomaly narrative', async () => {
    const result = await handler({ params: { id: 'anomaly-1' } } satisfies TestEvent)

    expect(result).toMatchObject({
      narrative: 'Cash shortfall is being driven by late receivables.',
      cached: false,
    })
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), 'finance')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Projected shortfall'), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'anomaly_driver_narrative',
      clientId: 'tenant-1',
      requestId: 'anomaly-1',
      metadata: {
        route: '/api/ai/anomalies/:id/narrative',
        tenantId: 'tenant-1',
        anomalyId: 'anomaly-1',
        anomalyType: 'cashflow',
        severity: 'high',
        status: 'open',
        hasMetric: true,
        hasComparison: true,
        hasContext: true,
        hasRecommendation: true,
        tagCount: 2,
      },
    }))
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE anomalies SET driver_narrative'),
      ['Cash shortfall is being driven by late receivables.', 'anomaly-1'],
    )
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO anomaly_events'),
      ['anomaly-1'],
    )
  })
})
