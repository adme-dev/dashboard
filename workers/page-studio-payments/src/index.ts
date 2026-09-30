import { z } from 'zod'
import { createImageStripeClient, verifyImagePaymentEvent } from './provider'

const Input = z.object({
  secretKey: z.string().regex(/^sk_test_[A-Za-z0-9]+$/).max(256),
  webhookSecret: z.string().regex(/^whsec_[A-Za-z0-9]+$/).max(256),
  operation: z.enum(['verify', 'account', 'customerCreate', 'checkoutCreate', 'checkoutRead', 'checkoutList', 'paymentRead', 'chargeRead', 'disputeRead', 'disputeList', 'refundRead', 'refundList']),
  args: z.array(z.unknown()).max(2)
}).strict()
const id = (prefix: string, input: unknown) => z.string().max(80).regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`)).parse(input)
const options = z.object({ idempotencyKey: z.string().regex(/^studio-image-(?:customer|checkout)-v1:[0-9a-f-]{36}$/) }).strict()
const metadata = z.object({ studio_image_purchase: z.string().uuid(), studio_image_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), studio_image_environment: z.literal('staging'), studio_image_feature: z.literal('credits-v1') }).strict()
const checkout = z.object({
  mode: z.literal('payment'), customer: z.string().regex(/^cus_[A-Za-z0-9_]+$/).max(80), client_reference_id: z.string().uuid(), metadata,
  payment_intent_data: z.object({ metadata }).strict(), payment_method_types: z.tuple([z.literal('card')]),
  line_items: z.tuple([z.object({ quantity: z.literal(1), price_data: z.object({ currency: z.literal('aud'), unit_amount: z.number().int().min(50).max(10_000_000), product_data: z.object({ name: z.string().min(1).max(128) }).strict() }).strict() }).strict()]),
  expires_at: z.number().int().positive(), success_url: z.string().url().max(2048), cancel_url: z.string().url().max(2048)
}).strict()
async function execute(input: z.infer<typeof Input>) {
  const [first, second] = input.args
  if (input.operation === 'verify') return verifyImagePaymentEvent(input, z.string().max(262_144).parse(first), z.string().max(2048).parse(second))
  const client = createImageStripeClient(input)
  switch (input.operation) {
    case 'account': return client.accounts.retrieveCurrent()
    case 'customerCreate': return client.customers.create(z.object({ metadata }).strict().parse(first), options.parse(second))
    case 'checkoutCreate': return client.checkout.sessions.create(checkout.parse(first), options.parse(second))
    case 'checkoutRead': return client.checkout.sessions.retrieve(id('cs_test', first))
    case 'checkoutList': return client.checkout.sessions.list(z.object({ payment_intent: z.string().regex(/^pi_[A-Za-z0-9_]+$/).max(80), limit: z.literal(2) }).strict().parse(first))
    case 'paymentRead': return client.paymentIntents.retrieve(id('pi', first), { expand: ['latest_charge'] })
    case 'chargeRead': return client.charges.retrieve(id('ch', first))
    case 'disputeRead': return client.disputes.retrieve(id('du', first))
    case 'disputeList': return client.disputes.list(z.object({ charge: z.string().regex(/^ch_[A-Za-z0-9_]+$/).max(80), limit: z.literal(2) }).strict().parse(first))
    case 'refundRead': return client.refunds.retrieve(id('re', first))
    case 'refundList': return client.refunds.list(z.object({ charge: z.string().regex(/^ch_[A-Za-z0-9_]+$/).max(80), limit: z.literal(100) }).strict().parse(first))
  }
}
async function bounded(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body')
  const bytes = new Uint8Array(600_000)
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      if (size + part.value.byteLength > bytes.byteLength) {
        await reader.cancel()
        throw new Error('Body limit')
      }
      bytes.set(part.value, size)
      size += part.value.byteLength
    }
  } finally { reader.releaseLock() }
  return Input.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))))
}
/** Private service-binding only. No public routes, workers.dev, DB, wallet or
 * customer authority. Native Pages callers own all admission and accounting. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/rpc') return new Response(null, { status: 404 })
    try {
      const result = await execute(await bounded(request))
      const body = JSON.stringify({ result })
      if (new TextEncoder().encode(body).byteLength > 2_000_000) throw new Error('Response limit')
      return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    } catch (error) {
      const invalidSignature = error && typeof error === 'object' && 'code' in error && error.code === 'IMAGE_PAYMENT_SIGNATURE_INVALID'
      return Response.json({ error: invalidSignature ? 'Invalid payment webhook signature' : 'Payment provider request could not be completed' }, { status: invalidSignature ? 400 : 502 })
    }
  }
}
