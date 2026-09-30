import Stripe from 'stripe'
import { expect, it } from 'vitest'
import { verifyImagePaymentEvent, createImageStripeClient } from '../../../workers/page-studio-payments/src/provider'
import { readImagePaymentConfig } from '~~/server/utils/pageStudio/imagePaymentConfig'

const config = readImagePaymentConfig({
  PAGE_STUDIO_IMAGE_PAYMENTS: JSON.stringify({ mode: 'test', accountId: 'acct_test', origin: 'https://preview.example.test', scopes: [{ tenantId: 'test', clientId: '10000000-0000-4000-8000-000000000001', environment: 'staging' }], packs: [{ id: 'test100', version: 'v1', currency: 'aud', amountMinor: 1000, credits: 100 }] }),
  PAGE_STUDIO_IMAGE_STRIPE_SECRET: 'sk_test_fixture', PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: 'whsec_fixture'
})
const event = { id: 'evt_fixture', object: 'event', livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_test_fixture' } } }
const sign = (body: string, timestamp?: number) => Stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: config.webhookSecret, timestamp, cryptoProvider: Stripe.createSubtleCryptoProvider() })
it('uses the official SDK fetch client and verifies the exact raw bytes using SubtleCrypto', async () => {
  const body = JSON.stringify(event)
  const verified = await verifyImagePaymentEvent(config, body, await sign(body))
  expect(verified.event.id).toBe(event.id)
  expect(verified.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(createImageStripeClient(config)).toBeInstanceOf(Stripe)
})
it('rejects forged signatures, altered body and expired signed payloads', async () => {
  const body = JSON.stringify(event), signature = await sign(body)
  await expect(verifyImagePaymentEvent(config, body, 't=1,v1=bad')).rejects.toThrow('signature')
  await expect(verifyImagePaymentEvent(config, body + ' ', signature)).rejects.toThrow('signature')
  await expect(verifyImagePaymentEvent(config, body, await sign(body, Math.floor(Date.now() / 1000) - 301))).rejects.toThrow('signature')
})
it('rejects live and connected-account events even with a valid signature', async () => {
  for (const patch of [{ livemode: true }, { account: 'acct_other' }]) {
    const body = JSON.stringify({ ...event, ...patch })
    await expect(verifyImagePaymentEvent(config, body, await sign(body))).rejects.toThrow('test account')
  }
})
it('bounds webhook payload size before verification', async () => {
  await expect(verifyImagePaymentEvent(config, 'x'.repeat(262_145), 'signature')).rejects.toThrow('size')
})
