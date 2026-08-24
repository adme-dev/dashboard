import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runCampaignDetailRefreshJob: vi.fn()
}))

vi.mock('~~/server/utils/campaignDetailCache', () => ({
  runCampaignDetailRefreshJob: mocks.runCampaignDetailRefreshJob
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

const payload = {
  mediaSpendId: '11111111-1111-4111-8111-111111111111',
  dataset: 'breakdowns',
  leaseToken: '22222222-2222-4222-8222-222222222222',
  ttlMs: 900000
}
const requestEvent = {
  context: { cloudflare: { env: {} } }
} as NonNullable<Parameters<typeof processJob>[1]>

describe('campaign detail refresh queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runCampaignDetailRefreshJob.mockResolvedValue(undefined)
  })

  it('runs the campaign detail refresh with the queued payload', async () => {
    await expect(processJob({
      type: 'campaign.detail.refresh',
      payload,
      enqueuedAt: '2026-08-24T00:00:00.000Z'
    }, requestEvent)).resolves.toBeUndefined()

    expect(mocks.runCampaignDetailRefreshJob).toHaveBeenCalledWith(requestEvent, payload)
  })

  it('still runs the lease-gated refresh without a request-owned context (no CF-bound deps)', async () => {
    await expect(processJob({
      type: 'campaign.detail.refresh',
      payload,
      enqueuedAt: '2026-08-24T00:00:00.000Z'
    })).resolves.toBeUndefined()

    expect(mocks.runCampaignDetailRefreshJob).toHaveBeenCalledWith(undefined, payload)
  })
})
