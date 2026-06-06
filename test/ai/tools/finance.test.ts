import { describe, it, expect, vi } from 'vitest'
import { getFinanceSnapshot, type FinanceDeps } from '~~/server/utils/ai/tools/finance'

describe('get_finance_snapshot', () => {
  it('returns a compact cash + receivables projection (top 5 + more count)', async () => {
    const deps: FinanceDeps = {
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

  it('returns a recoverable error (never throws) when a source fails', async () => {
    const deps: FinanceDeps = {
      cashPosition: vi.fn().mockRejectedValue(new Error('xero down')),
      outstanding: vi.fn().mockResolvedValue({ total: 0, top: [] }),
    }
    const res = await getFinanceSnapshot({}, { userId: 'u1', userRole: 'owner', event: {} as any }, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/finance/i)
  })
})
