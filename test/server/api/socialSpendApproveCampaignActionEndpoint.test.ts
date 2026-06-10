import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getRouterParam = (event: any, key: string) => event.params?.[key]
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('POST /api/agency/social/spend/:id/actions/:actionId/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'approver-1' })
    mockQueryOne.mockResolvedValue({
      id: 'action-1',
      media_spend_id: 'spend-1',
      platform: 'google_ads',
      action_type: 'budget_update',
      action_status: 'approved',
      requested_by: 'user-1',
      requested_at: '2026-06-10T03:00:00.000Z',
      approved_by: 'approver-1',
      approved_at: '2026-06-10T03:15:00.000Z',
      executed_at: null,
      previous_value: { dailyBudget: 120 },
      new_value: { dailyBudget: 95 },
      reason: 'Projected overspend',
    })
  })

  it('approves a planned action without applying it to the platform', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/approve.post')).default

    const result = await handler({ params: { id: 'spend-1', actionId: 'action-1' } } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("action_status = 'approved'")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("action_status = 'planned'")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('executed_at::text')
    expect(String(mockQueryOne.mock.calls[0][0])).not.toContain('executed_at =')
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['spend-1', 'action-1', 'approver-1'])
    expect(result).toEqual({
      approved: true,
      action: {
        id: 'action-1',
        mediaSpendId: 'spend-1',
        platform: 'google',
        actionType: 'budget_update',
        actionStatus: 'approved',
        requestedBy: 'user-1',
        requestedAt: '2026-06-10T03:00:00.000Z',
        approvedBy: 'approver-1',
        approvedAt: '2026-06-10T03:15:00.000Z',
        executedAt: null,
        previousValue: { dailyBudget: 120 },
        newValue: { dailyBudget: 95 },
        reason: 'Projected overspend',
      },
    })
  })

  it('rejects missing action id', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/approve.post')).default

    await expect(handler({ params: { id: 'spend-1' } } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'actionId is required',
    })
  })

  it('rejects non-planned or unknown actions', async () => {
    mockQueryOne.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/approve.post')).default

    await expect(handler({ params: { id: 'spend-1', actionId: 'action-1' } } as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Planned action not found',
    })
  })
})
