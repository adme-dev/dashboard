import { describe, expect, it, vi } from 'vitest'
import { fetchLiveMondayCreativeAssets, fetchMondayCreativeAssets, getCreativeAssets, isScreenshotAsset, type CreativeAssetsDeps } from '~~/server/utils/ai/tools/creativeAssets'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as ToolContext

describe('get_creative_assets', () => {
  it('extracts migrated Monday file provenance without claiming campaign linkage', async () => {
    const load = vi.fn().mockResolvedValue([{
      monday_item_id: 'item-1', monday_item_name: 'August offer artwork', monday_asset_id: 'asset-1',
      monday_file_name: 'offer-1080x1080.mp4', source_created_at: '2026-08-10T01:02:03Z',
      monday_creator_id: 'creator-1', monday_creator_name: 'Tina Yu', migrated_at: '2026-08-11T04:00:00Z',
      project_client_id: 'client-1', project_client_name: 'Acme', client_ids: ['client-1'], client_names: ['Acme'],
      asset_url: 'https://files.example/offer.mp4',
    }])

    const rows = await fetchMondayCreativeAssets({ clientName: 'Acme', limit: 20 }, load)

    expect(String(load.mock.calls[0][0])).toContain('jsonb_array_elements')
    expect(String(load.mock.calls[0][0])).toContain("source_column->>'text'")
    expect(String(load.mock.calls[0][0])).toContain('monday_sync_file_mappings')
    expect(rows).toEqual([expect.objectContaining({
      assetId: 'monday:asset-1', filename: 'offer-1080x1080.mp4', ratio: '1:1',
      deliveredAt: '2026-08-10T01:02:03Z', deliveredBy: 'Tina Yu', source: 'monday',
      linkedCampaignIds: [], clientName: 'Acme', clientIds: ['client-1'], clientNames: ['Acme'],
      assetUrl: 'https://files.example/offer.mp4', sourceItemName: 'August offer artwork',
      provenance: expect.objectContaining({ sourceSystem: 'monday', migratedAt: '2026-08-11T04:00:00Z' }),
    })])
  })

  it('loads current Monday assets from governed mapped items and filters screenshots', async () => {
    const loadCandidates = vi.fn().mockResolvedValue([{
      monday_item_id: '12643960962', monday_item_name: 'Mornington Nissan August Service',
      migrated_at: '2026-08-18T10:00:00Z', project_client_id: 'client-1',
      project_client_name: 'Mornington Nissan', client_ids: ['client-1'], client_names: ['Mornington Nissan'],
    }])
    const rows = await fetchLiveMondayCreativeAssets({ clientName: 'Mornington Nissan' }, {
      loadCandidates,
      resolveConnection: vi.fn().mockResolvedValue({ accessToken: 'secret' }),
      loadItemAssets: vi.fn().mockResolvedValue([{
        itemId: '12643960962', itemName: 'Mornington Nissan August Service', assets: [
          { id: 'asset-1', name: 'service-1080x1080.mp4', url: 'https://monday.example/a1', public_url: 'https://public.example/a1', file_size: 12, file_extension: 'mp4', created_at: '2026-08-18T09:00:00Z', uploaded_by: { id: '42', name: 'Tina Yu' } },
          { id: 'asset-2', name: 'Screenshot 2026-08-18.png', url: 'https://monday.example/a2', file_size: 12, file_extension: 'png', created_at: '2026-08-18T09:01:00Z', uploaded_by: { id: '42', name: 'Tina Yu' } },
        ],
      }]),
    } as any)

    expect(rows).toEqual([expect.objectContaining({
      assetId: 'monday:asset-1', assetUrl: 'https://public.example/a1', clientIds: ['client-1'],
      clientNames: ['Mornington Nissan'], linkedCampaignIds: [], deliveredAt: '2026-08-18T09:00:00Z',
    })])
    expect(loadCandidates.mock.calls[0][1]).toEqual(['%Mornington Nissan%', 'Mornington Nissan'])
    expect(String(loadCandidates.mock.calls[0][0])).toContain('matched_client')
  })

  it('normalises screenshot-like filenames without hiding real designed images', () => {
    expect(isScreenshotAsset('Screenshot 2026-08-18.png')).toBe(true)
    expect(isScreenshotAsset('Screen Shot 2026-08-18 at 9.00.png')).toBe(true)
    expect(isScreenshotAsset('image (2).png')).toBe(true)
    expect(isScreenshotAsset('Mornington-service-1080x1080.png')).toBe(false)
  })

  it('returns linked ad/campaign assets and makes missing delivery provenance explicit', async () => {
    const deps: CreativeAssetsDeps = {
      fetch: vi.fn().mockResolvedValue([
        { assetId: 'a1', filename: 'EOFY-1200x1200.mp4', ratio: '1:1', deliveredAt: '2026-07-13T03:46:01Z', deliveredBy: 'Tina Yu', source: 'banner_studio', linkedAdIds: ['ad1'], linkedCampaignIds: ['c1'], clientName: 'Acme', clientIds: ['client-1'], clientNames: ['Acme'], campaignName: 'EOFY' },
        { assetId: 'a2', filename: null, ratio: null, deliveredAt: null, deliveredBy: null, source: 'ad_platform', linkedAdIds: ['ad2'], linkedCampaignIds: ['c1'], clientName: 'Acme', clientIds: ['client-1'], clientNames: ['Acme'], campaignName: 'EOFY' },
        { assetId: 'monday:a3', filename: 'offer.mp4', ratio: null, deliveredAt: '2026-08-10T01:02:03Z', deliveredBy: 'Tina Yu', source: 'monday', linkedAdIds: [], linkedCampaignIds: [], clientName: 'Acme', clientIds: ['client-1'], clientNames: ['Acme'], campaignName: null },
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
