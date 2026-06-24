import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryRows = vi.fn()
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
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

vi.mock('~~/server/utils/socialSpendCache', () => ({
  invalidateSpendPeriodCaches: (...args: unknown[]) => mockInvalidateSpendPeriodCaches(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).readBody = () => mockBody
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('PATCH /api/agency/social/spend/bulk-budget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {
      spendIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      budgetAllocated: 3000,
      rolling: true,
      note: 'Monthly budget update',
    }
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryRows
      .mockResolvedValueOnce([
        { id: '11111111-1111-4111-8111-111111111111', budget_allocated: '2500', period: '2026-06', platform: 'meta' },
        { id: '22222222-2222-4222-8222-222222222222', budget_allocated: '2000', period: '2026-06', platform: 'google_ads' },
      ])
      .mockResolvedValueOnce([
        { id: '11111111-1111-4111-8111-111111111111', budget_allocated: 3000, budget_rolling: true },
        { id: '22222222-2222-4222-8222-222222222222', budget_allocated: 3000, budget_rolling: true },
      ])
    mockQueryOne.mockResolvedValue(null)
    mockInvalidateSpendPeriodCaches.mockResolvedValue(undefined)
  })

  it('records previous budgets from before the bulk update and invalidates each affected cache target', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/bulk-budget.patch')).default

    const result = await handler({} as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(String(mockQueryRows.mock.calls[1][0])).toContain('updated_at = NOW()')
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO budget_audit_log'),
      ['11111111-1111-4111-8111-111111111111', 2500, 3000, 'user-1', 'Monthly budget update'],
    )
    expect(mockQueryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO budget_audit_log'),
      ['22222222-2222-4222-8222-222222222222', 2000, 3000, 'user-1', 'Monthly budget update'],
    )
    expect(mockInvalidateSpendPeriodCaches).toHaveBeenCalledWith({}, { tenantId: 'tenant-1', period: '2026-06', platform: 'meta' })
    expect(mockInvalidateSpendPeriodCaches).toHaveBeenCalledWith({}, { tenantId: 'tenant-1', period: '2026-06', platform: 'google_ads' })
    expect(result).toEqual({ updated: true, count: 2, rollingSet: true, updatedRows: 2 })
  })

  it('rejects if any requested spend row is missing', async () => {
    mockQueryRows.mockReset()
    mockQueryRows.mockResolvedValueOnce([
      { id: '11111111-1111-4111-8111-111111111111', budget_allocated: '2500', period: '2026-06', platform: 'meta' },
    ])
    const handler = (await import('~~/server/api/agency/social/spend/bulk-budget.patch')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'One or more spend records were not found',
    })
  })
})
