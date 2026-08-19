import { describe, it, expect, vi } from 'vitest'
import { getCampaignBreakdown, getLeadAttributionSummary, type CampaignBreakdownDeps, type BreakdownCampaign } from '~~/server/utils/ai/tools/campaignBreakdown'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'media_buyer', conversationId: 'c1', event: {} as any } as ToolContext

const rows: BreakdownCampaign[] = [
  { campaignId: 'c1', campaignName: 'Acme Prospecting', clientName: 'Acme', platform: 'meta', spend: 100, roas: 2.0, cpc: 1.5, campaignStatus: 'ACTIVE', effectiveStatus: 'active', firstServedDate: '2026-08-01', lastServedDate: '2026-08-18', endDate: null, lastSyncedAt: '2026-08-18T08:00:00Z', impressions: 1000, clicks: 67, conversions: 4, leadCount: 3, costPerLead: 33.33, frequency: 1.4 },
  { campaignId: 'c2', campaignName: 'Acme Retargeting', clientName: 'Acme', platform: 'meta', spend: 400, roas: 5.0, cpc: 0.8, campaignStatus: 'PAUSED', effectiveStatus: 'paused', firstServedDate: '2026-08-02', lastServedDate: '2026-08-14', endDate: null, lastSyncedAt: '2026-08-18T08:00:00Z', impressions: 2000, clicks: 500, conversions: 20, leadCount: 10, costPerLead: 40, frequency: 3.2 },
  { campaignId: 'c3', campaignName: 'Globex Search', clientName: 'Globex', platform: 'google', spend: 250, roas: null, cpc: 3.2, campaignStatus: 'ENABLED', effectiveStatus: 'active', firstServedDate: '2026-08-03', lastServedDate: '2026-08-18', endDate: '2026-09-30', lastSyncedAt: '2026-08-18T08:30:00Z', impressions: 900, clicks: 78, conversions: 7, leadCount: 5, costPerLead: 50, frequency: null },
]

const deps = (over: Partial<CampaignBreakdownDeps> = {}): CampaignBreakdownDeps => ({
  breakdown: vi.fn().mockResolvedValue({ campaigns: rows, total: rows.length }),
  now: () => new Date('2026-08-19T12:00:00Z'),
  ...over,
})

const data = (r: any) => { expect(r.ok).toBe(true); return (r as any).data }

