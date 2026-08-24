import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reapStaleGoogleAiMaxScanRuns: vi.fn(),
  runGoogleAiMaxScheduledScans: vi.fn(),
  captureGoogleAiMaxCacheInvalidator: vi.fn()
}))

vi.mock('~~/server/utils/googleAiMaxRepository', () => ({
  reapStaleGoogleAiMaxScanRuns: mocks.reapStaleGoogleAiMaxScanRuns
}))
vi.mock('~~/server/utils/googleAiMaxScheduler', () => ({
  runGoogleAiMaxScheduledScans: mocks.runGoogleAiMaxScheduledScans
}))
vi.mock('~~/server/utils/googleAiMaxCache', () => ({
  captureGoogleAiMaxCacheInvalidator: mocks.captureGoogleAiMaxCacheInvalidator
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

const payload = { observedAt: '2026-08-25T07:00:00.000Z' }
const requestEvent = {
  context: { cloudflare: { env: {} } }
} as NonNullable<Parameters<typeof processJob>[1]>

describe('google ai max readiness queue consumer', () => {
  const invalidateCache = vi.fn().mockResolvedValue(0)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reapStaleGoogleAiMaxScanRuns.mockResolvedValue(0)
    mocks.captureGoogleAiMaxCacheInvalidator.mockReturnValue(invalidateCache)
    invalidateCache.mockClear()
    mocks.runGoogleAiMaxScheduledScans.mockResolvedValue({
      tenantCount: 2,
      started: 1,
      skipped: 1,
      failed: 0,
      results: [
        { tenantId: 'tenant-a', status: 'completed', runId: 'run-1' },
        { tenantId: 'tenant-b', status: 'no_connections' }
      ]
    })
  })

  it('reaps stale runs, runs the scheduled scan, and invalidates cache only for tenants with a run', async () => {
    await expect(processJob({
      type: 'google.aimax.readiness',
      payload,
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, requestEvent)).resolves.toBeUndefined()

    expect(mocks.reapStaleGoogleAiMaxScanRuns).toHaveBeenCalledTimes(1)
    expect(mocks.runGoogleAiMaxScheduledScans).toHaveBeenCalledWith({ observedAt: payload.observedAt })
    expect(mocks.captureGoogleAiMaxCacheInvalidator).toHaveBeenCalledWith(requestEvent)
    expect(invalidateCache).toHaveBeenCalledTimes(1)
    expect(invalidateCache).toHaveBeenCalledWith('tenant-a')
  })

  it('defaults observedAt when the payload omits it', async () => {
    await processJob({
      type: 'google.aimax.readiness',
      payload: {},
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, requestEvent)

    expect(mocks.runGoogleAiMaxScheduledScans).toHaveBeenCalledWith({ observedAt: expect.any(String) })
  })

  it('reaps stale runs before scanning, so a retried job can re-claim a tenant left stuck by a killed worker', async () => {
    let reaped = false
    mocks.reapStaleGoogleAiMaxScanRuns.mockImplementation(async () => { reaped = true; return 1 })
    mocks.runGoogleAiMaxScheduledScans.mockImplementation(async () => {
      expect(reaped).toBe(true)
      return { tenantCount: 0, started: 0, skipped: 0, failed: 0, results: [] }
    })

    await processJob({
      type: 'google.aimax.readiness',
      payload,
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    }, requestEvent)
  })

  it('fails closed without a request-owned context', async () => {
    await expect(processJob({
      type: 'google.aimax.readiness',
      payload,
      enqueuedAt: '2026-08-25T07:00:00.000Z'
    })).rejects.toThrow('Google AI Max readiness scan requires a request-owned Cloudflare context')
    expect(mocks.runGoogleAiMaxScheduledScans).not.toHaveBeenCalled()
  })
})
