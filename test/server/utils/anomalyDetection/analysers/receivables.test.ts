// test/server/utils/anomalyDetection/analysers/receivables.test.ts
import { describe, it, expect } from 'vitest'
import { receivablesAnalyser } from '~~/server/utils/anomalyDetection/analysers/receivables'

const ctx = (aging: any) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging, budgetVariance: null, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('receivablesAnalyser', () => {
  it('flags overdue-spike when >40% of outstanding is critical overdue', async () => {
    const out = await receivablesAnalyser(ctx({
      totalOutstanding: 100_000,
      criticalAmount: 50_000,
      averageDaysPastDue: 30,
      agingSummary: [],
      topContacts: [],
    }))
    const a = out.find(x => x.fingerprint === 'receivables:overdue-spike')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('critical')
  })

  it('returns empty when aging is null', async () => {
    expect(await receivablesAnalyser(ctx(null))).toHaveLength(0)
  })

  it('flags aging-concentration when 90+ bucket exceeds 30% of outstanding', async () => {
    const out = await receivablesAnalyser(ctx({
      totalOutstanding: 100_000,
      criticalAmount: 10_000,
      averageDaysPastDue: 20,
      agingSummary: [
        { bucket: 'current', amount: 50_000 },
        { bucket: '30-60', amount: 15_000 },
        { bucket: '90+', amount: 35_000, percentage: 35 },
      ],
      topContacts: [],
    }))
    const a = out.find(x => x.fingerprint === 'receivables:aging-concentration')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })

  it('flags slow-payer-risk when average days past due exceeds 45', async () => {
    const out = await receivablesAnalyser(ctx({
      totalOutstanding: 50_000,
      criticalAmount: 5_000,
      averageDaysPastDue: 60,
      agingSummary: [],
      topContacts: [],
    }))
    const a = out.find(x => x.fingerprint === 'receivables:slow-payer-risk')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('info')
  })
})
