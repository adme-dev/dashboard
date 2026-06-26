import { requireRole } from '~~/server/utils/auth'
import {
  findEditableAssignmentFeature,
  listAiModelAssignments,
  modelProviderMatches,
  modelIdIsCatalogued,
  supportedProvidersForFeature,
  upsertAiModelAssignment
} from '~~/server/utils/ai/modelAssignments'
import {
  cloudflareModelIsCatalogued,
  cloudflareModelProviderMatches,
} from '~~/server/utils/ai/cloudflareModelCatalog'

const PROVIDERS = new Set(['groq', 'anthropic', 'workers_ai', 'minimax', 'aigateway'])

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const featureKey = cleanString(event.context.params?.featureKey)
  const body = await readBody(event)
  const provider = cleanString((body as any)?.provider)
  const modelId = cleanString((body as any)?.modelId)
  const fallbackModelId = cleanString((body as any)?.fallbackModelId) || null
  const notes = cleanString((body as any)?.notes) || null
  const cfEnv = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? null

  const feature = findEditableAssignmentFeature(featureKey)
  if (!feature.ok) throw createError({ statusCode: feature.reason.startsWith('Unknown') ? 404 : 409, statusMessage: feature.reason })
  if (!PROVIDERS.has(provider)) throw createError({ statusCode: 400, statusMessage: 'Unsupported model provider.' })
  if (!modelIdIsCatalogued(modelId) && !await cloudflareModelIsCatalogued(modelId, { env: cfEnv })) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported model ID.' })
  }
  if (!modelProviderMatches(provider, modelId) && !await cloudflareModelProviderMatches(provider, modelId, { env: cfEnv })) {
    throw createError({ statusCode: 400, statusMessage: 'Model ID does not match the selected provider.' })
  }
  const supportedProviders = supportedProvidersForFeature(featureKey)
  if (!supportedProviders) {
    throw createError({ statusCode: 400, statusMessage: 'This feature is not wired to runtime model assignments yet.' })
  }
  if (!supportedProviders.includes(provider as any)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider is not supported by this feature runtime yet.' })
  }
  if (fallbackModelId && !modelIdIsCatalogued(fallbackModelId) && !await cloudflareModelIsCatalogued(fallbackModelId, { env: cfEnv })) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported fallback model ID.' })
  }
  if (notes && notes.length > 500) throw createError({ statusCode: 400, statusMessage: 'Notes must be 500 characters or fewer.' })

  await upsertAiModelAssignment({
    featureKey,
    provider,
    modelId,
    fallbackModelId,
    notes,
    userId: user?.id ?? null,
  })

  return await listAiModelAssignments()
})
