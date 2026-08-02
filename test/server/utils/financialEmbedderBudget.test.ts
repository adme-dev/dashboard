import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({
  // null → shouldReembed() sees no prior hash and proceeds with the embed
  queryOne: vi.fn().mockResolvedValue(null),
  execute: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('~~/server/utils/aiVectorize', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  upsertVector: vi.fn().mockResolvedValue(undefined)
}))

import { embedAllFinancialSnapshots } from '~~/server/utils/financialEmbedder'

const event: any = { headers: {} }

/** preData for every type, so nothing reaches $fetch. */
function makePreData(clientCount = 0) {
  return {
    expenses: {
      categories: [{ name: 'Software', amount: 1000 }],
      vendors: [{ name: 'Acme', amount: 500 }],
      taxSummary: { totalNet: 1000, totalTax: 100, totalGross: 1100 },
      monthOverMonth: { change: 5 },
      fixedVsVariable: { fixed: { total: 600 }, variable: { total: 400 } },
      subscriptions: { items: [], total: 0 }
    },
    invoices: { summary: { outstandingTotal: 100, outstandingCount: 1 }, outstanding: [], overdue: [] },
    pnl: { revenueTotal: 5000, expensesTotal: 3000, netProfit: 2000 },
    cash: { portfolio: { totalBalance: 1000, riskLevel: 'low' }, accounts: [], alerts: [] },
    contacts: {
      contacts: Array.from({ length: clientCount }, (_, i) => ({
        contactID: `c-${i}`,
        name: `Client ${i}`,
        balances: { accountsReceivable: { outstanding: 1000 - i, overdue: 0 } }
      }))
    }
  }
}

/** Clock that advances by `stepMs` on every read. */
function steppingClock(stepMs: number) {
  let t = 0
  return () => {
    const v = t
    t += stepMs
    return v
  }
}

describe('embedAllFinancialSnapshots — request budget', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs every type and reports no remaining when the budget is ample', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', undefined, makePreData(0), {
      budgetMs: 60_000
    })
    expect(res.remaining).toBeUndefined()
    for (const t of ['expenses', 'invoices', 'pnl', 'cash']) {
      expect(res.details.some(d => d.startsWith(`${t}:`))).toBe(true)
    }
    expect(res.details.some(d => d.includes('deferred'))).toBe(false)
  })

  it('defers later types instead of running past the budget', async () => {
    // Clock jumps 10s per read, so the budget is blown after the first stage.
    const res = await embedAllFinancialSnapshots(event, '2026-08', undefined, makePreData(0), {
      budgetMs: 15_000,
      now: steppingClock(10_000)
    })
    // Only the first stage fits; everything after it is reported, not attempted.
    expect(res.remaining).toEqual(['invoices', 'pnl', 'cash', 'clients'])
    expect(res.details.filter(d => d.includes('deferred (request budget exhausted)'))).toHaveLength(4)
  })

  it('stops the client waves mid-way and flags clients as remaining', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], makePreData(20), {
      budgetMs: 25_000,
      now: steppingClock(10_000)
    })
    expect(res.remaining).toEqual(['clients'])
    // Exactly one wave of CLIENT_EMBED_CONCURRENCY (4) fits before the budget
    // check trips, leaving 16 untouched. Pins the wave size, not just "some".
    expect(res.processed).toBe(4)
    expect(res.details[0]).toContain('4 embedded')
    expect(res.details[0]).toContain('16 not reached (request budget exhausted)')
  })

  it('embeds every client when the budget allows, in bounded waves', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], makePreData(20), {
      budgetMs: 60_000
    })
    expect(res.remaining).toBeUndefined()
    expect(res.processed).toBe(20)
    expect(res.details[0]).toContain('20 embedded')
  })

  it('caps the client set at the top 20 by outstanding balance', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], makePreData(50), {
      budgetMs: 60_000
    })
    expect(res.processed).toBe(20)
    expect(res.details[0]).toContain('(20 total)')
  })

  it('still honours an explicit types filter', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['pnl'], makePreData(0), {
      budgetMs: 60_000
    })
    expect(res.details).toHaveLength(1)
    expect(res.details[0]).toMatch(/^pnl:/)
  })
})
