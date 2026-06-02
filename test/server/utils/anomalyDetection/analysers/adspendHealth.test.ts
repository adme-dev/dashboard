import { describe, it, expect } from 'vitest'
import {
  adspendHealthAnalyser,
  buildGroups,
  detectUnderspend,
  detectStopped,
  detectPausedWithBudget,
  detectOverspend,
  detectStaleSync,
  detectZeroConversion,
} from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

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

describe('detectUnderspend', () => {
  const now = new Date('2026-04-20T00:00:00Z') // day 20 of 30 → expected = budget × 0.667

  const group = (budget: number, dailySpend: number) => {
    const days = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: dailySpend, conversions: 1,
    }))
    return {
      mediaSpendId: 'm1', clientId: 'c1', clientName: 'Mornington Nissan',
      platform: 'google_ads', period: '2026-04', budget,
      campaignStatus: 'ACTIVE', syncedAt: '2026-04-20T00:00:00Z', days,
    }
  }

  it('flags warning when MTD < 50% of expected pace', () => {
    const a = detectUnderspend(group(3000, 40), now)
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:underspend-m1-2026-04')
  })

  it('escalates to critical when MTD < 25% of expected pace', () => {
    const a = detectUnderspend(group(3000, 20), now)
    expect(a!.severity).toBe('critical')
  })

  it('does not fire when on pace', () => {
    expect(detectUnderspend(group(3000, 100), now)).toBeNull()
  })

  it('does not fire before day 7 or with no budget', () => {
    expect(detectUnderspend(group(3000, 0), new Date('2026-04-05T00:00:00Z'))).toBeNull()
    expect(detectUnderspend(group(0, 0), now)).toBeNull()
  })
})

describe('detectStopped', () => {
  const now = new Date('2026-04-20T00:00:00Z')
  const mk = (baselineDaily: number, last3Daily: number) => {
    const days: any[] = []
    for (let i = 1; i <= 14; i++) days.push({ date: `2026-04-${String(i).padStart(2, '0')}`, spend: baselineDaily, conversions: 1 })
    for (let i = 15; i <= 17; i++) { days[i - 1] = undefined as any }
    const built = days.filter(Boolean)
    for (let i = 18; i <= 20; i++) built.push({ date: `2026-04-${i}`, spend: last3Daily, conversions: 0 })
    return {
      mediaSpendId: 'm0', clientId: 'c1', clientName: 'Acme', platform: 'meta',
      period: '2026-04', budget: 0, campaignStatus: null, syncedAt: '2026-04-20T00:00:00Z', days: built,
    }
  }

  it('fires critical when a steady campaign goes dark (budget unset)', () => {
    const a = detectStopped(mk(50, 0), now)
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('critical')
    expect(a!.fingerprint).toBe('adspend:stopped-m0-2026-04')
  })

  it('does not fire when still spending near baseline', () => {
    expect(detectStopped(mk(50, 45), now)).toBeNull()
  })

  it('does not fire when a budget is set (underspend handles that)', () => {
    const g = mk(50, 0); g.budget = 3000
    expect(detectStopped(g, now)).toBeNull()
  })
})

describe('detectPausedWithBudget', () => {
  const now = new Date('2026-04-20T00:00:00Z')
  const base = (status: string | null, daily: number) => ({
    mediaSpendId: 'mp', clientId: 'c1', clientName: 'McRae LDV', platform: 'google_ads',
    period: '2026-04', budget: 1500, campaignStatus: status, syncedAt: '2026-04-20T00:00:00Z',
    days: Array.from({ length: 20 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: daily, conversions: 1 })),
  })

  it('fires when paused/removed with budget allocated', () => {
    const a = detectPausedWithBudget(base('PAUSED', 50), now)
    expect(a).not.toBeNull()
    expect(a!.fingerprint).toBe('adspend:paused-mp-2026-04')
  })

  it('escalates to critical when also underspending', () => {
    const a = detectPausedWithBudget(base('REMOVED', 5), now)
    expect(a!.severity).toBe('critical')
  })

  it('does not fire for active campaigns or zero budget', () => {
    expect(detectPausedWithBudget(base('ACTIVE', 50), now)).toBeNull()
    const z = base('PAUSED', 50); z.budget = 0
    expect(detectPausedWithBudget(z, now)).toBeNull()
  })

  it("fires on Meta compound effective_status (CAMPAIGN_PAUSED / ADSET_PAUSED / ARCHIVED)", () => {
    // Meta writes effective_status to campaign_status — compound values must match.
    expect(detectPausedWithBudget(base('CAMPAIGN_PAUSED', 50), now)).not.toBeNull()
    expect(detectPausedWithBudget(base('ADSET_PAUSED', 50), now)).not.toBeNull()
    expect(detectPausedWithBudget(base('ARCHIVED', 50), now)).not.toBeNull()
  })

  it('does not false-positive on other Meta effective_status values', () => {
    for (const s of ['WITH_ISSUES', 'IN_PROCESS', 'PENDING_REVIEW', 'DISAPPROVED']) {
      expect(detectPausedWithBudget(base(s, 50), now)).toBeNull()
    }
  })
})

