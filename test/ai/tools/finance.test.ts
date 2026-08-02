import { describe, it, expect, vi } from 'vitest'
import { describeFetchFailure, getFinanceSnapshot, type FinanceSnapshotDeps } from '~~/server/utils/ai/tools/finance'

describe('get_finance_snapshot', () => {
  it('returns a compact cash + receivables projection (top 5 + more count)', async () => {
    const deps: FinanceSnapshotDeps = {
      cashPosition: vi.fn().mockResolvedValue({ balance: 124000, runwayDays: 86, risk: 'healthy' }),
      outstanding: vi.fn().mockResolvedValue({
        total: 58000,
        top: Array.from({ length: 7 }, (_, i) => ({ number: `INV-${1042 + i}`, client: 'Acme', amount: 12000 - i, overdueDays: 9 })),
      }),
    }
    const res = await getFinanceSnapshot({}, { userId: 'u1', userRole: 'owner', event: {} as any }, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.cash.runwayDays).toBe(86)
    expect(data.receivables.total).toBe(58000)
    expect(data.receivables.top).toHaveLength(5)        // capped
    expect(data.receivables.more).toBe(2)               // 7 - 5
    expect(data.receivables.top[0].number).toBe('INV-1042')
  })

  it('keeps the source that worked and names the one that failed', async () => {
    // Regression: this used to return ok:false and discard the good receivables
    // data, leaving the model to report it simply had no finance information.
    const deps: FinanceSnapshotDeps = {
      cashPosition: vi.fn().mockRejectedValue(new Error('xero down')),
      outstanding: vi.fn().mockResolvedValue({ total: 4200, top: [] })
    }
    const res = await getFinanceSnapshot({}, { userId: 'u1', userRole: 'owner', event: {} as any }, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.receivables.total).toBe(4200)
    expect(data.cash).toBeUndefined()
    expect(data.unavailable).toEqual([{ source: 'cash_position', reason: 'xero down' }])
  })

  it('omits `unavailable` entirely when both sources load', async () => {
    const deps: FinanceSnapshotDeps = {
      cashPosition: vi.fn().mockResolvedValue({ balance: 1, creditCard: 0, net: 1, runwayDays: 5, risk: 'tight' }),
      outstanding: vi.fn().mockResolvedValue({ total: 0, top: [] })
    }
    const res = await getFinanceSnapshot({}, { userId: 'u1', userRole: 'owner', event: {} as any }, deps)
    expect((res as any).data.unavailable).toBeUndefined()
  })

  it('fails with both underlying reasons when every source is down', async () => {
    const deps: FinanceSnapshotDeps = {
      cashPosition: vi.fn().mockRejectedValue({ statusCode: 504, statusMessage: 'upstream timeout' }),
      outstanding: vi.fn().mockRejectedValue(new Error('xero down'))
    }
    const res = await getFinanceSnapshot({}, { userId: 'u1', userRole: 'owner', event: {} as any }, deps)
    expect(res.ok).toBe(false)
    // The real cause has to survive — a generic message is what hid the timeout.
    expect((res as any).error).toContain('504: upstream timeout')
    expect((res as any).error).toContain('xero down')
  })
})

describe('describeFetchFailure', () => {
  it('surfaces an HTTP status when the error carries one', () => {
    expect(describeFetchFailure({ response: { status: 429 }, message: 'Too Many Requests' }))
      .toBe('429: Too Many Requests')
    expect(describeFetchFailure({ statusCode: 400, data: { statusMessage: 'No organization selected' } }))
      .toBe('400: No organization selected')
  })

  it('falls back to the message, and never throws on odd input', () => {
    expect(describeFetchFailure(new Error('boom'))).toBe('boom')
    expect(describeFetchFailure(null)).toBe('unknown error')
    expect(describeFetchFailure('plain string')).toBe('plain string')
  })
})
