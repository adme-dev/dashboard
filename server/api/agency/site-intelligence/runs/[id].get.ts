import { isUuid, requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { getSiteIntelligenceRunRead } from '~~/server/utils/siteIntelligence/repository'

export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, 'id')
  if (!isUuid(runId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid site intelligence run id' })
  }
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : undefined
  const scope = await requireTrackingAudienceScope(event, clientId)
  const result = await getSiteIntelligenceRunRead({ clientIds: scope.clientIds, runId: runId! })
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Site intelligence run not found' })
  }
  return result
})
