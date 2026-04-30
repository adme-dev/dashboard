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
})
