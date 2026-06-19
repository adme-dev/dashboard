import { describe, it, expect, vi } from 'vitest'
import { getCampaignBreakdown, type CampaignBreakdownDeps, type BreakdownCampaign } from '~~/server/utils/ai/tools/campaignBreakdown'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'media_buyer', conversationId: 'c1', event: {} as any } as ToolContext

const rows: BreakdownCampaign[] = [
  { campaignName: 'Acme Prospecting', clientName: 'Acme', platform: 'meta', spend: 100, roas: 2.0, cpc: 1.5 },
  { campaignName: 'Acme Retargeting', clientName: 'Acme', platform: 'meta', spend: 400, roas: 5.0, cpc: 0.8 },
  { campaignName: 'Globex Search', clientName: 'Globex', platform: 'google', spend: 250, roas: null, cpc: 3.2 },
]

const deps = (over: Partial<CampaignBreakdownDeps> = {}): CampaignBreakdownDeps => ({
  breakdown: vi.fn().mockResolvedValue(rows),
  ...over,
})

const data = (r: any) => { expect(r.ok).toBe(true); return (r as any).data }

describe('getCampaignBreakdown', () => {
  it('returns campaigns sorted by spend desc (default) capped with a more count', async () => {
    const r = await getCampaignBreakdown({ sortBy: 'spend' }, ctx, deps())
    const d = data(r)
    expect(d.campaigns.map((c: any) => c.campaignName)).toEqual(['Acme Retargeting', 'Globex Search', 'Acme Prospecting'])
    expect(d.more).toBe(0)
  })

  it('filters by clientName (case-insensitive contains)', async () => {
    const r = await getCampaignBreakdown({ clientName: 'acme', sortBy: 'spend' }, ctx, deps())
    const d = data(r)
    expect(d.campaigns).toHaveLength(2)
    expect(d.campaigns.every((c: any) => c.clientName === 'Acme')).toBe(true)
  })

  it('filters by platform', async () => {
    const r = await getCampaignBreakdown({ platform: 'google', sortBy: 'spend' }, ctx, deps())
    expect(data(r).campaigns).toEqual([rows[2]])
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

  it('fails gracefully when the data source throws', async () => {
    const r = await getCampaignBreakdown({ sortBy: 'spend' }, ctx, deps({ breakdown: vi.fn().mockRejectedValue(new Error('down')) }))
    expect(r.ok).toBe(false)
  })
})
