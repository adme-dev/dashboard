import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSecondarySpendSyncPlatform: vi.fn(),
  spendSyncKvKeys: vi.fn(),
  completeSpendSyncJob: vi.fn(),
  failSpendSyncJob: vi.fn()
}))

vi.mock('~~/server/utils/spendSyncKickoff', () => ({
  getSecondarySpendSyncPlatform: mocks.getSecondarySpendSyncPlatform,
  spendSyncKvKeys: mocks.spendSyncKvKeys
}))
vi.mock('~~/server/utils/spendSyncJobs', () => ({
  completeSpendSyncJob: mocks.completeSpendSyncJob,
  failSpendSyncJob: mocks.failSpendSyncJob
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

const payload = { platform: 'pinterest', month: 8, year: 2026, jobId: 'job-1' }

describe('secondary spend sync queue consumer', () => {
  const syncFn = vi.fn()
  const deleteKv = vi.fn().mockResolvedValue(undefined)
  const cacheEvent = {
    context: { cloudflare: { env: { CACHE: { delete: deleteKv } } } }
  } as NonNullable<Parameters<typeof processJob>[1]>

  beforeEach(() => {
    vi.clearAllMocks()
    syncFn.mockReset()
    deleteKv.mockClear().mockResolvedValue(undefined)
    mocks.getSecondarySpendSyncPlatform.mockReturnValue({ platform: 'pinterest', short: 'pinterest', fn: syncFn })
    mocks.spendSyncKvKeys.mockReturnValue(['spend:summary:2026-08:all', 'spend:pinterest:accounts:2026-08'])
  })

  it('runs the platform sync, busts the KV cache, and completes the job', async () => {
    syncFn.mockResolvedValue({ synced: 4, totalSpend: 100 })

    await expect(processJob({
      type: 'spend.sync.platform',
      payload,
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, cacheEvent)).resolves.toBeUndefined()

    expect(mocks.getSecondarySpendSyncPlatform).toHaveBeenCalledWith('pinterest')
    expect(syncFn).toHaveBeenCalledWith(8, 2026)
    expect(deleteKv).toHaveBeenCalledWith('spend:summary:2026-08:all')
    expect(deleteKv).toHaveBeenCalledWith('spend:pinterest:accounts:2026-08')
    expect(mocks.completeSpendSyncJob).toHaveBeenCalledWith('job-1', { synced: 4, totalSpend: 100 })
    expect(mocks.failSpendSyncJob).not.toHaveBeenCalled()
  })

  it('runs without a jobId (no job-row bookkeeping) and without a CACHE binding', async () => {
    syncFn.mockResolvedValue({ synced: 1, totalSpend: 10 })
    const noCacheEvent = { context: { cloudflare: { env: {} } } } as NonNullable<Parameters<typeof processJob>[1]>

    await processJob({
      type: 'spend.sync.platform',
      payload: { platform: 'pinterest', month: 8, year: 2026 },
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, noCacheEvent)

    expect(mocks.completeSpendSyncJob).not.toHaveBeenCalled()
  })

  it('marks the job failed and rethrows so the queue retries when the sync fails', async () => {
    const error = new Error('pinterest API timeout')
    syncFn.mockRejectedValue(error)

    await expect(processJob({
      type: 'spend.sync.platform',
      payload,
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, cacheEvent)).rejects.toThrow('pinterest API timeout')

    expect(mocks.failSpendSyncJob).toHaveBeenCalledWith('job-1', 'pinterest API timeout')
    expect(mocks.completeSpendSyncJob).not.toHaveBeenCalled()
  })

  it('throws on an unknown platform without touching job bookkeeping', async () => {
    mocks.getSecondarySpendSyncPlatform.mockReturnValue(undefined)

    await expect(processJob({
      type: 'spend.sync.platform',
      payload: { platform: 'bogus', month: 8, year: 2026, jobId: 'job-2' },
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, cacheEvent)).rejects.toThrow('Unknown secondary spend-sync platform: bogus')

    expect(syncFn).not.toHaveBeenCalled()
    expect(mocks.failSpendSyncJob).not.toHaveBeenCalled()
  })
})
