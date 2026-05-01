import { describe, it, expect } from 'vitest'
import { adspendAnalyser } from '~~/server/utils/anomalyDetection/analysers/adspend'

const ctx = (mediaSpend: any[] | null) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null,
    mediaSpend, clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

const buildBaseline = (clientId: string, platform: string, dailyAmount: number, days: number) => {
  const rows: any[] = []
  for (let d = 0; d < days; d++) {
    const date = new Date(2026, 3, d + 1)  // Apr 1 .. Apr 30
    rows.push({
      client_id: clientId,
      client_name: 'Acme',
      platform,
      spend_date: date.toISOString().slice(0, 10),
      spend: dailyAmount,
    })
  }
  return rows
}

describe('adspendAnalyser', () => {
  it('flags spend > 2× 30-day average as warning', async () => {
    const rows = buildBaseline('c1', 'meta', 100, 30)
    rows.unshift({ client_id: 'c1', client_name: 'Acme', platform: 'meta',
                   spend_date: '2026-04-30', spend: 250 })  // 2.5× avg
    const out = await adspendAnalyser(ctx(rows))
    const a = out.find(x => x.fingerprint.startsWith('adspend:spike-c1-meta'))
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warning')
  })

  it('escalates to critical at >=5× average', async () => {
    const rows = buildBaseline('c1', 'meta', 100, 30)
    rows.unshift({ client_id: 'c1', client_name: 'Acme', platform: 'meta',
                   spend_date: '2026-04-30', spend: 600 })  // 6× avg
    const out = await adspendAnalyser(ctx(rows))
    expect(out[0].severity).toBe('critical')
  })

  it('does NOT fire when ratio is below 2×', async () => {
    const rows = buildBaseline('c1', 'meta', 100, 30)
    rows.unshift({ client_id: 'c1', client_name: 'Acme', platform: 'meta',
                   spend_date: '2026-04-30', spend: 150 })  // 1.5× avg
    const out = await adspendAnalyser(ctx(rows))
    expect(out).toHaveLength(0)
  })

  it('isolates clients/platforms (a spike on one does not implicate the other)', async () => {
    const rows = [
      ...buildBaseline('c1', 'meta', 100, 30),
      ...buildBaseline('c2', 'google_ads', 50, 30),
    ]
    rows.unshift({ client_id: 'c1', client_name: 'Acme', platform: 'meta',
                   spend_date: '2026-04-30', spend: 300 })
    const out = await adspendAnalyser(ctx(rows))
    expect(out).toHaveLength(1)
    expect(out[0].context?.client).toBe('Acme')
    expect(out[0].context?.vendor).toBe('meta')
  })

  it('returns empty when there are no rows', async () => {
    expect(await adspendAnalyser(ctx([]))).toHaveLength(0)
    expect(await adspendAnalyser(ctx(null))).toHaveLength(0)
  })
})
