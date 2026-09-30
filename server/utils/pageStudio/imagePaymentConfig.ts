import { z } from 'zod'
import type { CreditScope } from './imageCredits'
import { ImageCreditError } from './imageCredits'

const identifier = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const ImageCreditPackSchema = z.object({
  id: identifier,
  version: identifier,
  currency: z.literal('aud'),
  amountMinor: z.number().int().min(50).max(10_000_000),
  credits: z.number().int().min(1).max(1_000_000_000)
}).strict()
export type ImageCreditPack = z.infer<typeof ImageCreditPackSchema>
const Scope = z.object({ tenantId: identifier, clientId: z.string().uuid(), environment: z.literal('staging') }).strict()
export const ImagePaymentOriginSchema = z.string().url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
    && url.hostname.includes('.') && !/^[\d.]+$/.test(url.hostname) && !url.hostname.endsWith('.localhost')
})
const Config = z.object({
  mode: z.literal('test'),
  accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/).max(128),
  origin: ImagePaymentOriginSchema,
  scopes: z.array(Scope).max(20),
  packs: z.array(ImageCreditPackSchema).min(1).max(10)
}).strict().refine(value => new Set(value.packs.map(pack => pack.id)).size === value.packs.length)
export type ImagePaymentConfig = z.infer<typeof Config> & { secretKey: string, webhookSecret: string }
const unavailable = () => new ImageCreditError('IMAGE_PAYMENTS_UNAVAILABLE', 503, 'Image credit top-ups are not configured')

/** Configuration is server-owned, test-only and explicitly scoped. Never log it. */
export function readImagePaymentConfig(env: Record<string, unknown>, scope?: CreditScope): ImagePaymentConfig {
  try {
    if (typeof env.PAGE_STUDIO_IMAGE_PAYMENTS !== 'string' || env.PAGE_STUDIO_IMAGE_PAYMENTS.length > 16_000) throw unavailable()
    const config = Config.parse(JSON.parse(env.PAGE_STUDIO_IMAGE_PAYMENTS))
    const secretKey = z.string().regex(/^sk_test_[A-Za-z0-9]+$/).max(256).parse(env.PAGE_STUDIO_IMAGE_STRIPE_SECRET)
    const webhookSecret = z.string().regex(/^whsec_[A-Za-z0-9]+$/).max(256).parse(env.PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET)
    if (scope && !config.scopes.some(value => value.tenantId === scope.tenantId && value.clientId === scope.clientId && value.environment === scope.environment)) throw unavailable()
    return { ...config, secretKey, webhookSecret }
  } catch { throw unavailable() }
}

export function imagePaymentPack(config: ImagePaymentConfig, id: string, version: string): ImageCreditPack {
  const pack = config.packs.find(value => value.id === id && value.version === version)
  if (!pack) throw new ImageCreditError('IMAGE_PAYMENT_PRICE_CHANGED', 409, 'Review the current credit pack price before continuing')
  return pack
}
