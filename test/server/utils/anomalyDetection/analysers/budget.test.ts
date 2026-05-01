// test/server/utils/anomalyDetection/analysers/budget.test.ts
import { describe, it, expect } from 'vitest'
import { budgetAnalyser } from '~~/server/utils/anomalyDetection/analysers/budget'

const ctx = (budgetVariance: any) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('budgetAnalyser', () => {
  it('flags overspend-critical when total variance exceeds 50%', async () => {
    const out = await budgetAnalyser(ctx({
      summary: {
        totalVariancePercent: 65,
        totalActual: 165_000,
        totalBudget: 100_000,
      },
      categoryAnalysis: [],
    }))
    const a = out.find(x => x.fingerprint === 'budget:overspend-critical')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('returns empty when budgetVariance is null', async () => {
    expect(await budgetAnalyser(ctx(null))).toHaveLength(0)
  })

  it('flags multiple-overruns when 3 or more categories are over budget', async () => {
    const out = await budgetAnalyser(ctx({
      summary: { totalVariancePercent: 10, totalBudget: 100_000 },
      categoryAnalysis: [
        { status: 'over', category: 'Salaries', variancePercent: 35, actual: 67_500, budgeted: 50_000 },
        { status: 'over', category: 'Travel', variancePercent: 40, actual: 14_000, budgeted: 10_000 },
        { status: 'over', category: 'Software', variancePercent: 50, actual: 15_000, budgeted: 10_000 },
        { status: 'under', category: 'Marketing', variancePercent: -10, actual: 9_000, budgeted: 10_000 },
      ],
    }))
    const a = out.find(x => x.fingerprint === 'budget:multiple-overruns')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
    // Each of the 3 over-budget categories should also be flagged
    expect(out.filter(x => x.fingerprint.startsWith('budget:cat-'))).toHaveLength(3)
  })

  it('flags projected-overspend when projectedMonthEnd is >15% above budget', async () => {
    const out = await budgetAnalyser(ctx({
      summary: {
        totalVariancePercent: 5,
        totalBudget: 100_000,
        totalActual: 55_000,
        projectedMonthEnd: 120_000,
      },
      categoryAnalysis: [],
    }))
    const a = out.find(x => x.fingerprint === 'budget:projected-overspend')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })
})
