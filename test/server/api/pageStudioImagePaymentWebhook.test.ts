import paymentWorker from '../../../workers/page-studio-payments/src/index'
import Stripe from 'stripe'
import { createApp, createRouter, toWebHandler } from 'h3'
import { beforeEach, expect, it, vi } from 'vitest'
import { handleImagePaymentWebhook } from '~~/server/utils/pageStudio/imagePaymentWebhook'

const mocks = vi.hoisted(() => ({ query: vi.fn(), snapshot: vi.fn(), observe: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query, transactionWithoutRetry: mocks.transaction }))
vi.mock('~~/server/utils/pageStudio/imagePaymentSnapshot', () => ({ retrieveImagePaymentSnapshot: mocks.snapshot }))
vi.mock('~~/server/utils/pageStudio/imagePayments', () => ({ observeImagePayment: mocks.observe }))
const scope = { tenantId: 'test', clientId: '10000000-0000-4000-8000-000000000001', environment: 'staging' }
const env = { PAGE_STUDIO_IMAGE_PAYMENTS: JSON.stringify({ mode: 'test', accountId: 'acct_test', origin: 'https://preview.example.test', scopes: [scope], packs: [{ id: 'test100', version: 'v1', currency: 'aud', amountMinor: 1000, credits: 100 }] }), PAGE_STUDIO_IMAGE_PAYMENTS_SERVICE: paymentWorker, PAGE_STUDIO_IMAGE_STRIPE_SECRET: 'sk_test_fixture', PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' }
const raw = '{ "id":"evt_test", "object":"event", "type":"checkout.session.completed", "livemode":false, "data":{"object":{"id":"cs_test_first"}} }'
const sign = () => Stripe.webhooks.generateTestHeaderStringAsync({ payload: raw, secret: env.PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET, cryptoProvider: Stripe.createSubtleCryptoProvider() })
function request(body: string, signature: string, contentType = 'application/json') {
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  })
  app.use(createRouter().post('/api/webhooks/studio-image-payments', handleImagePaymentWebhook))
  return toWebHandler(app)(new Request('https://preview.example.test/api/webhooks/studio-image-payments', { method: 'POST', headers: { 'content-type': contentType, 'stripe-signature': signature }, body }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.query.mockResolvedValue(null)
  mocks.snapshot.mockResolvedValue({ intentId: '30000000-0000-4000-8000-000000000003', scope, observation: { marker: 'verified' } })
  mocks.transaction.mockImplementation(work => work({ query: vi.fn() }))
  mocks.observe.mockResolvedValue({ balance: 100 })
})
it('requires a valid raw-body signature before database or provider access', async () => {
  expect((await request(raw, 'bad')).status).toBe(400)
  expect(mocks.query).not.toHaveBeenCalled()
  expect(mocks.snapshot).not.toHaveBeenCalled()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('fulfills only a verified snapshot inside a non-retrying transaction', async () => {
  const response = await request(raw, await sign())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(mocks.snapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: expect.objectContaining({ id: 'evt_test' }) }), expect.any(Function))
  expect(mocks.observe).toHaveBeenCalledWith(expect.anything(), scope, '30000000-0000-4000-8000-000000000003', { marker: 'verified' })
  expect(mocks.transaction).toHaveBeenCalledOnce()
})
it('does not grant credit for ignored or unpaid events', async () => {
  mocks.snapshot.mockResolvedValue(null)
  expect((await request(raw, await sign())).status).toBe(200)
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('acknowledges identical saved events without provider work and rejects conflicting evidence', async () => {
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), value => value.toString(16).padStart(2, '0')).join('')
  mocks.query.mockResolvedValue({ fingerprint })
  expect((await request(raw, await sign())).status).toBe(200)
  expect(mocks.snapshot).not.toHaveBeenCalled()
  mocks.query.mockResolvedValue({ fingerprint: 'b'.repeat(64) })
  expect((await request(raw, await sign())).status).toBe(409)
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('bounds raw streamed input and requires JSON without exposing provider errors', async () => {
  expect((await request('x'.repeat(262_145), 'unused')).status).toBe(413)
  expect((await request(raw, await sign(), 'text/plain')).status).toBe(415)
  expect(mocks.snapshot).not.toHaveBeenCalled()
  mocks.snapshot.mockRejectedValue(new Error('sk_test_private-provider-error'))
  const response = await request(raw, await sign())
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain('private-provider-error')
})
