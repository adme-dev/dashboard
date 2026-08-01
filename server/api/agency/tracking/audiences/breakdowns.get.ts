import type { AudienceBreakdownDimension } from '~~/app/types/audience-analytics'
import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { parseAudienceRange } from '~~/server/utils/tracking/audience-analytics'
import { getAudienceBreakdowns } from '~~/server/utils/tracking/audience-repository'

const DIMENSIONS = new Set<AudienceBreakdownDimension>([
  'source',
  'campaign',
  'page',
  'paid_organic',
  'device',
  'interest'
])

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const dimension = stringValue(query.dimension) ?? 'source'
  if (!DIMENSIONS.has(dimension as AudienceBreakdownDimension)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown audience dimension' })
  }

  const range = parseAudienceRange({
    from: stringValue(query.from),
    to: stringValue(query.to)
  })
  const { clientIds } = await requireTrackingAudienceScope(event, stringValue(query.clientId))
  return getAudienceBreakdowns({
    range,
    clientIds,
    dimension: dimension as AudienceBreakdownDimension
  })
})
