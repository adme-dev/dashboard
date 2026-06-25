import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  params?: Record<string, string>
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getRouterParam: (event: TestEvent, key: string) => event.params?.[key],
  getQuery: (event: TestEvent) => event.query ?? {},
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../server/api/customers/[contactId]/insights.get')

describe('GET /api/customers/:contactId/insights AI summary telemetry', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mockQueryOne.mockReset()
    mockQueryRows.mockReset().mockResolvedValue([
      {
        id: 'anomaly-1',
        type: 'payment',
        severity: 'high',
        title: 'Overdue balance',
        description: 'Customer has an overdue balance.',
        recommendation: 'Follow up today.',
        created_at: '2026-06-20T00:00:00.000Z',
      },
    ])
    mockExecute.mockReset().mockResolvedValue({ rowCount: 1 })
    mockGenerateGroqInsight.mockReset().mockResolvedValue('Acme is growing but has overdue exposure.')
  })

  it('records Model Ops metadata when refreshing the customer AI summary', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        churn_risk_score: 72,
        churn_risk_band: 'high',
        churn_factors: { overdue: true },
        forecast_12m_cents: 4800000,
        forecast_basis: 'recurring',
        ai_summary: 'Cached summary',
        ai_summary_at: '2026-06-24T00:00:00.000Z',
        computed_at: '2026-06-24T01:00:00.000Z',
      })
      .mockResolvedValueOnce({
        name: 'Acme Pty Ltd',
        email: 'finance@acme.test',
        default_currency: 'AUD',
        payment_terms_days: 30,
        ltv_cents: 12000000,
        ytd_revenue_cents: 3600000,
        last_12m_revenue_cents: 10000000,
        last_12m_buckets: {},
        invoice_count: 12,
        paid_invoice_count: 10,
        dso_days: '42',
        paid_late_pct: '30',
        outstanding_cents: 900000,
        overdue_cents: 300000,
        oldest_overdue_days: 21,
        mrr_cents: 400000,
        has_active_repeating: true,
        concentration_pct: '8.5',
        first_invoice_date: '2025-06-01',
        last_invoice_date: '2026-06-10',
        last_payment_date: '2026-06-12',
        rollup_currency: 'AUD',
      })

    const result = await handler({
      params: { contactId: 'contact-1' },
      query: { refresh: 'true' },
    })

    expect(result).toMatchObject({
      ready: true,
      churnRiskScore: 72,
      churnRiskBand: 'high',
      forecast12m: 48000,
      forecastBasis: 'recurring',
      aiSummary: 'Acme is growing but has overdue exposure.',
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Customer: Acme Pty Ltd'), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'customer_insights_summary',
      clientId: 'tenant-1',
      requestId: 'contact-1',
      metadata: {
        route: '/api/customers/:contactId/insights',
        tenantId: 'tenant-1',
        contactId: 'contact-1',
        anomalyCount: 1,
        churnRiskBand: 'high',
        forecastBasis: 'recurring',
        hasAiSummary: true,
        hasActiveRepeating: true,
        invoiceCount: 12,
        hasOutstanding: true,
        hasOverdue: true,
        hasMrr: true,
      },
    }))
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customer_insights'),
      ['Acme is growing but has overdue exposure.', 'tenant-1', 'contact-1'],
    )
  })
})
