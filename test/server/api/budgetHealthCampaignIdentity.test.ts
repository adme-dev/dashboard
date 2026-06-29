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
})
