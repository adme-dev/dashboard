import { describe, it, expect } from 'vitest'
import { adspendHealthAnalyser, buildGroups } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

const ctx = (mediaSpend: any[] | null, now = new Date('2026-04-20T00:00:00Z')) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null,
    mediaSpend, clientRevenue: null, invoiceLines: null, ga4Channel: null,
  },
  now,
})

// Helper: a campaign-month with `days` daily rows of `daily` spend each.
function campaignRows(opts: {
  msId: string; client?: string; platform?: string; budget: number; period?: string
  status?: string | null; syncedAt?: string | null; daily: number; days: number; conversions?: number
}) {
  const rows: any[] = []
  const period = opts.period ?? '2026-04'
  for (let d = 0; d < opts.days; d++) {
    rows.push({
      client_id: opts.msId, client_name: opts.client ?? 'Acme',
      platform: opts.platform ?? 'google_ads',
      spend_date: `${period}-${String(d + 1).padStart(2, '0')}`,
      spend: opts.daily,
      media_spend_id: opts.msId,
      budget_allocated: opts.budget, period,
      campaign_status: opts.status ?? 'ACTIVE',
      synced_at: opts.syncedAt ?? '2026-04-20T00:00:00Z',
      conversions: opts.conversions ?? 5,
    })
  }
  return rows
}

describe('adspendHealthAnalyser — scaffold', () => {
  it('returns empty for null/empty input', async () => {
    expect(await adspendHealthAnalyser(ctx(null))).toHaveLength(0)
    expect(await adspendHealthAnalyser(ctx([]))).toHaveLength(0)
  })

  it('buildGroups groups daily rows by media_spend_id and sums spend', () => {
    const rows = campaignRows({ msId: 'm1', budget: 3000, daily: 100, days: 10 })
    const groups = buildGroups(rows)
    expect(groups.size).toBe(1)
    const g = groups.get('m1')!
    expect(g.budget).toBe(3000)
    expect(g.days).toHaveLength(10)
    expect(g.days.reduce((s, d) => s + d.spend, 0)).toBe(1000)
  })
})

export { campaignRows, ctx }
