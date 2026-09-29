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
