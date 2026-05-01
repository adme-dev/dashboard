// test/server/utils/anomalyDetection/analysers/revenue.test.ts
import { describe, it, expect } from 'vitest'
import { revenueAnalyser } from '~~/server/utils/anomalyDetection/analysers/revenue'

const ctx = (pnl: any) => ({
  tenantId: 'tenant-A',
  data: {
    pnl, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('revenueAnalyser', () => {
  it('flags revenue-decline as warning when drop is 15-29%', async () => {
    const out = await revenueAnalyser(ctx({
      fromDate: '2026-02-01', toDate: '2026-03-31',
      periods: [
        { label: 'Feb 2026', revenue: 100_000 },
        { label: 'Mar 2026', revenue: 80_000 },
      ],
    }))
    const a = out.find(x => x.fingerprint === 'revenue:revenue-decline')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })

  it('returns empty when pnl is null', async () => {
    expect(await revenueAnalyser(ctx(null))).toHaveLength(0)
  })

  it('flags revenue-decline as critical when drop is ≥30%', async () => {
    const out = await revenueAnalyser(ctx({
      fromDate: '2026-02-01', toDate: '2026-03-31',
      periods: [
        { label: 'Feb 2026', revenue: 100_000 },
        { label: 'Mar 2026', revenue: 60_000 },
      ],
    }))
    const a = out.find(x => x.fingerprint === 'revenue:revenue-decline')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('does not flag when revenue decline is below 15%', async () => {
    const out = await revenueAnalyser(ctx({
      fromDate: '2026-02-01', toDate: '2026-03-31',
      periods: [
        { label: 'Feb 2026', revenue: 100_000 },
        { label: 'Mar 2026', revenue: 90_000 },
      ],
    }))
    expect(out).toHaveLength(0)
  })

  it('flags revenue:yoy-decline when current month is >15% below same month last year', async () => {
    const periods = []
    for (let m = 0; m < 13; m++) {
      periods.push({ label: `Period ${m}`, revenue: m === 12 ? 70_000 : 100_000 })
    }
    const out = await revenueAnalyser(ctx({
      fromDate: '2025-04-01', toDate: '2026-04-30',
      revenueTotal: 70_000, expensesTotal: 0, netProfit: 0, profitMargin: 0,
      periods,
    }))
    expect(out.find(a => a.fingerprint === 'revenue:yoy-decline')).toBeDefined()
  })

  it('escalates revenue:yoy-decline to critical at >30% drop', async () => {
    const periods: any[] = []
    for (let m = 0; m < 13; m++) {
      periods.push({ label: `Period ${m}`, revenue: m === 12 ? 50_000 : 100_000 })
    }
    const out = await revenueAnalyser(ctx({
      fromDate: '2025-04-01', toDate: '2026-04-30',
      revenueTotal: 50_000, expensesTotal: 0, netProfit: 0, profitMargin: 0,
      periods,
    }))
    const yoy = out.find(a => a.fingerprint === 'revenue:yoy-decline')
    expect(yoy?.severity).toBe('critical')
  })

  it('does NOT fire YoY when there are fewer than 13 periods', async () => {
    const periods = Array.from({ length: 6 }, (_, i) => ({ label: `Period ${i}`, revenue: 100_000 }))
    const out = await revenueAnalyser(ctx({
      fromDate: '2025-11-01', toDate: '2026-04-30',
      revenueTotal: 100_000, expensesTotal: 0, netProfit: 0, profitMargin: 0,
      periods,
    }))
    expect(out.find(a => a.fingerprint === 'revenue:yoy-decline')).toBeUndefined()
  })
})
