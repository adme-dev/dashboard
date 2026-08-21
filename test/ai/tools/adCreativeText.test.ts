import { describe, expect, it, vi } from 'vitest'
import { getAdCreativeText } from '../../../server/utils/ai/tools/adCreativeText'
import type { ToolContext } from '../../../server/utils/ai/toolContext'

const ctx = { userId: 'user-1', userRole: 'owner' } as ToolContext

describe('get_ad_creative_text', () => {
  it('projects Meta headline and body into explicit creative-copy fields', async () => {
    const result = await getAdCreativeText({ platform: 'meta', campaignId: 'campaign-1' }, ctx, {
      load: vi.fn().mockResolvedValue([{
        ad_id: 'ad-1', ad_name: 'August offer', creative_id: 'creative-1',
        title: 'Drive away this August', body: 'Offer ends 31 August',
        campaign_id: 'campaign-1', campaign_name: 'Rolling retail', platform: 'meta',
        effective_status: null, last_served_date: '2026-08-20', synced_at: '2026-08-21T00:00:00Z',
      }])
    })
    expect((result as any).data.ads[0]).toMatchObject({
      headlines: ['Drive away this August'],
      primaryTexts: ['Offer ends 31 August'],
      descriptions: [],
      lastServedDate: '2026-08-20',
    })
  })

  it('projects Google descriptions separately from primary text', async () => {
    const result = await getAdCreativeText({ platform: 'google', campaignId: 'campaign-2' }, ctx, {
      load: vi.fn().mockResolvedValue([{
        ad_id: 'ad-2', ad_name: null, creative_id: 'ad-2', title: 'New vehicle offer', body: 'Terms apply',
        campaign_id: 'campaign-2', campaign_name: 'Search', platform: 'google_ads', effective_status: null,
        last_served_date: null, synced_at: '2026-08-21T00:00:00Z',
      }])
    })
    expect((result as any).data.ads[0]).toMatchObject({ primaryTexts: [], descriptions: ['Terms apply'] })
  })
})

