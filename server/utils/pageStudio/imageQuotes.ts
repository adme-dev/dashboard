import { z } from 'zod'
import { ImageActorSchema, ImageModelIdSchema, ImageQuoteRequestSchema, ImageQuoteSchema, type ImageQuote } from '~~/shared/pageStudio/imageGeneration'
import { PageStudioContentScopeSchema, samePageStudioContentScope, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { assertNonVehicleImagePrompt } from '../creative-generation/promptPolicy'
import { ImageCreditError } from './imageCredits'

const ConfigSchema = z.object({
  gatewayId: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
  priceVersion: z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  scopes: z.array(PageStudioContentScopeSchema).min(1).max(20),
  models: z.array(z.object({ id: ImageModelIdSchema, credits: z.number().int().min(1).max(1_000_000_000) }).strict()).min(1).max(2)
}).strict().refine(value => new Set(value.models.map(model => model.id)).size === value.models.length)
type ImageGenerationConfig = z.infer<typeof ConfigSchema>
const unavailable = () => new ImageCreditError('IMAGE_GENERATION_UNAVAILABLE', 503, 'Image generation is not configured for this website')
const invalid = () => new ImageCreditError('IMAGE_QUOTE_INVALID', 400, 'Check the image description, model and size')
const models = {
  '@cf/black-forest-labs/flux-1-schnell': { name: 'FLUX.1 Schnell', description: 'Fast image generation at the model’s native size.', aspects: ['native'] as const },
  '@cf/stabilityai/stable-diffusion-xl-base-1.0': { name: 'Stable Diffusion XL', description: 'Image generation with a choice of landscape or square sizes.', aspects: ['1:1', '16:9', '3:2'] as const }
}
const dimensions = { '1:1': { width: 1024, height: 1024 }, '16:9': { width: 1024, height: 576 }, '3:2': { width: 1152, height: 768 } }

/** Admission is explicit per synthetic site; no defaults or live-price guesses. */
export function readImageGenerationConfig(env: Record<string, unknown>, scope: PageStudioContentScope): ImageGenerationConfig {
  try {
    if (typeof env.PAGE_STUDIO_IMAGE_CONFIG !== 'string' || env.PAGE_STUDIO_IMAGE_CONFIG.length > 16000) throw unavailable()
    const config = ConfigSchema.parse(JSON.parse(env.PAGE_STUDIO_IMAGE_CONFIG))
    assertScope(config, scope)
    return config
  } catch { throw unavailable() }
}
function assertScope(config: ImageGenerationConfig, input: PageStudioContentScope) {
  const scope = PageStudioContentScopeSchema.parse(input)
  if (scope.environment !== 'staging' || scope.businessId !== scope.clientId
    || !config.scopes.some(admitted => samePageStudioContentScope(admitted, scope))) throw unavailable()
}
export function imageModelCatalog(config: ImageGenerationConfig) {
  return config.models.map(model => ({ ...models[model.id], ...model, aspects: [...models[model.id].aspects], priceVersion: config.priceVersion }))
}

/** Pure quote construction. Persist before displaying; caller owns native auth. */
export async function buildImageQuote(config: ImageGenerationConfig, scope: PageStudioContentScope, actor: z.infer<typeof ImageActorSchema>, input: unknown, now = new Date()): Promise<ImageQuote> {
  assertScope(config, scope)
  const parsed = ImageQuoteRequestSchema.safeParse(input)
  const owner = ImageActorSchema.safeParse(actor)
  if (!parsed.success || !owner.success || !Number.isFinite(now.getTime())) throw invalid()
  const request = parsed.data
  const model = imageModelCatalog(config).find(item => item.id === request.modelId)
  if (!model || !(model.aspects as readonly string[]).includes(request.aspect)) throw invalid()
  try {
    assertNonVehicleImagePrompt(request.prompt)
  } catch {
    throw invalid()
  }
  const binding = { scope, actor: owner.data, ...request, credits: model.credits, priceVersion: config.priceVersion,
    gatewayId: config.gatewayId, dimensions: request.aspect === 'native' ? null : dimensions[request.aspect], policyVersion: 'non-vehicle-v1' as const }
  return ImageQuoteSchema.parse({ ...binding, quoteId: crypto.randomUUID(), fingerprint: await collectionDigest(binding), expiresAt: new Date(now.getTime() + 600_000).toISOString() })
}
