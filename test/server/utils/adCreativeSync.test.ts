import { describe, expect, it, vi } from 'vitest'
import { syncAllCampaignCreatives, type CreativeSyncDeps } from '~~/server/utils/adCreativeSync'

describe('syncAllCampaignCreatives (scheduled creative population)', () => {
  it('syncs every active connection with spend this period and isolates failures', async () => {
    const deps: CreativeSyncDeps = {
      listConnections: vi.fn().mockResolvedValue([
        { id: 'g1', platform: 'google_ads' },
        { id: 'g2', platform: 'google_ads' },
        { id: 'm1', platform: 'meta' }
      ]),
      syncOne: vi.fn(async (_platform, id) => {
        if (id === 'g2') throw new Error('login-customer-id required')
        return 4
      })
    }
    const summary = await syncAllCampaignCreatives(8, 2026, ['google_ads', 'meta'], deps)
    expect(deps.listConnections).toHaveBeenCalledWith(['google_ads', 'meta'], '2026-08')
    expect(summary).toMatchObject({ period: '2026-08', connections: 3, synced: 8 })
    expect(summary.failures).toEqual([{ connectionId: 'g2', platform: 'google_ads', reason: 'login-customer-id required' }])
    expect(deps.syncOne).toHaveBeenCalledTimes(3)
  })
})
