import Stripe from 'stripe'
import type { ImagePaymentConfig } from './imagePaymentConfig'
import { ImageCreditError } from './imageCredits'

/** Fetch and WebCrypto work on Cloudflare without Node network/crypto shims.
 * Provider mutations will additionally use persisted purchase idempotency keys. */
export function createImageStripeClient(config: ImagePaymentConfig) {
  return new Stripe(config.secretKey, {
    apiVersion: '2026-08-26.dahlia',
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 0,
    timeout: 15_000,
    telemetry: false
  })
}

export async function verifyImagePaymentEvent(config: ImagePaymentConfig, rawBody: string, signature: string) {
  const bytes = new TextEncoder().encode(rawBody)
  if (bytes.byteLength > 262_144) throw new ImageCreditError('IMAGE_PAYMENT_BODY_TOO_LARGE', 413, 'Payment payload exceeds the size limit')
  let event: Stripe.Event
  try {
    event = await createImageStripeClient(config).webhooks.constructEventAsync(
      rawBody, signature, config.webhookSecret, 300, Stripe.createSubtleCryptoProvider()
    )
  } catch {
    throw new ImageCreditError('IMAGE_PAYMENT_SIGNATURE_INVALID', 400, 'Invalid payment webhook signature')
  }
  if (event.livemode !== false || event.account || !/^evt_[A-Za-z0-9_]{1,76}$/.test(event.id)) {
    throw new ImageCreditError('IMAGE_PAYMENT_ENVIRONMENT_INVALID', 400, 'Payment webhook must belong to the configured test account')
  }
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
  return { event, fingerprint }
}
