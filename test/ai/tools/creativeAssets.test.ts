import { describe, expect, it, vi } from 'vitest'
import { fetchMondayCreativeAssets, getCreativeAssets, type CreativeAssetsDeps } from '~~/server/utils/ai/tools/creativeAssets'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as ToolContext

describe('get_creative_assets', () => {
  it('extracts migrated Monday file provenance without claiming campaign linkage', async () => {
    const load = vi.fn().mockResolvedValue([{
      monday_item_id: 'item-1', monday_item_name: 'August offer artwork', monday_asset_id: 'asset-1',
      monday_file_name: 'offer-1080x1080.mp4', source_created_at: '2026-08-10T01:02:03Z',
      monday_creator_id: 'creator-1', monday_creator_name: 'Tina Yu', migrated_at: '2026-08-11T04:00:00Z',
      client_name: 'Acme',
    }])

    const rows = await fetchMondayCreativeAssets({ clientName: 'Acme', limit: 20 }, load)

    expect(String(load.mock.calls[0][0])).toContain('jsonb_array_elements')
    expect(rows).toEqual([expect.objectContaining({
      assetId: 'monday:asset-1', filename: 'offer-1080x1080.mp4', ratio: '1:1',
      deliveredAt: '2026-08-10T01:02:03Z', deliveredBy: 'Tina Yu', source: 'monday',
      linkedCampaignIds: [], clientName: 'Acme', sourceItemName: 'August offer artwork',
      provenance: expect.objectContaining({ sourceSystem: 'monday', migratedAt: '2026-08-11T04:00:00Z' }),
    })])
  })

  it('returns linked ad/campaign assets and makes missing delivery provenance explicit', async () => {
    const deps: CreativeAssetsDeps = {
      fetch: vi.fn().mockResolvedValue([
        { assetId: 'a1', filename: 'EOFY-1200x1200.mp4', ratio: '1:1', deliveredAt: '2026-07-13T03:46:01Z', deliveredBy: 'Tina Yu', source: 'banner_studio', linkedAdIds: ['ad1'], linkedCampaignIds: ['c1'], clientName: 'Acme', campaignName: 'EOFY' },
        { assetId: 'a2', filename: null, ratio: null, deliveredAt: null, deliveredBy: null, source: 'ad_platform', linkedAdIds: ['ad2'], linkedCampaignIds: ['c1'], clientName: 'Acme', campaignName: 'EOFY' },
        { assetId: 'monday:a3', filename: 'offer.mp4', ratio: null, deliveredAt: '2026-08-10T01:02:03Z', deliveredBy: 'Tina Yu', source: 'monday', linkedAdIds: [], linkedCampaignIds: [], clientName: 'Acme', campaignName: null },
      ]),
    }
    const data = (await getCreativeAssets({ campaignId: 'c1' }, ctx, deps) as any).data
    expect(data.assets).toHaveLength(3)
    expect(data.assets[0]).toMatchObject({ filename: 'EOFY-1200x1200.mp4', deliveredBy: 'Tina Yu', linkedAdIds: ['ad1'] })
    expect(data.dataStatus).toBe('partial')
    expect(data.coverage).toEqual({ expected: 3, withData: 2 })
    expect(data.assets[2]).toMatchObject({ source: 'monday', deliveredBy: 'Tina Yu', linkedCampaignIds: [] })
  })
})
