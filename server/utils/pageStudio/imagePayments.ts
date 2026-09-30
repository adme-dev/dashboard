import { z } from 'zod'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { PageStudioControlQueryClient } from './controlStore'
import { ImageCreditError, grantImageCredits, lockImageCreditWallet, readImageCredits, type CreditScope } from './imageCredits'
import { ImageCreditPackSchema, ImagePaymentOriginSchema, type ImageCreditPack } from './imagePaymentConfig'

const providerId = (prefix: string) => z.string().max(80).regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`))
const Intent = z.object({ intentId: z.string().uuid(), siteId: z.string().uuid(), actorId: z.string().min(1).max(128), accountId: providerId('acct'), pack: ImageCreditPackSchema, returnOrigin: ImagePaymentOriginSchema }).strict()
const Checkout = z.object({ checkoutId: providerId('cs_test'), url: z.string().max(4096).url() }).strict().refine((value) => {
  const url = new URL(value.url)
  return url.origin === 'https://checkout.stripe.com' && !url.username && !url.password && url.pathname === `/c/pay/${value.checkoutId}`
})
const Observation = z.object({
  eventId: providerId('evt'), eventFingerprint: z.string().regex(/^[a-f0-9]{64}$/), accountId: providerId('acct'),
  customerId: providerId('cus'), checkoutId: providerId('cs_test'), paymentId: providerId('pi'), chargeId: providerId('ch'),
  amountMinor: z.number().int().min(50).max(10_000_000), currency: z.literal('aud'), livemode: z.literal(false),
  paid: z.boolean(), refundedMinor: z.number().int().min(0).max(10_000_000),
  dispute: z.object({ id: providerId('du'), status: z.enum(['active', 'won', 'lost']) }).strict().nullable(),
  refunds: z.array(z.object({ id: providerId('re'), amountMinor: z.number().int().min(1).max(10_000_000),
    status: z.enum(['pending', 'succeeded', 'failed', 'canceled']) }).strict()).max(100).optional()
}).strict().refine(value => value.refundedMinor <= value.amountMinor)
export type ImagePaymentObservation = z.infer<typeof Observation>
export interface ImagePurchase {
  intent_id: string
  tenant_id: string
  client_id: string
  environment: 'staging'
  site_id: string
  actor_id: string
  account_id: string
  pack: ImageCreditPack
  fingerprint: string
  return_origin: string | null
  customer_id: string | null
  checkout_id: string | null
  checkout_url: string | null
  payment_id: string | null
  charge_id: string | null
  funded: boolean
  refunded_minor: string
  dispute_id: string | null
  dispute_status: 'active' | 'won' | 'lost' | null
  compensated_credits: string
  created_at: Date | string
}
const conflict = () => new ImageCreditError('IMAGE_PAYMENT_CONFLICT', 409, 'Payment does not match its saved purchase identity')
const missing = () => new ImageCreditError('IMAGE_PURCHASE_NOT_FOUND', 404, 'Credit purchase not found')
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ImageCreditError('IMAGE_PAYMENT_INVALID', 400, 'Invalid test payment details')
  return result.data
}
function key(scope: CreditScope, id: string) {
  if (scope.environment !== 'staging') throw missing()
  return [scope.tenantId, scope.clientId, scope.environment, parse(z.string().uuid(), id)]
}
/** Trusted transaction primitives. Native authority owns purchase writes;
 * verified provider observations own journal changes. Wallet precedes intent. */
export async function readImagePurchase(db: PageStudioControlQueryClient, scope: CreditScope, id: string): Promise<ImagePurchase> {
  const row = (await db.query<ImagePurchase>(`SELECT * FROM page_studio_image_purchases
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND intent_id=$4`, key(scope, id))).rows[0]
  if (!row) throw missing()
  row.pack = parse(ImageCreditPackSchema, row.pack)
  return row
}
async function locked(db: PageStudioControlQueryClient, scope: CreditScope, id: string) {
  key(scope, id)
  await lockImageCreditWallet(db, scope)
  await db.query(`SELECT intent_id FROM page_studio_image_purchases WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND intent_id=$4 FOR UPDATE`, key(scope, id))
  return readImagePurchase(db, scope, id)
}
export async function createImagePurchaseIntent(db: PageStudioControlQueryClient, scope: CreditScope, input: z.infer<typeof Intent>) {
  const intent = parse(Intent, input)
  key(scope, intent.intentId)
  await lockImageCreditWallet(db, scope)
  const fingerprint = await collectionDigest({ scope, ...intent })
  await db.query(`INSERT INTO page_studio_image_purchases(intent_id,tenant_id,client_id,environment,site_id,actor_id,account_id,pack,fingerprint,return_origin)
    VALUES($4,$1,$2,$3,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(intent_id) DO NOTHING`,
  [...key(scope, intent.intentId), intent.siteId, intent.actorId, intent.accountId, JSON.stringify(intent.pack), fingerprint, intent.returnOrigin])
  const row = await readImagePurchase(db, scope, intent.intentId)
  if (row.fingerprint !== fingerprint) throw conflict()
  return row
}
export async function bindImagePurchaseCustomer(db: PageStudioControlQueryClient, scope: CreditScope, id: string, input: string) {
  const customer = parse(providerId('cus'), input)
  const row = await locked(db, scope, id)
  if (row.customer_id && row.customer_id !== customer) throw conflict()
  await db.query(`UPDATE page_studio_image_purchases SET customer_id=$5,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND intent_id=$4`, [...key(scope, id), customer])
  return readImagePurchase(db, scope, id)
}
export async function bindImagePurchaseCheckout(db: PageStudioControlQueryClient, scope: CreditScope, id: string, input: z.infer<typeof Checkout>) {
  const checkout = parse(Checkout, input)
  const row = await locked(db, scope, id)
  if (!row.customer_id || (row.checkout_id && row.checkout_id !== checkout.checkoutId) || (row.checkout_url && row.checkout_url !== checkout.url)) throw conflict()
  await db.query(`UPDATE page_studio_image_purchases SET checkout_id=$5,checkout_url=$6,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND intent_id=$4`, [...key(scope, id), checkout.checkoutId, checkout.url])
  return readImagePurchase(db, scope, id)
}
function nextDispute(row: ImagePurchase, observation: ImagePaymentObservation) {
  const next = observation.dispute
  if (!next) return { id: row.dispute_id, status: row.dispute_status }
  if (row.dispute_id && row.dispute_id !== next.id) throw conflict()
  const terminal = row.dispute_status === 'won' || row.dispute_status === 'lost'
  if (terminal && next.status !== 'active' && next.status !== row.dispute_status) throw conflict()
  return { id: next.id, status: terminal ? row.dispute_status : next.status }
}
async function reconcileRefunds(db: PageStudioControlQueryClient, row: ImagePurchase, observation: ImagePaymentObservation) {
  for (const refund of observation.refunds ?? []) {
    await db.query(`INSERT INTO page_studio_image_payment_refunds(account_id,refund_id,intent_id,amount_minor,status)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id,refund_id) DO NOTHING`, [row.account_id, refund.id, row.intent_id, refund.amountMinor, refund.status])
    const saved = (await db.query<{ intent_id: string, amount_minor: string, status: string }>(`SELECT intent_id,amount_minor,status
      FROM page_studio_image_payment_refunds WHERE account_id=$1 AND refund_id=$2`, [row.account_id, refund.id])).rows[0]
    if (!saved || saved.intent_id !== row.intent_id || Number(saved.amount_minor) !== refund.amountMinor) throw conflict()
    if (saved.status !== 'failed' && saved.status !== 'canceled') {
      await db.query('UPDATE page_studio_image_payment_refunds SET status=$3 WHERE account_id=$1 AND refund_id=$2', [row.account_id, refund.id, refund.status])
    }
  }
  const totals = (await db.query<{ gross: string, reinstated: string }>(`SELECT COALESCE(SUM(amount_minor),0) AS gross,
    COALESCE(SUM(CASE WHEN status IN ('failed','canceled') THEN amount_minor ELSE 0 END),0) AS reinstated
    FROM page_studio_image_payment_refunds WHERE intent_id=$1`, [row.intent_id])).rows[0]!
  const gross = Math.max(Number(row.refunded_minor), observation.refundedMinor, Number(totals.gross))
  const net = gross - Number(totals.reinstated)
  if (!Number.isSafeInteger(net) || net < 0 || net > row.pack.amountMinor) throw conflict()
  return { gross, net }
}
/** A verified paid snapshot is the only grant trigger; refunds/disputes are
 * remembered before fulfillment, so a delayed paid event cannot mint their value.
 * The caller has verified the raw Stripe signature and retrieved the provider
 * objects; this function must never be exposed as a browser mutation. */
export async function observeImagePayment(db: PageStudioControlQueryClient, scope: CreditScope, id: string, input: ImagePaymentObservation) {
  const observation = parse(Observation, input)
  const row = await locked(db, scope, id)
  if (row.account_id !== observation.accountId || row.customer_id !== observation.customerId
    || (row.checkout_id && row.checkout_id !== observation.checkoutId) || row.pack.amountMinor !== observation.amountMinor
    || row.pack.currency !== observation.currency || (row.payment_id && row.payment_id !== observation.paymentId)
    || (row.charge_id && row.charge_id !== observation.chargeId)) throw conflict()
  const previous = (await db.query<{ intent_id: string, fingerprint: string }>(`SELECT intent_id,fingerprint FROM page_studio_image_payment_events
    WHERE account_id=$1 AND event_id=$2`, [observation.accountId, observation.eventId])).rows[0]
  if (previous) {
    if (previous.intent_id !== id || previous.fingerprint !== observation.eventFingerprint) throw conflict()
    return readImageCredits(db, scope)
  }
  const refunded = await reconcileRefunds(db, row, observation)
  const dispute = nextDispute(row, observation)
  const held = dispute.status === 'active' || dispute.status === 'lost'
  const funded = row.funded || observation.paid
  // Ceil proportional credits using integers, avoiding floating-point overflows.
  const refundCredits = Number((BigInt(refunded.net) * BigInt(row.pack.credits) + BigInt(row.pack.amountMinor - 1)) / BigInt(row.pack.amountMinor))
  const compensated = funded ? Math.max(refundCredits, held ? row.pack.credits : 0) : 0
  if (funded && !row.funded) {
    await grantImageCredits(db, scope, { entryId: `stripe:${id}`, credits: row.pack.credits, fingerprint: row.fingerprint })
  }
  const delta = Number(row.compensated_credits) - compensated
  if (delta) {
    await db.query(`UPDATE page_studio_image_wallets SET balance=balance+$4,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND client_id=$2 AND environment=$3`, [scope.tenantId, scope.clientId, scope.environment, delta])
    await db.query(`INSERT INTO page_studio_image_credit_entries(tenant_id,client_id,environment,entry_id,kind,credit_delta,reserved_delta,fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,0,$7)`, [scope.tenantId, scope.clientId, scope.environment,
      `payment:${observation.accountId}:${observation.eventId}`, delta > 0 ? 'reinstatement' : held ? 'dispute' : 'refund', delta, observation.eventFingerprint])
  }
  await db.query(`UPDATE page_studio_image_purchases SET checkout_id=$5,payment_id=$6,charge_id=$7,funded=$8,refunded_minor=$9,
    dispute_id=$10,dispute_status=$11,compensated_credits=$12,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND intent_id=$4`,
  [...key(scope, id), observation.checkoutId, observation.paymentId, observation.chargeId, funded, refunded.gross, dispute.id, dispute.status, compensated])
  // Restrictions are sticky: a billing review clears them after all disputes and
  // reservations are reconciled. Never clear an unrelated manual account freeze.
  await db.query(`UPDATE page_studio_image_wallets SET frozen=TRUE,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND ($4::boolean OR balance<reserved)`,
  [scope.tenantId, scope.clientId, scope.environment, held])
  await db.query(`INSERT INTO page_studio_image_payment_events(account_id,event_id,intent_id,fingerprint,observation)
    VALUES($1,$2,$3,$4,$5::jsonb)`, [observation.accountId, observation.eventId, id, observation.eventFingerprint, JSON.stringify(observation)])
  return readImageCredits(db, scope)
}
