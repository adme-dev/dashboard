// test/automation/adReporting.test.ts
import { describe, expect, it } from 'vitest'
import { aggregateAdKpis, pctDelta, buildAdReportModel } from '~~/server/utils/adReporting/model'
import { buildAdReportHtml } from '~~/server/utils/adReporting/html'

const rows = [
  { platform: 'meta', campaign_name: 'A', budget_allocated: 1000, actual_spend: 800, impressions: 10000, clicks: 200, conversions: 20 },
  { platform: 'google_ads', campaign_name: 'B', budget_allocated: 500, actual_spend: 600, impressions: 5000, clicks: 50, conversions: 5 },
]

describe('aggregateAdKpis', () => {
  it('sums spend/budget/impressions/clicks/conversions and derives ctr/cpc/cpa/utilization', () => {
    const k = aggregateAdKpis(rows as any)
    expect(k.spend).toBe(1400)
    expect(k.budget).toBe(1500)
    expect(k.impressions).toBe(15000)
    expect(k.clicks).toBe(250)
    expect(k.conversions).toBe(25)
    expect(k.ctr).toBeCloseTo((250 / 15000) * 100, 5)
    expect(k.cpc).toBeCloseTo(1400 / 250, 5)
    expect(k.cpa).toBeCloseTo(1400 / 25, 5)
    expect(k.budgetUtilizationPct).toBeCloseTo((1400 / 1500) * 100, 5)
  })
  it('guards divide-by-zero (no clicks/conversions/impressions/budget → 0)', () => {
    const k = aggregateAdKpis([{ platform: 'meta', campaign_name: 'X', budget_allocated: 0, actual_spend: 0, impressions: 0, clicks: 0, conversions: 0 }] as any)
    expect(k.ctr).toBe(0)
    expect(k.cpc).toBe(0)
    expect(k.cpa).toBe(0)
    expect(k.budgetUtilizationPct).toBe(0)
  })
  it('coerces string/null numerics from the DB', () => {
    const k = aggregateAdKpis([{ platform: 'meta', campaign_name: 'X', budget_allocated: '100', actual_spend: '50', impressions: null, clicks: '10', conversions: null }] as any)
    expect(k.spend).toBe(50)
    expect(k.budget).toBe(100)
    expect(k.clicks).toBe(10)
    expect(k.conversions).toBe(0)
  })
})

describe('pctDelta', () => {
  it('computes percent change and handles null/zero prior', () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20, 5)
    expect(pctDelta(80, 100)).toBeCloseTo(-20, 5)
    expect(pctDelta(50, null)).toBeNull()
    expect(pctDelta(50, 0)).toBeNull()
  })
})

describe('buildAdReportModel', () => {
  it('assembles KPIs, MoM deltas, and top campaigns sorted by spend desc', () => {
    const m = buildAdReportModel({
      clientName: 'Knox GWM', periodLabel: 'May 2026',
      current: rows as any,
      prior: [{ platform: 'meta', campaign_name: 'A', budget_allocated: 1000, actual_spend: 700, impressions: 9000, clicks: 180, conversions: 18 }] as any,
    })
    expect(m.clientName).toBe('Knox GWM')
    expect(m.kpis.spend).toBe(1400)
    expect(m.deltas.spend).toBeCloseTo(pctDelta(1400, 700)!, 5)
    expect(m.topCampaigns[0].campaign).toBe('A') // 800 spend > 600
    expect(m.topCampaigns).toHaveLength(2)
  })
  it('handles no prior period (deltas null)', () => {
    const m = buildAdReportModel({ clientName: 'C', periodLabel: 'May 2026', current: rows as any })
    expect(m.deltas.spend).toBeNull()
    expect(m.prior).toBeNull()
  })
})

describe('buildAdReportHtml', () => {
  it('renders a full HTML doc containing the client, period, and key numbers', () => {
    const m = buildAdReportModel({ clientName: 'Knox GWM', periodLabel: 'May 2026', current: rows as any })
    const html = buildAdReportHtml(m)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Knox GWM')
    expect(html).toContain('May 2026')
    expect(html).toContain('1,400') // formatted spend
  })
})
