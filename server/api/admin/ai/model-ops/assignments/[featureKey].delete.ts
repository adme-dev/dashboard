import { requireRole } from '~~/server/utils/auth'
import {
  findEditableAssignmentFeature,
  listAiModelAssignments,
  resetAiModelAssignment
} from '~~/server/utils/ai/modelAssignments'

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const featureKey = cleanString(event.context.params?.featureKey)
  const feature = findEditableAssignmentFeature(featureKey)
  if (!feature.ok) throw createError({ statusCode: feature.reason.startsWith('Unknown') ? 404 : 409, statusMessage: feature.reason })

  await resetAiModelAssignment(featureKey, user?.id ?? null)
  return await listAiModelAssignments()
})
