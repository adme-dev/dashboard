import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ reconcile: vi.fn(), readback: vi.fn(), enqueue: vi.fn() }))

vi.mock('~~/server/utils/googleMerchantCatalogRemote', () => ({
  runGoogleMerchantCatalogReconciliation: mocks.reconcile,
  runGoogleMerchantCatalogReadback: mocks.readback
}))

vi.mock('~~/server/utils/queue', () => ({
  enqueue: mocks.enqueue
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

const payload = {
  tenantId: 'tenant-1',
  clientId: '11111111-1111-4111-8111-111111111111',
  sourceId: '22222222-2222-4222-8222-222222222222'
}
const event = { context: { cloudflare: { env: {} } } } as NonNullable<Parameters<typeof processJob>[1]>

describe('Merchant catalog queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reconcile.mockResolvedValue({ runId: 'run-1' })
    mocks.readback.mockResolvedValue({ processedCount: 1, disapprovedCount: 0, pendingCount: 0 })
    mocks.enqueue.mockResolvedValue(true)
  })

  it('executes the exact tenant/client/source scope in a request-owned context', async () => {
    await expect(processJob({
      type: 'merchant.catalog.reconcile', payload, enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, event)).resolves.toBeUndefined()

    expect(mocks.reconcile).toHaveBeenCalledWith(event, payload)
    expect(mocks.enqueue).toHaveBeenCalledWith(
      event,
      'merchant.catalog.readback',
      { ...payload, readbackAttempt: 1 },
      expect.any(Function),
      { delaySeconds: 180 }
    )
  })

  it('rechecks pending processed products with a bounded delayed readback loop', async () => {
    mocks.readback.mockResolvedValue({ processedCount: 1, disapprovedCount: 0, pendingCount: 2 })
    await processJob({
      type: 'merchant.catalog.readback',
      payload: { ...payload, readbackAttempt: 2 },
      enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, event)

    expect(mocks.readback).toHaveBeenCalledWith(event, payload)
    expect(mocks.enqueue).toHaveBeenCalledWith(
      event,
      'merchant.catalog.readback',
      { ...payload, readbackAttempt: 3 },
      expect.any(Function),
      { delaySeconds: 180 }
    )
  })

  it('stops scheduling after the sixth readback while preserving pending evidence', async () => {
    mocks.readback.mockResolvedValue({ processedCount: 1, disapprovedCount: 0, pendingCount: 2 })
    await processJob({
      type: 'merchant.catalog.readback',
      payload: { ...payload, readbackAttempt: 6 },
      enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, event)

    expect(mocks.readback).toHaveBeenCalledWith(event, payload)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('rejects malformed or context-free reconciliation jobs', async () => {
    await expect(processJob({
      type: 'merchant.catalog.reconcile', payload, enqueuedAt: '2026-08-13T00:00:00.000Z'
    })).rejects.toThrow('request-owned Cloudflare context')
    await expect(processJob({
      type: 'merchant.catalog.reconcile',
      payload: { ...payload, sourceId: 'wrong' },
      enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, event)).rejects.toThrow('Invalid Merchant catalog reconciliation payload')
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
})
