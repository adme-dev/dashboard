import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { parseAudienceRange } from '~~/server/utils/tracking/audience-analytics'
import { getSiteIntelligenceOverviewRead } from '~~/server/utils/siteIntelligence/repository'

const LANES = new Set(['owned', 'competitor'])

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clientId = stringValue(query.clientId)
  const laneValue = stringValue(query.lane)
  if (query.lane !== undefined && (!laneValue || !LANES.has(laneValue))) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown site intelligence lane' })
  }
  const range = parseAudienceRange({
    from: stringValue(query.from),
    to: stringValue(query.to)
  })
  const scope = await requireTrackingAudienceScope(event, clientId)
  return getSiteIntelligenceOverviewRead({
    clientIds: scope.clientIds,
    range,
    ...(laneValue ? { lane: laneValue as 'owned' | 'competitor' } : {})
  })
})
