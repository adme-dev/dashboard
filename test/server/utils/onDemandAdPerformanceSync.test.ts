import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  getMetaCampaignAdPerformance: vi.fn(),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  execute: (...args: unknown[]) => mocks.execute(...args),
}))
vi.mock('~~/server/utils/metaClient', () => ({
  getMetaCampaignAdPerformance: (...args: unknown[]) => mocks.getMetaCampaignAdPerformance(...args),
}))

import { syncCampaignAdPerformance } from '~~/server/utils/onDemandSync'

describe('syncCampaignAdPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryOne
      .mockResolvedValueOnce({ id: 'spend-1', platform: 'meta', campaign_id: 'campaign-1', connection_id: 'connection-1' })
      .mockResolvedValueOnce({ id: 'connection-1', access_token: 'secret-token', account_id: 'act-1', metadata: {}, refresh_token: null, token_expires_at: null })
    mocks.getMetaCampaignAdPerformance.mockResolvedValue([{
      adId: 'ad-1', adName: 'EOFY tile', creativeId: 'creative-1', spend: 121.59,
      impressions: 48210, clicks: 1430, conversions: 9, reach: 13029, frequency: 3.7,
      firstServedDate: '2026-08-04', lastServedDate: '2026-08-19',
    }])
  })

  it('persists the provider ad and creative identity with delivery metrics', async () => {
    const result = await syncCampaignAdPerformance('spend-1', '2026-08-01', '2026-08-19')

    expect(result).toEqual({ syncedRows: 1, available: true })
    expect(String(mocks.execute.mock.calls[0]?.[0])).toContain('creative_id')
    expect(mocks.execute.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      'spend-1', 'ad-1', 'creative-1', 121.59, 48210, 1430, 3.7,
    ]))
  })
})
