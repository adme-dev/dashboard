import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryOne = vi.fn()
const mockRecordCampaignAction = vi.fn()
let mockBody: Record<string, unknown> = {}
const freshSyncedAt = () => new Date().toISOString()

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/campaignActionLog', () => ({
  recordCampaignAction: (...args: unknown[]) => mockRecordCampaignAction(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getRouterParam = (event: any, key: string) => event.params?.[key]
;(globalThis as any).readBody = () => mockBody
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('POST /api/agency/social/spend/:id/actions/plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {
      currentDailyBudget: 120,
      recommendedDailyBudget: 95,
      reason: 'Projected overspend',
      issueType: 'overpacing',
      pacingRatio: 1.45,
      projectedMonthEnd: 5400,
      budget: 3000,
    }
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        platform: 'google_ads',
        campaign_name: 'Brand Search',
        client_id: 'client-1',
        campaign_id: 'campaign-1',
        connection_id: 'connection-1',
        account_id: '123',
        period: '2026-06',
        synced_at: freshSyncedAt(),
      })
      .mockResolvedValueOnce(null)
    mockRecordCampaignAction.mockResolvedValue({
      id: 'action-1',
      mediaSpendId: 'spend-1',
      platform: 'google',
      budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
      actionType: 'budget_update',
      actionStatus: 'planned',
    })
  })

  it('records a planned budget action for the current recommendation', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    const result = await handler({ params: { id: 'spend-1' } } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['spend-1'])
    expect(mockRecordCampaignAction).toHaveBeenCalledWith({
      mediaSpendId: 'spend-1',
      platform: 'google_ads',
      budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
      actionType: 'budget_update',
      actionStatus: 'planned',
      requestedBy: 'user-1',
      previousValue: { dailyBudget: 120 },
      newValue: { dailyBudget: 95 },
      reason: 'Projected overspend',
      metadata: {
        source: 'ai_pacing_review',
        recommendationResourceName: null,
        budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
        budgetPeriod: '2026-06',
        campaignExternalId: 'campaign-1',
        accountId: '123',
        connectionId: 'connection-1',
        clientId: 'client-1',
        budgetIdentityIssues: [],
        issueType: 'overpacing',
        pacingRatio: 1.45,
        projectedMonthEnd: 5400,
        monthlyBudget: 3000,
        campaignName: 'Brand Search',
      },
    })
    expect(result).toEqual({
      planned: true,
      action: {
        id: 'action-1',
        mediaSpendId: 'spend-1',
        platform: 'google',
        budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
        actionType: 'budget_update',
        actionStatus: 'planned',
      },
    })
  })

  it('records a provided source and recommendation resource name while deduping by budget key', async () => {
    mockBody = { currentDailyBudget: 120, recommendedDailyBudget: 95, source: 'google_recommendation', recommendationResourceName: 'customers/9/recommendations/abc' }
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default
    await handler({ params: { id: 'spend-1' } } as any)

    // Dedupe query (2nd queryOne call) keys on the canonical budget identity, not the source or daily amount.
    expect(mockQueryOne.mock.calls[1][1]).toEqual([
      'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
      'google_ads',
      '2026-06',
      'client-1',
      'campaign-1',
      '123',
    ])
    const recordedMeta = (mockRecordCampaignAction.mock.calls[0][0] as any).metadata
    expect(recordedMeta.source).toBe('google_recommendation')
    expect(recordedMeta.recommendationResourceName).toBe('customers/9/recommendations/abc')
  })

  it('returns an existing planned or approved action for the same budget key instead of creating a duplicate', async () => {
    mockBody = {
      currentDailyBudget: 120,
      recommendedDailyBudget: 85,
      source: 'manual_review',
    }
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        platform: 'google_ads',
        campaign_name: 'Brand Search',
        client_id: 'client-1',
        campaign_id: 'campaign-1',
        connection_id: 'connection-1',
        account_id: '123',
        period: '2026-06',
        synced_at: freshSyncedAt(),
      })
      .mockResolvedValueOnce({
        id: 'action-existing',
        media_spend_id: 'spend-1',
        platform: 'google_ads',
        budget_key: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
        action_type: 'budget_update',
        action_status: 'approved',
        requested_by: 'user-1',
        requested_at: '2026-06-10T03:00:00.000Z',
        approved_by: 'manager-1',
        approved_at: '2026-06-10T03:10:00.000Z',
        cancelled_by: null,
        cancelled_at: null,
        executed_at: null,
        external_request_id: null,
        error_message: null,
        previous_value: { dailyBudget: 120 },
        new_value: { dailyBudget: 95 },
        reason: 'Projected overspend',
      })
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    const result = await handler({ params: { id: 'spend-1' } } as any)

    expect(mockRecordCampaignAction).not.toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[1][0])).toContain("cal.action_status IN ('planned', 'approved', 'executing')")
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('cal.budget_key = $1')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('LEFT JOIN media_spend active_ms')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('active_ms.campaign_id = $5')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('approved_by::text')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('approved_at::text')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('cancelled_by::text')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('cancelled_at::text')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('executed_at::text')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('external_request_id')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain('error_message')
    expect(String(mockQueryOne.mock.calls[1][0])).toContain("ORDER BY CASE WHEN cal.action_status = 'approved' THEN 0 ELSE 1 END")
    expect(result).toEqual({
      planned: false,
      existing: true,
      action: {
        id: 'action-existing',
        mediaSpendId: 'spend-1',
        platform: 'google',
        budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
        actionType: 'budget_update',
        actionStatus: 'approved',
        requestedBy: 'user-1',
        requestedAt: '2026-06-10T03:00:00.000Z',
        approvedBy: 'manager-1',
        approvedAt: '2026-06-10T03:10:00.000Z',
        cancelledBy: null,
        cancelledAt: null,
        executedAt: null,
        previousValue: { dailyBudget: 120 },
        newValue: { dailyBudget: 95 },
        reason: 'Projected overspend',
        externalRequestId: null,
        errorMessage: null,
      },
    })
  })

  it('returns the existing action if a concurrent insert hits the active budget key index', async () => {
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        platform: 'google_ads',
        campaign_name: 'Brand Search',
        client_id: 'client-1',
        campaign_id: 'campaign-1',
        connection_id: 'connection-1',
        account_id: '123',
        period: '2026-06',
        synced_at: freshSyncedAt(),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'action-existing',
        media_spend_id: 'spend-1',
        platform: 'google_ads',
        budget_key: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
        action_type: 'budget_update',
        action_status: 'planned',
        requested_by: 'user-1',
        requested_at: '2026-06-10T03:00:00.000Z',
        approved_by: null,
        approved_at: null,
        cancelled_by: null,
        cancelled_at: null,
        executed_at: null,
        external_request_id: null,
        error_message: null,
        previous_value: { dailyBudget: 120 },
        new_value: { dailyBudget: 95 },
        reason: 'Projected overspend',
      })
    mockRecordCampaignAction.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'idx_campaign_action_log_active_budget_key',
    }))
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    const result = await handler({ params: { id: 'spend-1' } } as any)

    expect(mockRecordCampaignAction).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      planned: false,
      existing: true,
      action: {
        id: 'action-existing',
        budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
        actionStatus: 'planned',
      },
    })
  })

  it('rejects campaigns without a canonical budget identity', async () => {
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValueOnce({
      id: 'spend-1',
      platform: 'meta',
      campaign_name: 'Manual campaign',
      client_id: 'client-1',
      campaign_id: null,
      connection_id: 'connection-1',
      account_id: 'act-1',
      period: '2026-06',
      synced_at: freshSyncedAt(),
    })
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    await expect(handler({ params: { id: 'spend-1' } } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Campaign is not eligible for budget actions: missing_campaign_external_id',
    })
    expect(mockRecordCampaignAction).not.toHaveBeenCalled()
  })

  it('rejects stale spend sync data before planning a budget action', async () => {
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValueOnce({
      id: 'spend-1',
      platform: 'meta',
      campaign_name: 'Brand Awareness',
      client_id: 'client-1',
      campaign_id: 'campaign-1',
      connection_id: 'connection-1',
      account_id: 'act-1',
      period: '2026-06',
      synced_at: '2000-01-01T00:00:00.000Z',
    })
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    await expect(handler({ params: { id: 'spend-1' } } as any)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Campaign spend data is stale or has never synced; sync spend before planning a budget action',
    })
    expect(mockRecordCampaignAction).not.toHaveBeenCalled()
  })

  it('rejects missing recommended daily budget', async () => {
    mockBody = { currentDailyBudget: 120 }
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    await expect(handler({ params: { id: 'spend-1' } } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'recommendedDailyBudget must be a non-negative number',
    })
  })

  it('rejects unknown spend rows', async () => {
    mockQueryOne.mockReset()
    mockQueryOne.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    await expect(handler({ params: { id: 'missing' } } as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Spend record not found',
    })
  })
})
