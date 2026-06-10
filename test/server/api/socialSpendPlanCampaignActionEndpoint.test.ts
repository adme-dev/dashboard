import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()
const mockRecordCampaignAction = vi.fn()
let mockBody: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
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
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        platform: 'google_ads',
        campaign_name: 'Brand Search',
      })
      .mockResolvedValueOnce(null)
    mockRecordCampaignAction.mockResolvedValue({
      id: 'action-1',
      mediaSpendId: 'spend-1',
      platform: 'google',
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
      actionType: 'budget_update',
      actionStatus: 'planned',
      requestedBy: 'user-1',
      previousValue: { dailyBudget: 120 },
      newValue: { dailyBudget: 95 },
      reason: 'Projected overspend',
      metadata: {
        source: 'ai_pacing_review',
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
        actionType: 'budget_update',
        actionStatus: 'planned',
      },
    })
  })

  it('returns an existing planned or approved action instead of creating a duplicate', async () => {
    mockQueryOne.mockReset()
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        platform: 'google_ads',
        campaign_name: 'Brand Search',
      })
      .mockResolvedValueOnce({
        id: 'action-existing',
        media_spend_id: 'spend-1',
        platform: 'google_ads',
        action_type: 'budget_update',
        action_status: 'approved',
        requested_by: 'user-1',
        requested_at: '2026-06-10T03:00:00.000Z',
        previous_value: { dailyBudget: 120 },
        new_value: { dailyBudget: 95 },
        reason: 'Projected overspend',
      })
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/plan.post')).default

    const result = await handler({ params: { id: 'spend-1' } } as any)

    expect(mockRecordCampaignAction).not.toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[1][0])).toContain("action_status = 'planned'")
    expect(String(mockQueryOne.mock.calls[1][0])).toContain("action_status = 'approved'")
    expect(result).toEqual({
      planned: false,
      existing: true,
      action: {
        id: 'action-existing',
        mediaSpendId: 'spend-1',
        platform: 'google',
        actionType: 'budget_update',
        actionStatus: 'approved',
        requestedBy: 'user-1',
        requestedAt: '2026-06-10T03:00:00.000Z',
        previousValue: { dailyBudget: 120 },
        newValue: { dailyBudget: 95 },
        reason: 'Projected overspend',
      },
    })
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
