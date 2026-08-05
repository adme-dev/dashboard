import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { getGoogleAiMaxReadinessDetail } from '~~/server/utils/googleAiMaxReadiness'

const StateIdSchema = z.string().uuid()

export default eventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  }

  const parsedId = StateIdSchema.safeParse(getRouterParam(event, 'id'))
  if (!parsedId.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AI Max readiness id' })
  }

  const detail = await getGoogleAiMaxReadinessDetail(tenantId, parsedId.data)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'AI Max campaign not found' })
  }
  return detail
})
