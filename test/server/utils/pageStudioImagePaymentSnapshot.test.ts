import type Stripe from 'stripe'
import { beforeEach, expect, it, vi } from 'vitest'
import { retrieveImagePaymentSnapshot } from '~~/server/utils/pageStudio/imagePaymentSnapshot'
import { readImagePaymentConfig } from '~~/server/utils/pageStudio/imagePaymentConfig'
import type { ImagePurchase } from '~~/server/utils/pageStudio/imagePayments'

const intentId = '30000000-0000-4000-8000-000000000003'
const fingerprint = 'a'.repeat(64)
const scope = { tenantId: 'test', clientId: '10000000-0000-4000-8000-000000000001', environment: 'staging' }
const pack = { id: 'test100', version: 'v1', currency: 'aud', amountMinor: 1000, credits: 100 }
const config = readImagePaymentConfig({ PAGE_STUDIO_IMAGE_PAYMENTS: JSON.stringify({ mode: 'test', accountId: 'acct_test', origin: 'https://preview.example.test', scopes: [scope], packs: [pack] }), PAGE_STUDIO_IMAGE_STRIPE_SECRET: 'sk_test_fixture', PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' })
const metadata = { studio_image_purchase: intentId, studio_image_fingerprint: fingerprint, studio_image_environment: 'staging', studio_image_feature: 'credits-v1' }
const purchase = { intent_id: intentId, tenant_id: scope.tenantId, client_id: scope.clientId, environment: 'staging', pack, fingerprint, account_id: 'acct_test', customer_id: 'cus_test', checkout_id: 'cs_test_first' } as ImagePurchase
let charge: Record<string, unknown>, payment: Record<string, unknown>, session: Record<string, unknown>, disputes: unknown[], refunds: unknown[]
const readPurchase = vi.fn(async () => purchase)
const provider = {
  accounts: { retrieveCurrent: vi.fn(async () => ({ id: 'acct_test' })) },
  checkout: { sessions: { retrieve: vi.fn(async () => session), list: vi.fn(async () => ({ data: [session], has_more: false })) } },
  paymentIntents: { retrieve: vi.fn(async () => payment) },
  charges: { retrieve: vi.fn(async () => charge) },
  disputes: { list: vi.fn(async () => ({ data: disputes, has_more: false })), retrieve: vi.fn(async () => disputes[0]) },
  refunds: { retrieve: vi.fn(async () => ({ id: 're_test', payment_intent: 'pi_test', charge: 'ch_test' })), list: vi.fn(async () => ({ data: refunds, has_more: false })) }
} as unknown as Stripe
const snapshot = (type = 'checkout.session.completed', objectId = 'cs_test_first') => retrieveImagePaymentSnapshot(config, { event: { id: 'evt_test', type, livemode: false, data: { object: { id: objectId } } } as Stripe.Event, fingerprint }, readPurchase, provider)
beforeEach(() => {
  vi.clearAllMocks()
  charge = { id: 'ch_test', object: 'charge', customer: 'cus_test', payment_intent: 'pi_test', livemode: false, paid: true, captured: true, amount: 1000, amount_captured: 1000, amount_refunded: 0, currency: 'aud', disputed: false }
  payment = { id: 'pi_test', customer: 'cus_test', livemode: false, status: 'succeeded', amount: 1000, amount_received: 1000, currency: 'aud', latest_charge: charge, metadata }
  session = { id: 'cs_test_first', customer: 'cus_test', livemode: false, payment_status: 'paid', status: 'complete', mode: 'payment', amount_total: 1000, currency: 'aud', payment_intent: 'pi_test', metadata }
  disputes = []
  refunds = []
})
it('retrieves provider objects and binds paid amount, customer, scope and immutable purchase identity', async () => {
  expect(await snapshot()).toMatchObject({ intentId, scope, observation: { paid: true, amountMinor: 1000, customerId: 'cus_test', refundedMinor: 0 } })
  expect(provider.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test', { expand: ['latest_charge'] })
})
it('ignores unrelated events and unpaid checkout without granting credit', async () => {
  expect(await snapshot('customer.created', 'cus_other')).toBeNull()
  session.payment_status = 'unpaid'
  session.payment_intent = null
  expect(await snapshot()).toBeNull()
})
it('rejects wrong customer, amount, metadata and live provider objects', async () => {
  session.customer = 'cus_other'
  await expect(snapshot()).rejects.toThrow('identity')
  session.customer = 'cus_test'
  payment.amount_received = 999
  await expect(snapshot()).rejects.toThrow('identity')
  payment.amount_received = 1000
  session.metadata = { ...metadata, studio_image_fingerprint: 'b'.repeat(64) }
  await expect(snapshot()).rejects.toThrow('identity')
  session.metadata = metadata
  charge.livemode = true
  await expect(snapshot()).rejects.toThrow('identity')
})
it('loads refund and dispute state before fulfillment, including full reversal', async () => {
  charge.amount_refunded = 400
  charge.disputed = true
  disputes = [{ id: 'du_test', charge: 'ch_test', payment_intent: 'pi_test', livemode: false, currency: 'aud', status: 'needs_response' }]
  expect(await snapshot('charge.refunded', 'ch_test')).toMatchObject({ observation: { refundedMinor: 400, dispute: { id: 'du_test', status: 'active' } } })
  disputes = [{ ...(disputes[0] as object), status: 'won' }]
  expect(await snapshot('charge.dispute.closed', 'du_test')).toMatchObject({ observation: { dispute: { status: 'won' } } })
})
it('does not accept a disputed charge without complete current dispute evidence', async () => {
  charge.disputed = true
  await expect(snapshot()).rejects.toThrow('identity')
})
it('loads failed refund identity for one compensating reinstatement', async () => {
  refunds = [{ id: 're_test', charge: 'ch_test', payment_intent: 'pi_test', amount: 400, currency: 'aud', status: 'failed' }]
  expect(await snapshot('refund.failed', 're_test')).toMatchObject({ observation: { refunds: [{ id: 're_test', amountMinor: 400, status: 'failed' }] } })
})
