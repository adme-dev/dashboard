import { createApp, createRouter, toWebHandler } from 'h3'
import { beforeEach, expect, it, vi } from 'vitest'
import { handleImageBilling } from '~~/server/utils/pageStudio/imageBillingHttp'

const mocks = vi.hoisted(() => ({ actor: vi.fn(), login: vi.fn(), checkout: vi.fn(), catalog: vi.fn(), receipt: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/httpActor', () => ({ resolvePageStudioHttpActor: mocks.actor }))
vi.mock('~~/server/utils/pageStudio/contentNativeLogin', () => ({ preparePageStudioContentLogin: mocks.login }))
vi.mock('~~/server/utils/pageStudio/imageBillingService', async original => ({ ...await original<typeof import('~~/server/utils/pageStudio/imageBillingService')>(), createImageCheckout: mocks.checkout, imageBillingCatalog: mocks.catalog, imageBillingReceipt: mocks.receipt }))
const intentId = '30000000-0000-4000-8000-000000000003'
const input = { intentId, packId: 'test100', packVersion: 'v1' }
function request(operation: 'checkout' | 'catalog' | 'receipt', body?: unknown, origin = 'https://studio.test', query = '') {
  const method = operation === 'checkout' ? 'POST' : 'GET'
  const router = createRouter().add('/sites/:siteId/images', event => handleImageBilling(event, operation), [method.toLowerCase() as 'post' | 'get'])
  return toWebHandler(createApp().use(router))(new Request(`https://studio.test/sites/${intentId}/images${query}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body), headers: { origin, 'host': 'studio.test', 'content-type': 'application/json', 'x-forwarded-proto': 'https' }
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.actor.mockResolvedValue({ role: 'client', actorId: 'owner', clientId: intentId })
  mocks.login.mockResolvedValue({ role: 'client', userId: 'owner', tokenHash: 'a'.repeat(64) })
  mocks.checkout.mockResolvedValue({ intentId, status: 'pending' })
  mocks.catalog.mockResolvedValue({ available: false })
  mocks.receipt.mockResolvedValue({ intentId, status: 'pending' })
})
it('rejects cross-origin checkout before actor or provider admission', async () => {
  expect((await request('checkout', input, 'https://other.test')).status).toBe(403)
  expect(mocks.actor).not.toHaveBeenCalled()
  expect(mocks.checkout).not.toHaveBeenCalled()
})
it('rejects browser prices, return URLs, provider IDs and scope', async () => {
  for (const extra of [{ amountMinor: 1 }, { origin: 'https://other.test' }, { customerId: 'cus_foreign' }, { clientId: intentId }]) {
    expect((await request('checkout', { ...input, ...extra })).status).toBe(400)
  }
  expect(mocks.checkout).not.toHaveBeenCalled()
})
it('binds checkout to current native login and never exposes Stripe payloads', async () => {
  const response = await request('checkout', input)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ actorId: 'owner' }), login: expect.objectContaining({ userId: 'owner' }) }), input)
  mocks.checkout.mockRejectedValue({ type: 'StripeAPIError', message: 'private-secret-payload', statusCode: 500 })
  const failed = await request('checkout', input)
  expect(failed.status).toBe(502)
  expect(await failed.text()).not.toContain('private-secret-payload')
})
it('receipt GET cannot trigger settlement and rejects customer filters', async () => {
  expect((await request('receipt', undefined, undefined, `?intentId=${intentId}`)).status).toBe(200)
  expect(mocks.checkout).not.toHaveBeenCalled()
  expect((await request('receipt', undefined, undefined, `?intentId=${intentId}&clientId=foreign`)).status).toBe(400)
})
