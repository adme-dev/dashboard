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
import { upsertVector } from '~~/server/utils/aiVectorize'

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
    // NOTE: this must mirror what /api/xero/contacts actually returns — `id`,
    // and a FLATTENED balances object. The original fixture here used Xero's raw
    // nested shape, which the endpoint never emits; that masked a bug where the
    // embedder read `contactID` / `balances.accountsReceivable.outstanding` and
    // silently filtered out every contact.
    contacts: {
      contacts: Array.from({ length: clientCount }, (_, i) => ({
        id: `c-${i}`,
        name: `Client ${i}`,
        balances: { receivableOutstanding: 1000 - i, receivableOverdue: 0, payableOutstanding: 0 }
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

  it('embeds contacts in the shape /api/xero/contacts actually returns', async () => {
    // Regression: Client Profiles could never embed. The endpoint renames
    // contactID -> id and flattens balances.accountsReceivable.outstanding ->
    // balances.receivableOutstanding, but the embedder read the raw Xero shape,
    // so every contact was filtered out and topClients was always empty.
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], {
      contacts: {
        contacts: [
          { id: 'ct-1', name: 'Acme', balances: { receivableOutstanding: 5000, receivableOverdue: 200 } },
          { id: 'ct-2', name: 'Globex', balances: { payableOutstanding: 900 } }
        ]
      }
    }, { budgetMs: 60_000 })

    expect(res.processed).toBe(2)
    expect(res.details[0]).toContain('2 embedded')
    expect(res.details[0]).toContain('(2 total)')
  })

  it('still accepts the raw nested Xero contact shape', async () => {
    // preData may come from a caller that never went through the endpoint.
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], {
      contacts: {
        contacts: [
          { contactID: 'raw-1', name: 'Raw', balances: { accountsReceivable: { outstanding: 300, overdue: 0 } } }
        ]
      }
    }, { budgetMs: 60_000 })

    expect(res.processed).toBe(1)
  })

  it('excludes contacts with no outstanding balance or no id', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], {
      contacts: {
        contacts: [
          { id: 'ok', name: 'Has balance', balances: { receivableOutstanding: 10 } },
          { id: 'zero', name: 'Zero', balances: { receivableOutstanding: 0 } },
          { id: 'none', name: 'No balances' },
          { name: 'No id', balances: { receivableOutstanding: 999 } }
        ]
      }
    }, { budgetMs: 60_000 })

    expect(res.processed).toBe(1)
    expect(res.details[0]).toContain('(1 total)')
  })

  it('keeps the largest balances when more contacts are eligible than the limit', async () => {
    // 25 eligible contacts, ascending balances — only the top 20 should embed,
    // which pins the sort without depending on concurrent call ordering.
    const contacts = Array.from({ length: 25 }, (_, i) => ({
      id: `c-${i}`,
      name: `C${i}`,
      balances: { receivableOutstanding: i + 1 }
    }))
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['clients'], {
      contacts: { contacts }
    }, { budgetMs: 60_000 })

    expect(res.processed).toBe(20)
    const embeddedIds = vi.mocked(upsertVector).mock.calls.map(c => c[1])
    // The five smallest must have been dropped, the largest kept.
    for (const i of [0, 1, 2, 3, 4]) {
      expect(embeddedIds).not.toContain(`fin-client-c-${i}-2026-08`)
    }
    expect(embeddedIds).toContain('fin-client-c-24-2026-08')
  })

  it('still honours an explicit types filter', async () => {
    const res = await embedAllFinancialSnapshots(event, '2026-08', ['pnl'], makePreData(0), {
      budgetMs: 60_000
    })
    expect(res.details).toHaveLength(1)
    expect(res.details[0]).toMatch(/^pnl:/)
  })
})