describe('getCampaignBreakdown', () => {
  it('counts only real submitted leads and preserves campaign/ad attribution coverage', async () => {
    const load = vi.fn().mockResolvedValue({ total_submissions: 63, campaign_attributed: 4, ad_attributed: 3 })
    const result = await getLeadAttributionSummary({
      platform: 'meta', clientName: 'South % Morang', startDate: '2026-08-01', endDate: '2026-08-19',
    }, load)

    expect(result).toEqual({ totalSubmissions: 63, campaignAttributed: 4, adAttributed: 3 })
    expect(String(load.mock.calls[0][0])).toContain('l.is_test = false')
    expect(String(load.mock.calls[0][0])).toContain('l.campaign_id IS NOT NULL')
    expect(load.mock.calls[0][1]).toEqual(['2026-08-01', '2026-08-19', 'meta', '%South \\% Morang%'])
  })

  it('returns campaigns sorted by spend desc (default) capped with a more count', async () => {
    const r = await getCampaignBreakdown({ sortBy: 'spend' }, ctx, deps())
    const d = data(r)
    expect(d.campaigns.map((c: any) => c.campaignName)).toEqual(['Acme Retargeting', 'Globex Search', 'Acme Prospecting'])
    expect(d.more).toBe(0)
    expect(d.total).toBe(3)
    expect(d.nextCursor).toBeNull()
    expect(d.dataStatus).toBe('populated')
    expect(d.lastSyncedAt).toBe('2026-08-18T08:30:00Z')
    expect(d.oldestSyncedAt).toBe('2026-08-18T08:00:00Z')
    expect(d.staleRowCount).toBe(0)
    expect(d.stalenessThresholdHours).toBe(48)
    expect(d.freshness).toBe('fresh')
  })

  it('returns delivery status, dates, leads, CPL and frequency without stripping them', async () => {
    const d = data(await getCampaignBreakdown({ sortBy: 'spend' }, ctx, deps({
      leadAttribution: vi.fn().mockResolvedValue({ totalSubmissions: 63, campaignAttributed: 0, adAttributed: 0 }),
    })))
    expect(d.campaigns[0]).toMatchObject({
      campaignStatus: 'PAUSED',
      effectiveStatus: 'paused',
      firstServedDate: '2026-08-02',
      lastServedDate: '2026-08-14',
      leadCount: 10,
      costPerLead: 40,
      frequency: 3.2,
      conversions: null,
    })
    expect(d.conversionMetric).toMatchObject({ dataStatus: 'unavailable', definition: 'suppressed_pending_historical_resync' })
    expect(d.leadAttribution).toEqual({
      totalSubmissions: 63,
      campaignAttributed: 0,
      adAttributed: 0,
      unattributed: 63,
      coveragePct: 0,
      definition: 'submitted_non_test_leads',
    })
  })

  it('supports cursor pagination across the complete campaign set', async () => {
    const many = Array.from({ length: 27 }, (_, i) => ({ ...rows[0]!, campaignId: `c${i}`, campaignName: `Campaign ${i}`, spend: 100 - i }))
    const d = deps({ breakdown: vi.fn().mockResolvedValue({ campaigns: many, total: many.length }) })
    const first = data(await getCampaignBreakdown({ sortBy: 'spend', limit: 20 }, ctx, d))
    expect(first.campaigns).toHaveLength(20)
    expect(first.total).toBe(27)
    expect(first.more).toBe(7)
    const second = data(await getCampaignBreakdown({ sortBy: 'spend', cursor: first.nextCursor, limit: 20 }, ctx, d))
    expect(second.campaigns).toHaveLength(7)
    expect(second.nextCursor).toBeNull()
  })

  it('filters by clientName (case-insensitive contains)', async () => {
    const r = await getCampaignBreakdown({ clientName: 'acme', sortBy: 'spend' }, ctx, deps())
    const d = data(r)
    expect(d.campaigns).toHaveLength(2)
    expect(d.campaigns.every((c: any) => c.clientName === 'Acme')).toBe(true)
  })

  it('filters by platform', async () => {
    const r = await getCampaignBreakdown({ platform: 'google', sortBy: 'spend' }, ctx, deps())
    expect(data(r).campaigns).toEqual([{ ...rows[2], conversions: null }])
  })

  it('sorts by roas desc with nulls last', async () => {
    const r = await getCampaignBreakdown({ sortBy: 'roas' }, ctx, deps())
    const d = data(r)
    expect(d.campaigns.map((c: any) => c.campaignName)).toEqual(['Acme Retargeting', 'Acme Prospecting', 'Globex Search'])
  })

  it('sorts by cpc ascending (lower CPC is better)', async () => {
    const r = await getCampaignBreakdown({ sortBy: 'cpc' }, ctx, deps())
    const d = data(r)
    expect(d.campaigns.map((c: any) => c.campaignName)).toEqual(['Acme Retargeting', 'Acme Prospecting', 'Globex Search'])
  })

  it('adds a window caveat when ranking by roas/cpc over a truncated set (finding #5)', async () => {
    const d = deps({ breakdown: vi.fn().mockResolvedValue({ campaigns: rows, total: 250 }) })
    const r = await getCampaignBreakdown({ sortBy: 'roas' }, ctx, d)
    expect((r as any).data.note).toMatch(/highest-spend campaigns \(of 250\)/)
  })

  it('does NOT add a caveat when sorting by spend or the window is complete', async () => {
    const bySpend = await getCampaignBreakdown({ sortBy: 'spend' }, ctx, deps({ breakdown: vi.fn().mockResolvedValue({ campaigns: rows, total: 250 }) }))
    expect((bySpend as any).data.note).toBeUndefined()
    const complete = await getCampaignBreakdown({ sortBy: 'roas' }, ctx, deps())
    expect((complete as any).data.note).toBeUndefined()
  })

  it('forwards the platform filter to the data source (server-side narrowing)', async () => {
    const d = deps()
    await getCampaignBreakdown({ platform: 'google', sortBy: 'spend' }, ctx, d)
    expect((d.breakdown as any).mock.calls[0][1]).toMatchObject({ platform: 'google' })
  })

  it('supports explicit date windows and previous-period comparisons', async () => {
    const current = [{ ...rows[0]!, spend: 300, leadCount: 6 }]
    const previous = [{ ...rows[0]!, spend: 200, leadCount: 4 }]
    const breakdown = vi.fn()
      .mockResolvedValueOnce({ campaigns: current, total: 1 })
      .mockResolvedValueOnce({ campaigns: previous, total: 1 })
    const d = data(await getCampaignBreakdown({
      sortBy: 'spend',
      startDate: '2026-08-01',
      endDate: '2026-08-18',
      comparePrevious: true,
    }, ctx, { breakdown }))
    expect(breakdown.mock.calls[0][1]).toMatchObject({ startDate: '2026-08-01', endDate: '2026-08-18' })
    expect(breakdown.mock.calls[1][1]).toMatchObject({ startDate: '2026-07-14', endDate: '2026-07-31' })
    expect(d.previousPeriod).toEqual({ start: '2026-07-14', end: '2026-07-31' })
    expect(d.comparisonStatus).toBe('available')
    expect(d.campaigns[0].comparisonStatus).toBe('available')
    expect(d.campaigns[0].comparison).toMatchObject({ spendDelta: 100, spendDeltaPct: 50, leadDelta: 2 })
  })

  it('reports no_baseline instead of fabricating a zero-spend previous period', async () => {
    const breakdown = vi.fn()
      .mockResolvedValueOnce({ campaigns: [{ ...rows[0]!, spend: 300 }], total: 1 })
      .mockResolvedValueOnce({ campaigns: [], total: 0 })
    const d = data(await getCampaignBreakdown({
      sortBy: 'spend', startDate: '2026-08-01', endDate: '2026-08-18', comparePrevious: true,
    }, ctx, { breakdown }))

    expect(d.comparisonStatus).toBe('no_baseline')
    expect(d.campaigns[0].comparisonStatus).toBe('no_baseline')
    expect(d.campaigns[0].comparison).toBeUndefined()
  })

  it('marks a new campaign as no_baseline when the prior window has other campaigns', async () => {
    const breakdown = vi.fn()
      .mockResolvedValueOnce({ campaigns: [{ ...rows[0]!, campaignId: 'new' }], total: 1 })
      .mockResolvedValueOnce({ campaigns: [{ ...rows[0]!, campaignId: 'old' }], total: 1 })
    const d = data(await getCampaignBreakdown({
      sortBy: 'spend', startDate: '2026-08-01', endDate: '2026-08-18', comparePrevious: true,
    }, ctx, { breakdown }))

    expect(d.comparisonStatus).toBe('available')
    expect(d.campaigns[0]).toMatchObject({ comparisonStatus: 'no_baseline' })
    expect(d.campaigns[0].comparison).toBeUndefined()
  })

  it('fails gracefully when the data source throws', async () => {
    const r = await getCampaignBreakdown({ sortBy: 'spend' }, ctx, deps({ breakdown: vi.fn().mockRejectedValue(new Error('down')) }))
    expect(r.ok).toBe(false)
  })
})
