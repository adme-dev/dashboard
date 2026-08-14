import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  synchronizeCatalogSource: vi.fn(),
  dispatchMerchant: vi.fn()
}))

vi.mock('~~/server/utils/crm/catalogSourceService', () => ({
  synchronizeCatalogSource: mocks.synchronizeCatalogSource
}))

vi.mock('~~/server/utils/crm/catalogMerchantDispatch', () => ({
  enqueueMerchantCatalogReconciliationForSource: mocks.dispatchMerchant
}))

const { processJob } = await import('../../../server/utils/queueConsumer')

const payload = {
  clientId: '11111111-1111-4111-8111-111111111111',
  sourceId: '22222222-2222-4222-8222-222222222222',
  actorEmail: 'advertising@adme.net.au'
}
const requestEvent = {
  context: { cloudflare: { env: {} } }
} as NonNullable<Parameters<typeof processJob>[1]>

describe('catalog sync queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.synchronizeCatalogSource.mockResolvedValue({ fetched: 36, upserted: 36, removed: 149 })
    mocks.dispatchMerchant.mockResolvedValue(true)
  })

  it('queues governed Merchant publication after a successful opted-in source sync', async () => {
    await processJob({
      type: 'catalog.sync', payload, enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, requestEvent)

    expect(mocks.dispatchMerchant).toHaveBeenCalledWith(
      requestEvent,
      { clientId: payload.clientId, sourceId: payload.sourceId }
    )
  })

  it('runs the encrypted catalog source sync inside the request-owned production context', async () => {
    await expect(processJob({
      type: 'catalog.sync',
      payload,
      enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, requestEvent)).resolves.toBeUndefined()

    expect(mocks.synchronizeCatalogSource).toHaveBeenCalledWith(
      requestEvent,
      payload.clientId,
      payload.sourceId,
      payload.actorEmail
    )
  })

  it('fails closed without a request-owned context', async () => {
    await expect(processJob({
      type: 'catalog.sync',
      payload,
      enqueuedAt: '2026-08-13T00:00:00.000Z'
    })).rejects.toThrow('Catalog sync requires a request-owned Cloudflare context')
    expect(mocks.synchronizeCatalogSource).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...payload, clientId: 'not-a-uuid' }],
    [{ ...payload, sourceId: 'not-a-uuid' }],
    [{ ...payload, actorEmail: 'not-an-email' }]
  ])('rejects malformed catalog identities before calling the source', async (malformed) => {
    await expect(processJob({
      type: 'catalog.sync',
      payload: malformed,
      enqueuedAt: '2026-08-13T00:00:00.000Z'
    }, requestEvent)).rejects.toThrow('Invalid catalog sync job payload')
    expect(mocks.synchronizeCatalogSource).not.toHaveBeenCalled()
  })
})
