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

describe('POST /api/agency/social/spend/:id/actions/:actionId/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({
      id: 'action-1',
      media_spend_id: 'spend-1',
      platform: 'meta',
      action_type: 'budget_update',
      action_status: 'cancelled',
      requested_by: 'user-1',
      requested_at: '2026-06-10T03:00:00.000Z',
      approved_by: 'manager-1',
      approved_at: '2026-06-10T03:02:00.000Z',
      cancelled_by: 'user-1',
      cancelled_at: '2026-06-10T03:05:00.000Z',
      executed_at: null,
      external_request_id: null,
      error_message: null,
      previous_value: { dailyBudget: 120 },
      new_value: { dailyBudget: 95 },
      reason: 'Projected overspend',
    })
  })

  it('cancels a planned or approved action without deleting its history row', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/cancel.post')).default

    const result = await handler({ params: { id: 'spend-1', actionId: 'action-1' } } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("action_status = 'cancelled'")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("'proposalDecision', 'rejected'")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("'proposalDecidedBy', $3::text")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("'proposalDecidedAt', NOW()::text")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('cancelled_by = $3')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('cancelled_at = NOW()')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('approved_by::text')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('approved_at::text')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('executed_at::text')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('external_request_id')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('error_message')
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("action_status = 'planned'")
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("action_status = 'approved'")
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['spend-1', 'action-1', 'user-1'])
    expect(result).toEqual({
      cancelled: true,
      action: {
        id: 'action-1',
        mediaSpendId: 'spend-1',
        platform: 'meta',
        actionType: 'budget_update',
        actionStatus: 'cancelled',
        requestedBy: 'user-1',
        requestedAt: '2026-06-10T03:00:00.000Z',
        approvedBy: 'manager-1',
        approvedAt: '2026-06-10T03:02:00.000Z',
        cancelledBy: 'user-1',
        cancelledAt: '2026-06-10T03:05:00.000Z',
        executedAt: null,
        previousValue: { dailyBudget: 120 },
        newValue: { dailyBudget: 95 },
        reason: 'Projected overspend',
        externalRequestId: null,
        errorMessage: null,
      },
    })
  })

  it('rejects missing action id', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/cancel.post')).default

    await expect(handler({ params: { id: 'spend-1' } } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'actionId is required',
    })
  })

  it('rejects applied, failed, cancelled, or unknown actions', async () => {
    mockQueryOne.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/cancel.post')).default

    await expect(handler({ params: { id: 'spend-1', actionId: 'action-1' } } as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Cancellable action not found',
    })
  })
})
