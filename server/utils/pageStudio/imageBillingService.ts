import { z } from 'zod'
import type { ContentAuthorityRequest } from './businessContent'
import { withImageBillingAuthority } from './imageBillingAuthority'
import { withImageGenerationAuthority } from './imageGenerationAuthority'
import { ImageCreditError } from './imageCredits'
import { imagePaymentPack, readImagePaymentConfig } from './imagePaymentConfig'
import { bindImagePurchaseCheckout, bindImagePurchaseCustomer, createImagePurchaseIntent, readImagePurchase, type ImagePurchase } from './imagePayments'
import { runImageCheckout } from './imageCheckout'

function paymentScope(scope: { tenantId: string, clientId: string, environment: string }) {
  if (scope.environment !== 'staging') throw new ImageCreditError('IMAGE_PAYMENTS_UNAVAILABLE', 503, 'Image credit top-ups are not configured')
  return { tenantId: scope.tenantId, clientId: scope.clientId, environment: 'staging' as const }
}

export const ImageCheckoutInput = z.object({ intentId: z.string().uuid(), packId: z.string().min(1).max(80), packVersion: z.string().min(1).max(80) }).strict()
export const ImageReceiptInput = z.object({ intentId: z.string().uuid() }).strict()
export function imagePurchaseReceipt(row: ImagePurchase) {
  return { intentId: row.intent_id, pack: row.pack, createdAt: new Date(row.created_at).toISOString(),
    status: row.funded ? 'confirmed' : 'pending', refundedMinor: Number(row.refunded_minor),
    disputeStatus: row.dispute_status, compensatedCredits: Number(row.compensated_credits) }
}
export async function imageBillingCatalog(request: ContentAuthorityRequest) {
  return withImageGenerationAuthority(request, false, async (db, context) => {
    if (!context.canPurchase) return { available: false, canPurchase: false, mode: 'test', packs: [] }
    const purchases = (await db.query<ImagePurchase>(`SELECT * FROM page_studio_image_purchases
      WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 ORDER BY created_at DESC,intent_id DESC LIMIT 20`,
    [context.scope.tenantId, context.scope.clientId, context.scope.environment])).rows.map(imagePurchaseReceipt)
    try {
      const config = readImagePaymentConfig(request.env, paymentScope(context.scope))
      return { available: Boolean(config.provider), canPurchase: true, mode: config.mode, packs: config.packs, purchases }
    } catch { return { available: false, canPurchase: true, mode: 'test', packs: [], purchases } }
  })
}
export async function imageBillingReceipt(request: ContentAuthorityRequest, input: z.infer<typeof ImageReceiptInput>) {
  const { intentId } = ImageReceiptInput.parse(input)
  // Historical receipts remain readable when checkout configuration is disabled.
  return withImageBillingAuthority(request, async (db, context) => imagePurchaseReceipt(await readImagePurchase(db, paymentScope(context.scope), intentId)))
}
export async function createImageCheckout(request: ContentAuthorityRequest, input: z.infer<typeof ImageCheckoutInput>) {
  const parsed = ImageCheckoutInput.parse(input)
  const initial = await withImageBillingAuthority(request, async (db, context) => {
    const config = readImagePaymentConfig(request.env, paymentScope(context.scope))
    if (!config.provider) throw new ImageCreditError('IMAGE_PAYMENTS_UNAVAILABLE', 503, 'Image credit top-ups are not configured')
    let row: ImagePurchase
    try {
      row = await readImagePurchase(db, paymentScope(context.scope), parsed.intentId)
      if (row.site_id !== context.scope.siteId || row.actor_id !== context.actor.actorId || row.account_id !== config.accountId
        || row.pack.id !== parsed.packId || row.pack.version !== parsed.packVersion) {
        throw new ImageCreditError('IMAGE_CHECKOUT_CONFLICT', 409, 'Checkout does not match its saved purchase')
      }
    } catch (error) {
      if (!(error instanceof ImageCreditError) || error.code !== 'IMAGE_PURCHASE_NOT_FOUND') throw error
      row = await createImagePurchaseIntent(db, paymentScope(context.scope), { intentId: parsed.intentId, siteId: context.scope.siteId,
        actorId: context.actor.actorId, accountId: config.accountId, returnOrigin: config.origin,
        pack: imagePaymentPack(config, parsed.packId, parsed.packVersion) })
    }
    return { config, row }
  })
  const admitted = <T>(work: Parameters<typeof withImageBillingAuthority<T>>[1]) => withImageBillingAuthority(request, async (db, context) => {
    const row = await readImagePurchase(db, paymentScope(context.scope), parsed.intentId)
    if (row.fingerprint !== initial.row.fingerprint || row.actor_id !== context.actor.actorId || row.site_id !== context.scope.siteId) {
      throw new ImageCreditError('IMAGE_CHECKOUT_CONFLICT', 409, 'Checkout does not match its saved purchase')
    }
    return work(db, context)
  })
  return runImageCheckout(initial.config, {
    read: () => admitted((db, context) => readImagePurchase(db, paymentScope(context.scope), parsed.intentId)),
    saveCustomer: id => admitted((db, context) => bindImagePurchaseCustomer(db, paymentScope(context.scope), parsed.intentId, id)),
    saveCheckout: (id, url) => admitted((db, context) => bindImagePurchaseCheckout(db, paymentScope(context.scope), parsed.intentId, { checkoutId: id, url }))
  })
}
