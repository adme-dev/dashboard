import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  syncAllCampaignCreatives: vi.fn()
}))

vi.mock('~~/server/utils/adCreativeSync', () => ({
  syncAllCampaignCreatives: mocks.syncAllCampaignCreatives
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

describe('creatives sync queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.syncAllCampaignCreatives.mockResolvedValue({
      period: '2026-08',
      connections: 5,
      synced: 3,
      failures: []
    })
  })

  it('runs the creative sync with the queued month/year/platforms', async () => {
    const payload = { month: 8, year: 2026, platforms: ['google_ads', 'meta'] }

    await expect(processJob({
      type: 'creatives.sync',
      payload,
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    })).resolves.toBeUndefined()

    expect(mocks.syncAllCampaignCreatives).toHaveBeenCalledWith(8, 2026, ['google_ads', 'meta'])
  })

  it('defaults to both platforms when the payload omits them', async () => {
    await processJob({
      type: 'creatives.sync',
      payload: { month: 8, year: 2026 },
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    })

    expect(mocks.syncAllCampaignCreatives).toHaveBeenCalledWith(8, 2026, ['google_ads', 'meta'])
  })

  it('logs attempted/written counts from the sync summary', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await processJob({
      type: 'creatives.sync',
      payload: { month: 8, year: 2026, platforms: ['meta'] },
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    })

    expect(logSpy).toHaveBeenCalledWith('[creatives.sync] attempted=5 written=3')
    logSpy.mockRestore()
  })
})
