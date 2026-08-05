import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import {
  listGoogleAiMaxReadiness,
  parseGoogleAiMaxReadinessQuery,
} from '~~/server/utils/googleAiMaxReadiness'

export default eventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  }

  let filters
  try {
    filters = parseGoogleAiMaxReadinessQuery(getQuery(event))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AI Max readiness query' })
  }

  return listGoogleAiMaxReadiness({ tenantId, filters })
})
