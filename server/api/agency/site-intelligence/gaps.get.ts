import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { parseAudienceRange } from '~~/server/utils/tracking/audience-analytics'
import { getSiteIntelligenceGapsRead } from '~~/server/utils/siteIntelligence/repository'

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function boundedLimit(value: unknown): number {
  if (value === undefined) return 25
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid limit' })
  }
  return Math.min(50, Math.max(1, Number(value)))
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clientId = stringValue(query.clientId)
  const range = parseAudienceRange({
    from: stringValue(query.from),
    to: stringValue(query.to)
  })
  const scope = await requireTrackingAudienceScope(event, clientId)
  return getSiteIntelligenceGapsRead({
    clientIds: scope.clientIds,
    range,
    limit: boundedLimit(query.limit)
  })
})
