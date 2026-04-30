// test/server/utils/anomalyDetection/analysers/profitability.test.ts
import { describe, it, expect } from 'vitest'
import { profitabilityAnalyser } from '~~/server/utils/anomalyDetection/analysers/profitability'

const ctx = (pnl: any) => ({
  tenantId: 'tenant-A',
  data: {
    pnl, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('profitabilityAnalyser', () => {
  it('flags net loss when netProfit is negative', async () => {
    const out = await profitabilityAnalyser(ctx({
      revenueTotal: 100_000, expensesTotal: 120_000, netProfit: -20_000,
      profitMargin: -0.2,
      periods: [{ label: 'Mar 2026', revenue: 100_000, netProfit: -20_000, profitMargin: -0.2 }],
      fromDate: '2026-03-01', toDate: '2026-03-31',
    }))
    const a = out.find(x => x.fingerprint === 'profitability:net-loss')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('flags low margin (≥0 net but <5%)', async () => {
    const out = await profitabilityAnalyser(ctx({
      revenueTotal: 100_000, expensesTotal: 97_000, netProfit: 3_000,
      profitMargin: 0.03, periods: [], fromDate: '2026-03-01', toDate: '2026-03-31',
    }))
    expect(out.find(a => a.fingerprint === 'profitability:low-margin')).toBeDefined()
  })

  it('returns empty when pnl is missing', async () => {
    expect(await profitabilityAnalyser(ctx(null))).toHaveLength(0)
  })

  it('flags margin compression when margin drops ≥8pp vs prior period', async () => {
    const out = await profitabilityAnalyser(ctx({
      revenueTotal: 200_000, netProfit: 20_000, profitMargin: 0.10,
      periods: [
        { label: 'Feb 2026', revenue: 200_000, netProfit: 40_000, profitMargin: 0.20 },
        { label: 'Mar 2026', revenue: 200_000, netProfit: 20_000, profitMargin: 0.10 },
      ],
      fromDate: '2026-02-01', toDate: '2026-03-31',
    }))
    const a = out.find(x => x.fingerprint === 'profitability:margin-compression')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })
})
