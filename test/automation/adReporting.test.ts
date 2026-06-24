// test/automation/adReporting.test.ts
import { describe, expect, it } from 'vitest'
import { aggregateAdKpis, pctDeltaNullable, buildAdReportModel } from '~~/server/utils/adReporting/model'
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

describe('pctDeltaNullable', () => {
  it('computes percent change and handles null/zero prior', () => {
    expect(pctDeltaNullable(120, 100)).toBeCloseTo(20, 5)
    expect(pctDeltaNullable(80, 100)).toBeCloseTo(-20, 5)
    expect(pctDeltaNullable(50, null)).toBeNull()
    expect(pctDeltaNullable(50, 0)).toBeNull()
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
    expect(m.deltas.spend).toBeCloseTo(pctDeltaNullable(1400, 700)!, 5)
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

import { isAdReportDue, processDueAdReports } from '~~/server/utils/adReporting/send'

describe('isAdReportDue', () => {
  const base = { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: ['a@b.com'], last_sent_at: null as string | null }
  it('due when never sent', () => {
    expect(isAdReportDue(base, new Date('2026-05-02T00:00:00Z'))).toBe(true)
  })
  it('not due when disabled', () => {
    expect(isAdReportDue({ ...base, enabled: false }, new Date())).toBe(false)
  })
  it('not due when sent recently (< ~28d)', () => {
    expect(isAdReportDue({ ...base, last_sent_at: '2026-05-01T00:00:00Z' }, new Date('2026-05-10T00:00:00Z'))).toBe(false)
  })
  it('due when last send is older than a month', () => {
    expect(isAdReportDue({ ...base, last_sent_at: '2026-04-01T00:00:00Z' }, new Date('2026-05-10T00:00:00Z'))).toBe(true)
  })
})

describe('processDueAdReports', () => {
  function fakes(scheduleRows: any[]) {
    const execCalls: any[][] = []
    const sent: any[] = []
    const db = {
      queryRows: async (_sql: string) => scheduleRows,
      execute: async (_sql: string, params: any[]) => { execCalls.push(params); return 1 },
    }
    const deps = {
      now: new Date('2026-05-05T00:00:00Z'),
      buildModel: async (_s: any) => ({ clientName: 'C', periodLabel: 'Apr 2026', kpis: {} as any, prior: null, deltas: {} as any, topCampaigns: [] }),
      renderPdf: async (_html: string) => Buffer.from('pdf'),
      uploadPdf: async (_key: string, _buf: Buffer) => 'https://r2/report.pdf',
      sendEmail: async (a: any) => { sent.push(a) },
    }
    return { db, deps, execCalls, sent }
  }

  it('is gated off by default (AD_REPORTS_ENABLED unset)', async () => {
    delete process.env.AD_REPORTS_ENABLED
    const { db, deps } = fakes([])
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.gated).toBe(true)
    expect(r.sent).toBe(0)
  })

  it('sends a due schedule and stamps last_sent_at', async () => {
    process.env.AD_REPORTS_ENABLED = 'true'
    const { db, deps, sent, execCalls } = fakes([
      { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: ['a@b.com'], last_sent_at: null },
    ])
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.sent).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].recipients).toEqual(['a@b.com'])
    expect(execCalls.length).toBe(1) // last_sent_at update
    delete process.env.AD_REPORTS_ENABLED
  })

  it('skips schedules with no recipients', async () => {
    process.env.AD_REPORTS_ENABLED = 'true'
    const { db, deps, sent } = fakes([
      { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: [], last_sent_at: null },
    ])
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(sent).toHaveLength(0)
    delete process.env.AD_REPORTS_ENABLED
  })

  it('records failure (last_error) when a send throws, without aborting the loop', async () => {
    process.env.AD_REPORTS_ENABLED = 'true'
    const { db, deps } = fakes([
      { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: ['a@b.com'], last_sent_at: null },
    ])
    deps.sendEmail = async () => { throw new Error('boom') }
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    delete process.env.AD_REPORTS_ENABLED
  })
})
