import { describe, expect, it, vi } from 'vitest'
import { campaignNameLikePattern, getAdCreativeText } from '../../../server/utils/ai/tools/adCreativeText'
import type { ToolContext } from '../../../server/utils/ai/toolContext'

const ctx = { userId: 'user-1', userRole: 'owner' } as ToolContext
const noSync = { findUnsynced: vi.fn().mockResolvedValue([]), syncCreatives: vi.fn() }

describe('get_ad_creative_text', () => {
  it('matches human campaign phrases across provider naming delimiters', () => {
    expect(campaignNameLikePattern('July Drive Away')).toBe('%July%Drive%Away%')
    expect(campaignNameLikePattern('100% Drive_Away')).toBe('%100\\%%Drive\\_Away%')
  })

  it('projects Meta headline and body into explicit creative-copy fields', async () => {
    const result = await getAdCreativeText({ platform: 'meta', campaignId: 'campaign-1' }, ctx, {
      ...noSync,
      load: vi.fn().mockResolvedValue([{
        ad_id: 'ad-1', ad_name: 'August offer', creative_id: 'creative-1',
        title: 'Drive away this August', body: 'Offer ends 31 August',
        campaign_id: 'campaign-1', campaign_name: 'Rolling retail', platform: 'meta',
        effective_status: null, last_served_date: '2026-08-20', synced_at: '2026-08-21T00:00:00Z'
      }])
    })
    expect((result as any).data.ads[0]).toMatchObject({
      headlines: ['Drive away this August'],
      primaryTexts: ['Offer ends 31 August'],
      descriptions: [],
      lastServedDate: '2026-08-20'
    })
  })

  it('projects Google descriptions separately from primary text', async () => {
    const result = await getAdCreativeText({ platform: 'google', campaignId: 'campaign-2' }, ctx, {
      ...noSync,
      load: vi.fn().mockResolvedValue([{
        ad_id: 'ad-2', ad_name: null, creative_id: 'ad-2', title: 'New vehicle offer', body: 'Terms apply',
        campaign_id: 'campaign-2', campaign_name: 'Search', platform: 'google_ads', effective_status: null,
        last_served_date: null, synced_at: '2026-08-21T00:00:00Z'
      }])
    })
    expect((result as any).data.ads[0]).toMatchObject({ primaryTexts: [], descriptions: ['Terms apply'] })
  })

  it('BF-4: read-through syncs campaigns with no stored creatives before answering, and reports what it did', async () => {
    const googleRow = {
      ad_id: 'ad-2', ad_name: null, creative_id: 'ad-2', title: 'July Drive Away', body: 'Ends 31 July',
      campaign_id: 'campaign-2', campaign_name: 'July Drive Away', platform: 'google_ads', effective_status: null,
      last_served_date: null, synced_at: '2026-08-22T00:00:00Z'
    }
    const load = vi.fn().mockResolvedValue([googleRow])
    const findUnsynced = vi.fn().mockResolvedValue(['ms-1'])
    const syncCreatives = vi.fn().mockResolvedValue({ syncedRows: 1, error: null })
    const result = await getAdCreativeText({ platform: 'google', campaignName: 'July Drive Away' }, ctx, { load, findUnsynced, syncCreatives })
    expect(findUnsynced).toHaveBeenCalledTimes(1)
    expect(syncCreatives).toHaveBeenCalledWith('ms-1')
    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.invocationCallOrder[0]).toBeGreaterThan(syncCreatives.mock.invocationCallOrder[0])
    const data = (result as any).data
    expect(data.ads).toHaveLength(1)
    expect(data.sync).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 })
  })

  it('BF-4: when the provider fetch fails the tool says so instead of claiming full coverage', async () => {
    const load = vi.fn().mockResolvedValue([])
    const findUnsynced = vi.fn().mockResolvedValue(['ms-1', 'ms-2'])
    const syncCreatives = vi.fn().mockResolvedValue({ syncedRows: 0, error: 'login-customer-id missing' })
    const result = await getAdCreativeText({ platform: 'google', campaignName: 'July Drive Away' }, ctx, { load, findUnsynced, syncCreatives })
    const data = (result as any).data
    expect(data.ads).toEqual([])
    expect(data.sync).toMatchObject({ attempted: 2, succeeded: 0, failed: 2 })
    expect(data.coverageNote).toMatch(/could not be fetched/i)
    expect(data.coverageNote).toMatch(/login-customer-id missing/)
  })

  it('does not sync when every matching campaign already has creatives', async () => {
    const findUnsynced = vi.fn().mockResolvedValue([])
    const syncCreatives = vi.fn()
    const result = await getAdCreativeText({ platform: 'meta', campaignId: 'campaign-1' }, ctx, { load: vi.fn().mockResolvedValue([]), findUnsynced, syncCreatives })
    expect(syncCreatives).not.toHaveBeenCalled()
    expect((result as any).data.sync).toMatchObject({ attempted: 0 })
  })
})
