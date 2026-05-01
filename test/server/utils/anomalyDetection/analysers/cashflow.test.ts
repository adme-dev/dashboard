// test/server/utils/anomalyDetection/analysers/cashflow.test.ts
import { describe, it, expect } from 'vitest'
import { cashflowAnalyser } from '~~/server/utils/anomalyDetection/analysers/cashflow'

const ctx = (bankMonitoring: any, cashForecast: any = null) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring, cashForecast,
    aging: null, budgetVariance: null, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('cashflowAnalyser', () => {
  it('flags bank-overdraft when an account has a negative balance', async () => {
    const out = await cashflowAnalyser(ctx({
      portfolio: { totalBalance: -1_500, totalOutflows: 0 },
      accounts: [
        { accountName: 'Operations Account', currentBalance: -1_500 },
      ],
    }))
    const a = out.find(x => x.fingerprint === 'cashflow:bank-overdraft-operations-account')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('returns empty when both bankMonitoring and cashForecast are null', async () => {
    expect(await cashflowAnalyser(ctx(null, null))).toHaveLength(0)
  })

  it('flags shortfall-projected when cashForecast has shortfallDates', async () => {
    const out = await cashflowAnalyser(ctx(null, {
      shortfallDates: ['2026-05-15', '2026-05-20'],
      minProjectedBalance: -5_000,
      currentCash: 2_000,
    }))
    const a = out.find(x => x.fingerprint === 'cashflow:shortfall-projected')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('flags high-burn-rate when runway is under 30 days', async () => {
    // 30 days of data, $60k outflows = $2k/day burn; $20k balance = 10 days runway
    const out = await cashflowAnalyser(ctx({
      portfolio: { totalBalance: 20_000, totalOutflows: 60_000, cashVelocity: 1 },
      accounts: [],
      period: { days: 30 },
    }))
    const a = out.find(x => x.fingerprint === 'cashflow:high-burn-rate')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })
})
