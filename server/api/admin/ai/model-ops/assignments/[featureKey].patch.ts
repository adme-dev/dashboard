import { requireRole } from '~~/server/utils/auth'
import {
  findEditableAssignmentFeature,
  listAiModelAssignments,
  modelIdIsCatalogued,
  upsertAiModelAssignment
} from '~~/server/utils/ai/modelAssignments'

const PROVIDERS = new Set(['groq', 'anthropic', 'workers_ai', 'minimax'])

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

  const feature = findEditableAssignmentFeature(featureKey)
  if (!feature.ok) throw createError({ statusCode: feature.reason.startsWith('Unknown') ? 404 : 409, statusMessage: feature.reason })
  if (!PROVIDERS.has(provider)) throw createError({ statusCode: 400, statusMessage: 'Unsupported model provider.' })
  if (!modelIdIsCatalogued(modelId)) throw createError({ statusCode: 400, statusMessage: 'Unsupported model ID.' })
  if (fallbackModelId && !modelIdIsCatalogued(fallbackModelId)) {
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
