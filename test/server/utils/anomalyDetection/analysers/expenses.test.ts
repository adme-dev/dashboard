// test/server/utils/anomalyDetection/analysers/expenses.test.ts
import { describe, it, expect } from 'vitest'
import { expensesAnalyser } from '~~/server/utils/anomalyDetection/analysers/expenses'

const ctx = (expenses: any, pnl: any = null) => ({
  tenantId: 'tenant-A',
  data: {
    pnl, expenses, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('expensesAnalyser', () => {
  it('flags category-concentration when top category is >2x the second', async () => {
    const out = await expensesAnalyser(ctx({
      categories: [
        { name: 'Salaries', amount: 60_000 },
        { name: 'Marketing', amount: 20_000 },
        { name: 'Software', amount: 5_000 },
      ],
      range: { from: '2026-03-01', to: '2026-03-31' },
    }))
    const a = out.find(x => x.fingerprint === 'expenses:category-concentration')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })

  it('returns empty when expenses is null', async () => {
    expect(await expensesAnalyser(ctx(null))).toHaveLength(0)
  })

  it('flags vendor-concentration when top vendor exceeds 40% of vendor spend', async () => {
    const out = await expensesAnalyser(ctx({
      categories: [],
      vendors: [
        { name: 'Acme Corp', amount: 50_000 },
        { name: 'Beta Ltd', amount: 20_000 },
        { name: 'Gamma Inc', amount: 15_000 },
        { name: 'Delta Co', amount: 5_000 },
      ],
      range: { from: '2026-03-01', to: '2026-03-31' },
    }))
    const a = out.find(x => x.fingerprint === 'expenses:vendor-concentration')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
  })

  it('flags daily-spike for statistical outliers when >7 days of data provided', async () => {
    // Create daily data with one extreme spike
    const dailyTotals = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      amount: 1_000,
    }))
    // Make day 7 a 10x spike — well beyond 2 std deviations
    dailyTotals[6] = { date: '2026-03-07', amount: 50_000 }

    const out = await expensesAnalyser(ctx({
      categories: [],
      vendors: [],
      dailyTotals,
      range: { from: '2026-03-01', to: '2026-03-14' },
    }))
    const spikes = out.filter(x => x.fingerprint.startsWith('expenses:daily-spike-'))
    expect(spikes.length).toBeGreaterThan(0)
    expect(spikes[0].fingerprint).toBe('expenses:daily-spike-2026-03-07')
  })
})
