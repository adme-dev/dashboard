import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

describe('recordCampaignAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({
      id: 'action-1',
      media_spend_id: 'spend-1',
      platform: 'google_ads',
      action_type: 'budget_update',
      action_status: 'pending',
      requested_by: 'user-1',
      requested_at: '2026-06-10T03:00:00.000Z',
      approved_by: null,
      approved_at: null,
      executed_at: null,
      previous_value: { dailyBudget: 120 },
      new_value: { dailyBudget: 95 },
      reason: 'Projected overspend',
      external_request_id: null,
      error_message: null,
      metadata: { source: 'ai_pacing_review' },
    })
  })

  it('inserts a normalized campaign action row with JSON before and after values', async () => {
    const { recordCampaignAction } = await import('~~/server/utils/campaignActionLog')

    const result = await recordCampaignAction({
      mediaSpendId: 'spend-1',
      platform: 'google',
      actionType: 'budget_update',
      actionStatus: 'pending',
      requestedBy: 'user-1',
      previousValue: { dailyBudget: 120 },
      newValue: { dailyBudget: 95 },
      reason: 'Projected overspend',
      metadata: { source: 'ai_pacing_review' },
    })

    expect(mockQueryOne).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('INSERT INTO campaign_action_log')
    expect(mockQueryOne.mock.calls[0][1]).toEqual([
      'spend-1',
      'google_ads',
      'budget_update',
      'pending',
      'user-1',
      null,
      null,
      null,
      { dailyBudget: 120 },
      { dailyBudget: 95 },
      'Projected overspend',
      null,
      null,
      { source: 'ai_pacing_review' },
    ])
    expect(result).toEqual({
      id: 'action-1',
      mediaSpendId: 'spend-1',
      platform: 'google',
      actionType: 'budget_update',
      actionStatus: 'pending',
      requestedBy: 'user-1',
      requestedAt: '2026-06-10T03:00:00.000Z',
      approvedBy: null,
      approvedAt: null,
      executedAt: null,
      previousValue: { dailyBudget: 120 },
      newValue: { dailyBudget: 95 },
      reason: 'Projected overspend',
      externalRequestId: null,
      errorMessage: null,
      metadata: { source: 'ai_pacing_review' },
    })
  })

  it('throws when the insert does not return a row', async () => {
    mockQueryOne.mockResolvedValue(null)
    const { recordCampaignAction } = await import('~~/server/utils/campaignActionLog')

    await expect(recordCampaignAction({
      mediaSpendId: 'spend-1',
      platform: 'meta',
      actionType: 'budget_update',
      previousValue: {},
      newValue: { dailyBudget: 100 },
    })).rejects.toThrow('Failed to record campaign action')
  })
})
