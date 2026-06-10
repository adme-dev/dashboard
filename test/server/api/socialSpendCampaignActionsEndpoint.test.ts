import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getRouterParam = (event: any, key: string) => event.params?.[key]
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('GET /api/agency/social/spend/:id/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([
      {
        id: 'action-1',
        media_spend_id: 'spend-1',
        platform: 'meta',
        action_type: 'budget_update',
        action_status: 'applied',
        requested_by: 'user-1',
        requested_by_name: 'Jane Buyer',
        requested_by_avatar: null,
        requested_at: '2026-06-10T03:00:00.000Z',
        executed_at: '2026-06-10T03:02:00.000Z',
        previous_value: { dailyBudget: 120 },
        new_value: { dailyBudget: 95 },
        reason: 'Overpacing against monthly budget',
        external_request_id: 'meta-req-1',
        error_message: null,
      },
    ])
  })

  it('requires auth and returns normalized campaign action rows', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions.get')).default

    const result = await handler({ params: { id: 'spend-1' } } as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['spend-1'])
    expect(String(mockQueryRows.mock.calls[0][0])).toContain('campaign_action_log')
    expect(result).toEqual([
      {
        id: 'action-1',
        mediaSpendId: 'spend-1',
        platform: 'meta',
        actionType: 'budget_update',
        actionStatus: 'applied',
        requestedBy: 'user-1',
        requestedByName: 'Jane Buyer',
        requestedByAvatar: null,
        requestedAt: '2026-06-10T03:00:00.000Z',
        executedAt: '2026-06-10T03:02:00.000Z',
        previousValue: { dailyBudget: 120 },
        newValue: { dailyBudget: 95 },
        reason: 'Overpacing against monthly budget',
        externalRequestId: 'meta-req-1',
        errorMessage: null,
      },
    ])
  })

  it('rejects missing spend id', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions.get')).default

    await expect(handler({ params: {} } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'id is required',
    })
  })
})
