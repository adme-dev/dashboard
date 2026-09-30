import type Stripe from 'stripe'
import { ImageCreditError } from './imageCredits'
import { ImagePaymentOriginSchema, type ImagePaymentConfig } from './imagePaymentConfig'
import { createImageStripeClient } from './imagePaymentProvider'
import type { ImagePurchase } from './imagePayments'

export interface ImageCheckoutStore {
  /** Each callback independently admits current native billing authority. */
  read(): Promise<ImagePurchase>
  saveCustomer(id: string): Promise<ImagePurchase>
  saveCheckout(id: string, url: string): Promise<ImagePurchase>
}
export interface ImageCheckoutResult {
  intentId: string
  status: 'checkout' | 'pending' | 'confirmed' | 'expired'
  checkoutUrl?: string
}
const mismatch = () => new ImageCreditError('IMAGE_CHECKOUT_IDENTITY', 409, 'Checkout identity could not be verified')
const age = (row: ImagePurchase, now: number) => now - new Date(row.created_at).getTime()
function result(row: ImagePurchase, now: number): ImageCheckoutResult | null {
  const base = { intentId: row.intent_id }
  if (row.funded) return { ...base, status: 'confirmed' }
  // Expired means checkout cannot be resumed. Only the webhook decides funding.
  if (row.checkout_url && age(row, now) < 3_600_000) return { ...base, status: 'checkout', checkoutUrl: row.checkout_url }
  if (row.checkout_id) return { ...base, status: 'pending' }
  if (age(row, now) > 25 * 60_000) return { ...base, status: 'expired' }
  return null
}

/** All network calls are outside SQL. A persisted one-hour expiry and 25-minute
 * write window keep retries inside Stripe's idempotency retention and minimum
 * Checkout TTL. Unknown responses are retried with identical keys and params. */
export async function runImageCheckout(config: ImagePaymentConfig, store: ImageCheckoutStore,
  client = createImageStripeClient(config), now = Date.now): Promise<ImageCheckoutResult> {
  let row = await store.read()
  if (row.account_id !== config.accountId || row.environment !== 'staging') throw mismatch()
  const existing = result(row, now())
  if (existing) return existing
  const origin = ImagePaymentOriginSchema.safeParse(row.return_origin)
  if (!origin.success || !Number.isFinite(age(row, now())) || age(row, now()) < 0) throw mismatch()
  if ((await client.accounts.retrieveCurrent()).id !== row.account_id) throw mismatch()
  const metadata = { studio_image_purchase: row.intent_id, studio_image_fingerprint: row.fingerprint,
    studio_image_environment: 'staging', studio_image_feature: 'credits-v1' }
  if (!row.customer_id) {
    await store.read()
    const customer = await client.customers.create({ metadata }, { idempotencyKey: `studio-image-customer-v1:${row.intent_id}` })
    if (customer.livemode !== false || !/^cus_[A-Za-z0-9_]+$/.test(customer.id)) throw mismatch()
    await store.saveCustomer(customer.id)
  }
  row = await store.read()
  const changed = result(row, now())
  if (changed) return changed
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment', customer: row.customer_id!, client_reference_id: row.intent_id,
    metadata, payment_intent_data: { metadata }, payment_method_types: ['card'],
    line_items: [{ quantity: 1, price_data: { currency: row.pack.currency, unit_amount: row.pack.amountMinor,
      product_data: { name: `${row.pack.credits} image credits (test)` } } }],
    expires_at: Math.floor(new Date(row.created_at).getTime() / 1000) + 3600,
    success_url: `${origin.data}/studio/credits?site=${encodeURIComponent(row.site_id)}&purchase=${row.intent_id}&payment=returned`,
    cancel_url: `${origin.data}/studio/credits?site=${encodeURIComponent(row.site_id)}&purchase=${row.intent_id}&payment=cancelled`
  }
  const checkout = await client.checkout.sessions.create(params, { idempotencyKey: `studio-image-checkout-v1:${row.intent_id}` })
  if (checkout.livemode !== false || checkout.customer !== row.customer_id || checkout.amount_total !== row.pack.amountMinor
    || checkout.currency !== row.pack.currency || !checkout.url || !/^cs_test_[A-Za-z0-9_]+$/.test(checkout.id)) throw mismatch()
  row = await store.saveCheckout(checkout.id, checkout.url)
  return result(row, now()) ?? { intentId: row.intent_id, status: 'pending' }
}
