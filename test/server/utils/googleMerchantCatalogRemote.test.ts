import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), loadConnection: vi.fn() }))

vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/googlePmaxProviderConnection', () => ({
  loadGooglePmaxProviderConnection: mocks.loadConnection
}))

const {
  runGoogleMerchantCatalogReadback,
  runGoogleMerchantCatalogReconciliation
} = await import('../../../server/utils/googleMerchantCatalogRemote')

const input = {
  tenantId: 'tenant-1',
  clientId: '11111111-1111-4111-8111-111111111111',
  sourceId: '22222222-2222-4222-8222-222222222222'
}
const connectionId = '33333333-3333-4333-8333-333333333333'

describe('private Merchant catalog provider boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryOne.mockResolvedValue({
      id: input.sourceId,
      client_id: input.clientId,
      connection_config: {
        merchant: {
          auto_publish: true,
          tenant_id: input.tenantId,
          ads_connection_id: connectionId,
          ads_customer_id: '3437087580'
        }
      }
    })
    mocks.loadConnection.mockResolvedValue({
      id: connectionId,
      clientId: input.clientId,
      status: 'active',
      customerId: '3437087580',
      accessToken: 'secret-access',
      developerToken: 'secret-developer'
    })
  })

  it('passes scoped credentials only to the private binding and returns sanitized evidence', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      ok: true,
      result: {
        runId: '44444444-4444-4444-8444-444444444444',
        publishCount: 262,
        processingState: 'SUBMITTED_AWAITING_GOOGLE_READBACK'
      }
    }))
    const event = { context: { cloudflare: { env: { GOOGLE_PMAX_PROVIDER: { fetch } } } } } as never

    await expect(runGoogleMerchantCatalogReconciliation(event, input)).resolves.toMatchObject({
      publishCount: 262,
      processingState: 'SUBMITTED_AWAITING_GOOGLE_READBACK'
    })
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(fetch.mock.calls[0]?.[0]).toBe('https://google-pmax-provider.internal/v1/decision')
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: 'merchant_catalog_reconcile',
      input: { ...input, connection: { id: connectionId, accessToken: 'secret-access' } }
    })
  })

  it('fails closed before credential loading when the source scope is not opted in', async () => {
    mocks.queryOne.mockResolvedValue({
      id: input.sourceId,
      client_id: input.clientId,
      connection_config: { merchant: { auto_publish: false } }
    })
    const event = { context: { cloudflare: { env: { GOOGLE_PMAX_PROVIDER: { fetch: vi.fn() } } } } } as never

    await expect(runGoogleMerchantCatalogReconciliation(event, input))
      .rejects.toMatchObject({ code: 'MERCHANT_CATALOG_SCOPE_INVALID' })
    expect(mocks.loadConnection).not.toHaveBeenCalled()
  })

  it('requests official processed-product readback through the scoped provider', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      ok: true,
      result: { processedCount: 36, disapprovedCount: 0, pendingCount: 0 }
    }))
    const event = { context: { cloudflare: { env: { GOOGLE_PMAX_PROVIDER: { fetch } } } } } as never

    await expect(runGoogleMerchantCatalogReadback(event, input)).resolves.toMatchObject({
      processedCount: 36,
      pendingCount: 0
    })
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: 'merchant_catalog_readback',
      input: { ...input, connection: { id: connectionId, accessToken: 'secret-access' } }
    })
  })
})
