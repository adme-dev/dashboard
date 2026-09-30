import type Stripe from 'stripe'
import type { ImagePaymentConfig } from './imagePaymentConfig'
import { ImageCreditError } from './imageCredits'

async function call(config: ImagePaymentConfig, operation: string, args: unknown[]) {
  if (!config.provider) throw new ImageCreditError('IMAGE_PAYMENTS_UNAVAILABLE', 503, 'Image credit top-ups are not configured')
  const response = await config.provider.fetch(new Request('https://image-payments.internal/rpc', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ secretKey: config.secretKey, webhookSecret: config.webhookSecret, operation, args })
  }))
  if (!response.ok) throw new ImageCreditError(operation === 'verify' && response.status === 400 ? 'IMAGE_PAYMENT_SIGNATURE_INVALID' : 'IMAGE_PAYMENT_PROVIDER_UNAVAILABLE', response.status === 400 ? 400 : 502, operation === 'verify' && response.status === 400 ? 'Invalid payment webhook signature' : 'Payment verification could not be completed. Retry this same request.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing payment service response')
  const bytes = new Uint8Array(2_000_000)
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      if (size + part.value.byteLength > bytes.byteLength) {
        await reader.cancel()
        throw new Error('Payment service response limit')
      }
      bytes.set(part.value, size)
      size += part.value.byteLength
    }
  } finally { reader.releaseLock() }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))).result
}
/** Only the small adapter is bundled into Pages. The official Stripe SDK runs
 * in a private test-only Worker, with no authority to mutate the native ledger. */
export function createImageStripeClient(config: ImagePaymentConfig): Stripe {
  const invoke = (operation: string) => (...args: unknown[]) => call(config, operation, args)
  return {
    accounts: { retrieveCurrent: invoke('account') }, customers: { create: invoke('customerCreate') },
    checkout: { sessions: { create: invoke('checkoutCreate'), retrieve: invoke('checkoutRead'), list: invoke('checkoutList') } },
    paymentIntents: { retrieve: invoke('paymentRead') }, charges: { retrieve: invoke('chargeRead') },
    disputes: { retrieve: invoke('disputeRead'), list: invoke('disputeList') },
    refunds: { retrieve: invoke('refundRead'), list: invoke('refundList') }
  } as unknown as Stripe
}
export async function verifyImagePaymentEvent(config: ImagePaymentConfig, rawBody: string, signature: string): Promise<{ event: Stripe.Event, fingerprint: string }> {
  if (new TextEncoder().encode(rawBody).byteLength > 262_144) throw new ImageCreditError('IMAGE_PAYMENT_BODY_TOO_LARGE', 413, 'Payment payload exceeds the size limit')
  return call(config, 'verify', [rawBody, signature])
}
