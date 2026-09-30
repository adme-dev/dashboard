import Stripe from 'stripe'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import paymentWorker from '../../workers/page-studio-payments/src/index'
import { createImageStripeClient, verifyImagePaymentEvent } from '~~/server/utils/pageStudio/imagePaymentProvider'
import type { ImagePaymentConfig } from '~~/server/utils/pageStudio/imagePaymentConfig'

const config = { secretKey: 'sk_test_fixture', webhookSecret: 'whsec_fixture', provider: paymentWorker } as ImagePaymentConfig
const request = (body: unknown) => paymentWorker.fetch(new Request('https://image-payments.internal/rpc', { method: 'POST', body: JSON.stringify(body) }))
afterEach(() => {
  vi.unstubAllGlobals()
})
it('verifies exact bytes through the private binding with the official SDK', async () => {
  const body = JSON.stringify({ id: 'evt_test', livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_test_test' } } })
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: config.webhookSecret, cryptoProvider: Stripe.createSubtleCryptoProvider() })
  expect(await verifyImagePaymentEvent(config, body, signature)).toMatchObject({ event: { id: 'evt_test' }, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
  await expect(verifyImagePaymentEvent(config, body + ' ', signature)).rejects.toMatchObject({ statusCode: 400 })
})
it('rejects live keys, unsupported operations and malformed requests before provider IO', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  for (const patch of [{ secretKey: 'sk_live_test' }, { operation: 'refundCreate' }, { args: ['https://evil.test'] }]) {
    expect((await request({ secretKey: config.secretKey, webhookSecret: config.webhookSecret, operation: 'chargeRead', args: ['ch_test'], ...patch })).status).toBe(502)
  }
  expect(fetcher).not.toHaveBeenCalled()
  expect((await paymentWorker.fetch(new Request('https://image-payments.internal/rpc'))).status).toBe(404)
})
it('retains provider idempotency through the bounded native adapter', async () => {
  const fetcher = vi.fn(async () => Response.json({ id: 'cus_test', object: 'customer', livemode: false }))
  vi.stubGlobal('fetch', fetcher)
  const client = createImageStripeClient(config)
  const intentId = '30000000-0000-4000-8000-000000000003'
  const customer = await client.customers.create({ metadata: { studio_image_purchase: intentId, studio_image_fingerprint: 'a'.repeat(64), studio_image_environment: 'staging', studio_image_feature: 'credits-v1' } }, { idempotencyKey: `studio-image-customer-v1:${intentId}` })
  expect(customer.id).toBe('cus_test')
  expect(fetcher).toHaveBeenCalledOnce()
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.stripe.com/v1/customers')
  expect(new Headers(options.headers).get('idempotency-key')).toBe(`studio-image-customer-v1:${intentId}`)
})
it('fails closed without a service binding and bounds response bytes', async () => {
  await expect(verifyImagePaymentEvent({ ...config, provider: undefined }, '{}', 'bad')).rejects.toMatchObject({ statusCode: 503 })
  await expect(verifyImagePaymentEvent({ ...config, provider: { fetch: async () => new Response('x'.repeat(2_000_001)) } }, '{}', 'bad')).rejects.toThrow('limit')
  expect((await request({ secretKey: config.secretKey, webhookSecret: config.webhookSecret, operation: 'verify', args: ['x'.repeat(600_001), 'bad'] })).status).toBe(502)
})

it('keeps the provider private and bound only to Pages preview', () => {
  const worker = JSON.parse(readFileSync('workers/page-studio-payments/wrangler.jsonc', 'utf8'))
  expect(worker).toMatchObject({ name: 'xeroflow-page-studio-payments-staging', account_id: 'a5b299b3ad15c1b5b895dc66f9357b17', workers_dev: false, preview_urls: false, routes: [], observability: { enabled: false } })
  for (const key of ['services', 'hyperdrive', 'd1_databases', 'r2_buckets', 'kv_namespaces', 'vars', 'unsafe']) expect(worker[key]).toBeUndefined()
  const pages = readFileSync('wrangler.toml', 'utf8')
  expect(pages.match(/binding = "PAGE_STUDIO_IMAGE_PAYMENTS_SERVICE"/g)).toHaveLength(1)
  expect(pages).toContain('[[env.preview.services]]\nbinding = "PAGE_STUDIO_IMAGE_PAYMENTS_SERVICE"\nservice = "xeroflow-page-studio-payments-staging"')
})
