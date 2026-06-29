import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryOne = vi.fn()
const mockInvalidateSpendPeriodCaches = vi.fn()
let mockBody: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

vi.mock('~~/server/utils/socialSpendCache', () => ({
  invalidateSpendPeriodCaches: (...args: unknown[]) => mockInvalidateSpendPeriodCaches(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getRouterParam = (event: any, key: string) => event.params?.[key]
;(globalThis as any).readBody = () => mockBody
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('PATCH /api/agency/social/spend/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {
      budgetAllocated: 1500,
      rolling: 'true',
      note: 'Manual monthly budget update',
    }
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'spend-1',
        budget_allocated: '1000',
        period: '2026-06',
        platform: 'meta',
        client_id: 'client-1',
      })
      .mockResolvedValueOnce({
        id: 'spend-1',
        budget_allocated: 1500,
        budget_rolling: true,
      })
      .mockResolvedValueOnce(null)
    mockInvalidateSpendPeriodCaches.mockResolvedValue(undefined)
  })

  it('updates a budget through an explicit audited edit and invalidates the affected client cache', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/[id].patch')).default

    const result = await handler({ params: { id: 'spend-1' } } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(String(mockQueryOne.mock.calls[0][0])).toContain('client_id::text')
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE media_spend'),
      [1500, 'spend-1', true],
    )
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO budget_audit_log'),
      ['spend-1', 1000, 1500, 'user-1', 'Manual monthly budget update'],
    )
    expect(mockInvalidateSpendPeriodCaches).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      period: '2026-06',
      platform: 'meta',
      clientId: 'client-1',
    })
    expect(result).toEqual({ updated: true, id: 'spend-1', budgetAllocated: 1500, rolling: true })
  })

  it('rejects negative budgets before any write', async () => {
    mockBody = { budgetAllocated: -1 }
    const handler = (await import('~~/server/api/agency/social/spend/[id].patch')).default

    await expect(handler({ params: { id: 'spend-1' } } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'budgetAllocated must be a non-negative number',
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