describe('detectOverspend', () => {
  const now = new Date('2026-04-20T00:00:00Z') // day 20/30
  const g = (budget: number, daily: number) => ({
    mediaSpendId: 'mo', clientId: 'c1', clientName: 'McRae Nissan', platform: 'google_ads',
    period: '2026-04', budget, campaignStatus: 'ACTIVE', syncedAt: '2026-04-20T00:00:00Z',
    days: Array.from({ length: 20 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: daily, conversions: 1 })),
  })

  it('warns when projected > 115% of budget', () => {
    const a = detectOverspend(g(1500, 60), now)
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:overspend-mo-2026-04')
  })

  it('escalates to critical when projected > 130% of budget', () => {
    expect(detectOverspend(g(1500, 80), now)!.severity).toBe('critical')
  })

  it('does not fire when on/under pace', () => {
    expect(detectOverspend(g(1500, 50), now)).toBeNull()
  })
})

describe('detectStaleSync', () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const g = (syncedAt: string | null) => ({
    mediaSpendId: 'ms', clientId: 'c1', clientName: 'Acme', platform: 'meta',
    period: '2026-04', budget: 1000, campaignStatus: 'ACTIVE', syncedAt,
    days: [{ date: '2026-04-18', spend: 30, conversions: 1 }],
  })

  it('warns at >48h stale', () => {
    const a = detectStaleSync(g('2026-04-18T00:00:00Z'), now)
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:stale-ms-2026-04')
  })

  it('critical at >72h or never-synced', () => {
    expect(detectStaleSync(g('2026-04-16T00:00:00Z'), now)!.severity).toBe('critical')
    expect(detectStaleSync(g(null), now)!.severity).toBe('critical')
  })

  it('does not fire when fresh', () => {
    expect(detectStaleSync(g('2026-04-20T00:00:00Z'), now)).toBeNull()
  })
})

describe('detectZeroConversion', () => {
  const now = new Date('2026-04-20T00:00:00Z') // day 20 (≥10)
  const g = (daily: number, conv: number) => ({
    mediaSpendId: 'mz', clientId: 'c1', clientName: 'Acme', platform: 'meta',
    period: '2026-04', budget: 2000, campaignStatus: 'ACTIVE', syncedAt: '2026-04-20T00:00:00Z',
    days: Array.from({ length: 20 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: daily, conversions: conv })),
  })

  it('warns when spending > $500 with zero conversions', () => {
    const a = detectZeroConversion(g(40, 0), now)
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:zeroconv-mz-2026-04')
  })

  it('does not fire with conversions or low spend', () => {
    expect(detectZeroConversion(g(40, 2), now)).toBeNull()
    expect(detectZeroConversion(g(10, 0), now)).toBeNull()
  })

  it('does not fire before day 10', () => {
    expect(detectZeroConversion(g(40, 0), new Date('2026-04-08T00:00:00Z'))).toBeNull()
  })
})

describe('adspendHealthAnalyser — integration', () => {
  it('does not emit both underspend and stopped for the same campaign', async () => {
    const rows = campaignRows({ msId: 'm1', budget: 3000, daily: 5, days: 20 })
    const out = await adspendHealthAnalyser(ctx(rows))
    const fps = out.map(a => a.fingerprint)
    expect(fps).toContain('adspend:underspend-m1-2026-04')
    expect(fps).not.toContain('adspend:stopped-m1-2026-04')
  })

  it('emits paused + underspend together for a paused, underspending campaign', async () => {
    const rows = campaignRows({ msId: 'm2', budget: 3000, daily: 5, days: 20, status: 'PAUSED' })
    const out = await adspendHealthAnalyser(ctx(rows))
    const fps = out.map(a => a.fingerprint)
    expect(fps).toContain('adspend:paused-m2-2026-04')
    expect(fps).toContain('adspend:underspend-m2-2026-04')
  })
})

export { campaignRows, ctx }
