import { describe, expect, it, vi } from 'vitest'
import { getCreativeAssets, type CreativeAssetsDeps } from '~~/server/utils/ai/tools/creativeAssets'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as ToolContext

describe('get_creative_assets', () => {
  it('returns linked ad/campaign assets and makes missing delivery provenance explicit', async () => {
    const deps: CreativeAssetsDeps = {
      fetch: vi.fn().mockResolvedValue([
        { assetId: 'a1', filename: 'EOFY-1200x1200.mp4', ratio: '1:1', deliveredAt: '2026-07-13T03:46:01Z', deliveredBy: 'Tina Yu', source: 'banner_studio', linkedAdIds: ['ad1'], linkedCampaignIds: ['c1'], clientName: 'Acme', campaignName: 'EOFY' },
        { assetId: 'a2', filename: null, ratio: null, deliveredAt: null, deliveredBy: null, source: 'ad_platform', linkedAdIds: ['ad2'], linkedCampaignIds: ['c1'], clientName: 'Acme', campaignName: 'EOFY' },
      ]),
    }
    const data = (await getCreativeAssets({ campaignId: 'c1' }, ctx, deps) as any).data
    expect(data.assets).toHaveLength(2)
    expect(data.assets[0]).toMatchObject({ filename: 'EOFY-1200x1200.mp4', deliveredBy: 'Tina Yu', linkedAdIds: ['ad1'] })
    expect(data.dataStatus).toBe('partial')
    expect(data.coverage).toEqual({ expected: 2, withData: 1 })
  })
})
