import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { listSiteIntelligenceDomains } from '~~/server/utils/siteIntelligence/repository'

const LANES = new Set(['owned', 'competitor'])
const STATUSES = new Set(['active', 'paused'])

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : undefined
  const lane = typeof query.lane === 'string' && LANES.has(query.lane)
    ? query.lane as 'owned' | 'competitor'
    : undefined
  const status = typeof query.status === 'string' && STATUSES.has(query.status)
    ? query.status as 'active' | 'paused'
    : undefined

  if (query.lane !== undefined && lane === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown site intelligence lane' })
  }
  if (query.status !== undefined && status === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown site intelligence status' })
  }

  const scope = await requireTrackingAudienceScope(event, clientId)
  const domains = await listSiteIntelligenceDomains(scope.clientIds, { clientId, lane, status })
  return { domains }
})
