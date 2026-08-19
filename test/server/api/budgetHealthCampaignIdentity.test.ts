import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryRows = vi.fn()
let mockQuery: Record<string, unknown> = { month: 6, year: 2026 }

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

;(globalThis as any).defineEventHandler = (fn: any) => fn
;(globalThis as any).getQuery = () => mockQuery
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('GET /api/agency/budget-alerts/health campaign identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = { month: 6, year: 2026 }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          media_spend_id: 'spend-1',
          campaign_id: 'campaign-1',
          campaign_name: 'Budget Health Campaign',
          connection_id: 'connection-1',
          budget_account_id: 'act-1',
          client_id: 'client-1',
          client_name: 'Client 1',
          platform: 'meta',
          campaign_status: 'ACTIVE',
          end_date: null,
          budget_rolling: false,
          monthly_budget: '1000',
          mtd_spend: '250',
          impressions: '1000',
          clicks: '50',
          conversions: '3',
          last_synced_at: '2026-06-20T00:00:00.000Z',
        },
      ])
  })

  it('returns canonical budget identity fields for campaign pacing rows', async () => {
    const handler = (await import('~~/server/api/agency/budget-alerts/health.get')).default

    const result = await handler({} as any)

    expect(String(mockQueryRows.mock.calls[2][0])).toContain('COALESCE(ms.actual_spend, 0) as mtd_spend')
    expect(result.campaigns[0]).toMatchObject({
      mediaSpendId: 'spend-1',
      budgetKey: 'tenant:tenant-1|client:client-1|platform:meta|account:act-1|campaign:campaign-1|period:2026-06',
      budgetActionable: true,
      budgetIdentityIssues: [],
      budgetPeriod: '2026-06',
    })
  })

  it('returns client budget coverage and spend freshness without declaring partial budgets over budget', async () => {
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([
        {
          client_id: 'client-1',
          client_name: 'Northern Motor Group',
          platform: 'meta',
          total_budget: '510',
          total_spend: '1705.22',
          total_commission: '0',
          campaign_count: 13,
          budgeted_campaign_count: 1,
          is_rolling: false,
          last_synced_at: '2026-08-18T00:15:00.000Z',
        },
        {
          client_id: 'client-2',
          client_name: 'No Budget Client',
          platform: 'meta',
          total_budget: '0',
          total_spend: '400',
          total_commission: '0',
          campaign_count: 2,
          budgeted_campaign_count: 0,
          is_rolling: false,
          last_synced_at: '2026-08-18T00:10:00.000Z',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const handler = (await import('~~/server/api/agency/budget-alerts/health.get')).default
    const result = await handler({} as any)
    const clientQuery = String(mockQueryRows.mock.calls[0][0])

    expect(clientQuery).toContain('SUM(COALESCE(ms.budget_allocated, 0))')
    expect(clientQuery).toContain('budgeted_campaign_count')
    expect(clientQuery).toContain('MAX(ms.synced_at)::text as last_synced_at')
    expect(result.clients[0]).toMatchObject({
      budget: 510,
      spend: 1705.22,
      campaignCount: 13,
      budgetedCampaignCount: 1,
      healthStatus: 'partial_budget_coverage',
      percentConsumed: null,
      pacingRatio: null,
      lastSyncedAt: '2026-08-18T00:15:00.000Z',
    })
    expect(result.summary.overBudgetCount).toBe(0)
    expect(result.summary).toMatchObject({
      totalBudget: 510,
      totalSpent: 1705.22,
      trackedSpend: 2105.22,
      totalRemaining: -1195.22,
      overallUtilization: null,
    })
  })
})
