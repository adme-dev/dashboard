import type Stripe from 'stripe'
import { z } from 'zod'
import { ImageCreditError } from './imageCredits'
import type { ImagePaymentConfig } from './imagePaymentConfig'
import { createImageStripeClient, type verifyImagePaymentEvent } from './imagePaymentProvider'
import type { ImagePaymentObservation, ImagePurchase } from './imagePayments'

const EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'charge.refunded',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'charge.dispute.funds_reinstated',
  'refund.created', 'refund.updated', 'refund.failed'])
const identityError = () => new ImageCreditError('IMAGE_PAYMENT_PROVIDER_IDENTITY', 409, 'Provider payment identity could not be verified')
function providerId(input: unknown, prefix: string): string {
  const value = typeof input === 'object' && input !== null && 'id' in input ? input.id : input
  if (typeof value !== 'string' || value.length > 80 || !new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value)) throw identityError()
  return value
}
function metadataMatches(metadata: Stripe.Metadata | null, row: ImagePurchase) {
  return metadata?.studio_image_purchase === row.intent_id && metadata.studio_image_fingerprint === row.fingerprint
    && metadata.studio_image_environment === 'staging' && metadata.studio_image_feature === 'credits-v1'
}
async function eventPayment(client: Stripe, event: Stripe.Event) {
  const object = event.data.object
  if (event.type.startsWith('checkout.session.')) {
    const session = await client.checkout.sessions.retrieve(providerId(object, 'cs_test'))
    if (!session.payment_intent && session.payment_status !== 'paid') return null
    return { paymentId: providerId(session.payment_intent, 'pi'), session, chargeId: null }
  }
  if (event.type.startsWith('refund.')) {
    const refund = await client.refunds.retrieve(providerId(object, 're'))
    return { paymentId: providerId(refund.payment_intent, 'pi'), session: null, chargeId: providerId(refund.charge, 'ch') }
  }
  const charge = event.type === 'charge.refunded'
    ? await client.charges.retrieve(providerId(object, 'ch'))
    : await client.charges.retrieve(providerId((await client.disputes.retrieve(providerId(object, 'du'))).charge, 'ch'))
  return { paymentId: providerId(charge.payment_intent, 'pi'), session: null, chargeId: charge.id }
}
async function currentSession(client: Stripe, row: ImagePurchase, paymentId: string) {
  if (row.checkout_id) return client.checkout.sessions.retrieve(providerId(row.checkout_id, 'cs_test'))
  // A webhook can beat the checkout-create response. The persisted customer and
  // immutable metadata still bind this unique session to its native intent.
  const list = await client.checkout.sessions.list({ payment_intent: paymentId, limit: 2 })
  if (list.has_more || list.data.length !== 1) throw identityError()
  return list.data[0]!
}
async function currentDispute(client: Stripe, charge: Stripe.Charge): Promise<ImagePaymentObservation['dispute']> {
  if (!charge.disputed) return null
  const list = await client.disputes.list({ charge: charge.id, limit: 2 })
  const dispute = list.data[0]
  if (list.has_more || list.data.length !== 1 || !dispute || dispute.livemode !== false
    || providerId(dispute.charge, 'ch') !== charge.id || dispute.currency !== charge.currency) throw identityError()
  const status = dispute.status
  if (['won', 'warning_closed', 'prevented'].includes(status)) return { id: providerId(dispute.id, 'du'), status: 'won' }
  if (status === 'lost') return { id: providerId(dispute.id, 'du'), status: 'lost' }
  if (['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes(status)) return { id: providerId(dispute.id, 'du'), status: 'active' }
  throw identityError()
}
async function currentRefunds(client: Stripe, charge: Stripe.Charge): Promise<ImagePaymentObservation['refunds']> {
  const list = await client.refunds.list({ charge: charge.id, limit: 100 })
  if (list.has_more) throw identityError()
  return list.data.map((refund) => {
    if (providerId(refund.charge, 'ch') !== charge.id || refund.currency !== charge.currency) throw identityError()
    const status = refund.status === 'requires_action' ? 'pending' : refund.status
    if (status !== 'pending' && status !== 'succeeded' && status !== 'failed' && status !== 'canceled') throw identityError()
    return { id: providerId(refund.id, 're'), amountMinor: refund.amount, status }
  })
}
function assertSnapshot(row: ImagePurchase, config: ImagePaymentConfig, session: Stripe.Checkout.Session, payment: Stripe.PaymentIntent, charge: Stripe.Charge) {
  if (row.environment !== 'staging' || row.account_id !== config.accountId || session.livemode !== false || payment.livemode !== false || charge.livemode !== false
    || session.mode !== 'payment' || !metadataMatches(session.metadata, row) || !metadataMatches(payment.metadata, row)
    || providerId(session.customer, 'cus') !== row.customer_id || providerId(payment.customer, 'cus') !== row.customer_id || providerId(charge.customer, 'cus') !== row.customer_id
    || providerId(session.payment_intent, 'pi') !== payment.id || providerId(charge.payment_intent, 'pi') !== payment.id
    || (row.checkout_id && row.checkout_id !== session.id) || (row.payment_id && row.payment_id !== payment.id) || (row.charge_id && row.charge_id !== charge.id)
    || session.amount_total !== row.pack.amountMinor || payment.amount !== row.pack.amountMinor || charge.amount !== row.pack.amountMinor
    || session.currency !== row.pack.currency || payment.currency !== row.pack.currency || charge.currency !== row.pack.currency) throw identityError()
  if (session.payment_status === 'paid' && (session.status !== 'complete' || payment.status !== 'succeeded' || !charge.paid || !charge.captured
    || payment.amount_received !== row.pack.amountMinor || charge.amount_captured !== row.pack.amountMinor)) throw identityError()
}

/** Signed event bodies are notifications, not prices or sufficient paid evidence.
 * Re-fetch current provider state outside SQL, then compare every value against
 * the persisted native purchase. No arbitrary URLs or customer metadata grants. */
export async function retrieveImagePaymentSnapshot(
  config: ImagePaymentConfig,
  verified: Awaited<ReturnType<typeof verifyImagePaymentEvent>>,
  readPurchase: (id: string) => Promise<ImagePurchase>,
  client = createImageStripeClient(config)
) {
  if (!EVENTS.has(verified.event.type)) return null
  const source = await eventPayment(client, verified.event)
  if (!source) return null
  const payment = await client.paymentIntents.retrieve(source.paymentId, { expand: ['latest_charge'] })
  if (payment.metadata.studio_image_feature !== 'credits-v1') return null
  const intent = z.string().uuid().safeParse(payment.metadata.studio_image_purchase)
  if (!intent.success) throw identityError()
  const row = await readPurchase(intent.data)
  const charge = typeof payment.latest_charge === 'object' && payment.latest_charge
    ? payment.latest_charge
    : await client.charges.retrieve(providerId(payment.latest_charge, 'ch'))
  if (source.chargeId && charge.id !== source.chargeId) throw identityError()
  const [session, account, dispute, refunds] = await Promise.all([
    source.session ?? currentSession(client, row, payment.id),
    client.accounts.retrieveCurrent(), currentDispute(client, charge), currentRefunds(client, charge)
  ])
  if (account.id !== config.accountId) throw identityError()
  assertSnapshot(row, config, session, payment, charge)
  const observation: ImagePaymentObservation = {
    eventId: verified.event.id, eventFingerprint: verified.fingerprint, accountId: config.accountId,
    customerId: providerId(session.customer, 'cus'), checkoutId: providerId(session.id, 'cs_test'),
    paymentId: providerId(payment.id, 'pi'), chargeId: providerId(charge.id, 'ch'), amountMinor: session.amount_total!,
    currency: row.pack.currency, livemode: false, paid: session.payment_status === 'paid', refundedMinor: charge.amount_refunded, dispute, refunds
  }
  return { intentId: row.intent_id, scope: { tenantId: row.tenant_id, clientId: row.client_id, environment: row.environment }, observation }
}
