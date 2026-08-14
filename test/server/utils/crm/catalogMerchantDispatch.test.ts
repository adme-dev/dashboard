import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOneFresh: vi.fn(),
  enqueue: vi.fn(),
  reconcile: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: mocks.queryOneFresh
}))

vi.mock('~~/server/utils/queue', () => ({
  enqueue: mocks.enqueue
}))

vi.mock('~~/server/utils/googleMerchantCatalogRemote', () => ({
  runGoogleMerchantCatalogReconciliation: mocks.reconcile
}))

const { enqueueMerchantCatalogReconciliationForSource } = await import(
  '../../../../server/utils/crm/catalogMerchantDispatch'
)

const clientId = '11111111-1111-4111-8111-111111111111'
const sourceId = '22222222-2222-4222-8222-222222222222'
const event = { context: { cloudflare: { env: {} } } } as never

describe('catalog Merchant publication dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enqueue.mockResolvedValue(true)
    mocks.reconcile.mockResolvedValue({ runId: 'run-1' })
  })

  it('queues the exact active tenant/client/source scope when auto-publish is enabled', async () => {
    mocks.queryOneFresh.mockResolvedValue({
      connection_config: {
        merchant: { auto_publish: true, tenant_id: 'tenant-1' }
      }
    })

    await expect(enqueueMerchantCatalogReconciliationForSource(event, { clientId, sourceId }))
      .resolves.toBe(true)

    expect(mocks.queryOneFresh).toHaveBeenCalledWith(
      expect.stringContaining(`status = 'active'`),
      [sourceId, clientId]
    )
    expect(mocks.enqueue).toHaveBeenCalledWith(
      event,
      'merchant.catalog.reconcile',
      { tenantId: 'tenant-1', clientId, sourceId },
      expect.any(Function)
    )
  })

  it.each([
    [null],
    [{ connection_config: {} }],
    [{ connection_config: { merchant: { auto_publish: false, tenant_id: 'tenant-1' } } }],
    [{ connection_config: { merchant: { auto_publish: true, tenant_id: '' } } }]
  ])('does not publish a source without complete active Merchant authority', async (source) => {
    mocks.queryOneFresh.mockResolvedValue(source)

    await expect(enqueueMerchantCatalogReconciliationForSource(event, { clientId, sourceId }))
      .resolves.toBe(false)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})
