import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'

function isImagePromptText(value: string): boolean {
  return Array.from(value).every((character) => {
    const code = character.codePointAt(0)!
    return [9, 10, 13].includes(code) || (code >= 32 && code !== 127 && !(code >= 0xd800 && code <= 0xdfff))
  })
}

export const ImageModelIdSchema = z.enum(['@cf/black-forest-labs/flux-1-schnell', '@cf/stabilityai/stable-diffusion-xl-base-1.0'])
export const ImageAspectSchema = z.enum(['native', '1:1', '16:9', '3:2'])
export const ImageQuoteRequestSchema = z.object({
  intentId: z.string().uuid(),
  modelId: ImageModelIdSchema,
  prompt: z.string().trim().min(1).max(2048).refine(isImagePromptText, 'Use plain text in the image description'),
  aspect: ImageAspectSchema
}).strict()
export const ImageActorSchema = z.object({ actorId: z.string().min(1).max(128), actorRole: z.enum(['agency', 'client']) }).strict()
export const ImageQuoteSchema = ImageQuoteRequestSchema.extend({
  quoteId: z.string().uuid(),
  scope: PageStudioContentScopeSchema,
  actor: ImageActorSchema,
  credits: z.number().int().min(1).max(1_000_000_000),
  priceVersion: z.string().min(1).max(80),
  gatewayId: z.string().min(1).max(64),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  dimensions: z.object({ width: z.number().int().min(256).max(2048), height: z.number().int().min(256).max(2048) }).strict().nullable(),
  expiresAt: z.string().datetime(),
  policyVersion: z.literal('non-vehicle-v1')
}).strict()
export type ImageQuote = z.infer<typeof ImageQuoteSchema>
export type ImageQuoteRequest = z.infer<typeof ImageQuoteRequestSchema>

export const ImageQuoteReceiptSchema = ImageQuoteSchema.omit({ scope: true, actor: true, gatewayId: true, fingerprint: true, policyVersion: true })
export type ImageQuoteReceipt = z.infer<typeof ImageQuoteReceiptSchema>

export const ImageAssetSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  path: z.string().regex(/^\/assets\/[a-f0-9]{64}\.(png|jpg|webp)$/),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  bytes: z.number().int().min(1).max(10 * 1024 * 1024),
  width: z.number().int().min(256).max(2048),
  height: z.number().int().min(256).max(2048)
}).strict().refine(value => value.path === `/assets/${value.sha256}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[value.contentType]}`)
export type ImageAsset = z.infer<typeof ImageAssetSchema>
export const ImageJobStateSchema = z.enum(['queued', 'dispatched', 'reconciliation', 'succeeded', 'failed'])
export const ImageJobReceiptSchema = z.object({
  jobId: z.string().uuid(), quoteId: z.string().uuid(), state: ImageJobStateSchema,
  modelId: ImageModelIdSchema, credits: z.number().int().min(1).max(1_000_000_000),
  createdAt: z.string().datetime(), asset: ImageAssetSchema.nullable(),
  failureCode: z.enum(['provider-rejected', 'invalid-output', 'authority-revoked', 'dispatch-expired']).nullable()
}).strict()
export type ImageJobReceipt = z.infer<typeof ImageJobReceiptSchema>
export const ImageLibraryRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  before: z.object({ createdAt: z.string().datetime(), jobId: z.string().uuid() }).strict().optional()
}).strict()

export const ImageCreditBalanceSchema = z.object({
  balance: z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000),
  reserved: z.number().int().min(0).max(9_000_000_000_000),
  available: z.number().int().min(0).max(9_000_000_000_000), frozen: z.boolean()
}).strict()
export const ImageEditorOperationSchema = z.enum(['catalog', 'quote', 'generate', 'read', 'jobs', 'library'])
export type ImageEditorOperation = z.infer<typeof ImageEditorOperationSchema>
export const ImageEditorRequestSchemas = {
  catalog: z.object({}).strict(), quote: ImageQuoteRequestSchema,
  generate: z.object({ quoteId: z.string().uuid() }).strict(),
  read: z.object({ jobId: z.string().uuid() }).strict(),
  jobs: ImageLibraryRequestSchema, library: ImageLibraryRequestSchema
}
const ImageListReceiptSchema = z.object({ scope: PageStudioContentScopeSchema, items: z.array(ImageJobReceiptSchema).max(50), nextCursor: ImageLibraryRequestSchema.shape.before.unwrap().nullable() }).strict()
const ImageScopedJobSchema = z.object({ scope: PageStudioContentScopeSchema, job: ImageJobReceiptSchema }).strict()
export const ImageEditorResponseSchemas = {
  catalog: z.object({ scope: PageStudioContentScopeSchema, models: z.array(z.object({
    id: ImageModelIdSchema, name: z.string().min(1).max(80), description: z.string().max(300), aspects: z.array(ImageAspectSchema).min(1).max(4),
    credits: z.number().int().min(1).max(1_000_000_000), priceVersion: z.string().min(1).max(80)
  }).strict()).max(2), balance: ImageCreditBalanceSchema, canGenerate: z.boolean(), canPurchase: z.boolean() }).strict(),
  quote: z.object({ scope: PageStudioContentScopeSchema, quote: ImageQuoteReceiptSchema }).strict(),
  generate: ImageScopedJobSchema, read: ImageScopedJobSchema, jobs: ImageListReceiptSchema, library: ImageListReceiptSchema
}
export const ImageClaimSchema = z.discriminatedUnion('admitted', [
  z.object({ admitted: z.literal(false) }).strict(),
  z.object({ admitted: z.literal(true), quote: ImageQuoteSchema, dispatchToken: z.string().uuid() }).strict()
])
export const ImageWorkerDeliverySchema = z.object({
  kind: z.enum(['generate', 'reconcile']), jobId: z.string().uuid(), scope: PageStudioContentScopeSchema
}).strict()
export type ImageWorkerDelivery = z.infer<typeof ImageWorkerDeliverySchema>
export const ImageWorkerPollSchema = z.object({ deliveries: z.array(ImageWorkerDeliverySchema).max(40) }).strict()
